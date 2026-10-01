import { Injectable } from '@nestjs/common';
import { contextBudget, estimateInput } from './context-budget.js';

import type { ChatTurnRecord } from './chat-messages.repository.js';
import {
  ChatProviderService,
  runtimeProviderFetch,
} from './chat-provider.service.js';
import { streamProvider } from './chat-streaming.js';
import { providerTemplateById } from './provider-catalog.js';
import {
  normalizeProviderParameters,
  providerParameterPolicy,
  type ProviderGenerationParameters,
} from './provider-parameter-policy.js';
import {
  SummarizationRepository,
  type SummarizationSettings,
  type SummaryModelOption,
} from './summarization.repository.js';

type ContextMessage = ChatTurnRecord['context'][number];

export class ContextSummarizationUnavailableError extends Error {}

export function estimateContextSize(
  systemPrompt: string,
  context: Array<Pick<ContextMessage, 'content'>>,
): number {
  return estimateInput(systemPrompt, context);
}

@Injectable()
export class SummarizationService {
  constructor(
    private readonly repository: SummarizationRepository,
    private readonly providers: ChatProviderService,
  ) {}

  async adminState(): Promise<{
    models: Array<
      SummaryModelOption & {
        parameterPolicy?: ReturnType<typeof providerParameterPolicy>;
      }
    >;
    settings: SummarizationSettings;
  }> {
    const [settings, models] = await Promise.all([
      this.repository.getSettings(),
      this.repository.listModels(),
    ]);
    return {
      models: models.map((model) => {
        const template = providerTemplateById(model.templateId);
        return {
          ...model,
          ...(template
            ? {
                parameterPolicy: providerParameterPolicy(
                  template,
                  model.modelId,
                ),
              }
            : {}),
        };
      }),
      settings,
    };
  }

  async updateAdminSettings(input: {
    actorId: string;
    ipHash: Buffer | null;
    maxOutputTokens: number;
    prompt: string;
    providerModelId: string | null;
    temperature: number | null;
    topP: number | null;
    providerParameters: ProviderGenerationParameters;
  }): Promise<{ settings: SummarizationSettings }> {
    if (!input.providerModelId) {
      return {
        settings: await this.repository.updateSettings({
          ...input,
          providerParameters: {},
          temperature: null,
          topP: null,
        }),
      };
    }
    const runtime = await this.providers.resolve(input.providerModelId);
    const normalized = normalizeProviderParameters(
      runtime.template,
      runtime.modelId,
      {
        ...input.providerParameters,
        maxOutputTokens: input.maxOutputTokens,
        ...(input.temperature === null
          ? {}
          : { temperature: input.temperature }),
        ...(input.topP === null ? {} : { topP: input.topP }),
      },
    );
    const temperature = normalized.temperature ?? null;
    const topP = normalized.topP ?? null;
    const providerParameters = { ...normalized };
    delete providerParameters.maxOutputTokens;
    delete providerParameters.temperature;
    delete providerParameters.topP;
    return {
      settings: await this.repository.updateSettings({
        ...input,
        providerParameters,
        temperature,
        topP,
      }),
    };
  }

  async fitContext(input: {
    jobId?: string;
    beforeProviderSend?: () => Promise<void>;
    branchId: string;
    context: ContextMessage[];
    contextLimit: number;
    conversationId: string;
    signal?: AbortSignal;
    systemPrompt: string;
  }): Promise<ContextMessage[]> {
    if (
      !input.context.length ||
      estimateContextSize(input.systemPrompt, input.context.slice(-1)) >
        input.contextLimit
    )
      throw new ContextSummarizationUnavailableError();
    const settings = await this.repository.getSettings();
    if (!settings.providerModelId) {
      throw new ContextSummarizationUnavailableError();
    }
    const runtime = await this.providers
      .resolve(settings.providerModelId)
      .catch(() => {
        throw new ContextSummarizationUnavailableError();
      });
    const reused = await this.repository.findReusable(
      input.conversationId,
      input.context.map((message) => message.id),
      settings.providerModelId,
      settings.promptVersion,
    );
    if (reused) {
      const lastIndex = input.context.findIndex(
        (message) => message.id === reused.lastMessageId,
      );
      const fitted = [
        this.summaryMessage(reused.id, reused.summary),
        ...input.context.slice(lastIndex + 1),
      ];
      if (
        lastIndex + 1 === reused.coveredMessageCount &&
        input.context[0]?.id === reused.firstMessageId &&
        estimateContextSize(input.systemPrompt, fitted) <= input.contextLimit
      ) {
        return fitted;
      }
    }

    const prefix = this.prefixToSummarize(
      input.context,
      input.systemPrompt,
      input.contextLimit,
    );
    if (prefix.length === 0) {
      throw new ContextSummarizationUnavailableError();
    }
    const budget = contextBudget(
      runtime,
      runtime.contextWindow ?? 16_384,
      Math.min(settings.maxOutputTokens, 1_024),
    );
    const transcript = (messages: ContextMessage[], previous = '') =>
      (previous ? `[이전 요약]\n${previous}\n\n` : '') +
      messages
        .map(
          (message) =>
            `${message.role === 'user' ? '사용자' : 'AI'}: ${message.content}`,
        )
        .join('\n\n');
    const fits = (text: string) =>
      Array.from(text).length <= 12_000 &&
      estimateInput(settings.prompt, [{ content: text, role: 'user' }]) <=
        budget.input;
    if (prefix.some((message) => !fits(transcript([message]))))
      throw new ContextSummarizationUnavailableError();
    let summary = '';
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    const startedAt = Date.now();
    let offset = 0;
    for (let attempt = 1; offset < prefix.length; attempt++) {
      if (attempt > 4 || input.signal?.aborted)
        throw new ContextSummarizationUnavailableError();
      let end = offset;
      while (
        end < prefix.length &&
        fits(transcript(prefix.slice(offset, end + 1), summary))
      )
        end++;
      if (end === offset) throw new ContextSummarizationUnavailableError();
      const text = transcript(prefix.slice(offset, end), summary);
      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(60_000),
        ...(input.signal ? [input.signal] : []),
      ]);
      const usageId = await this.repository.beginAttempt({
        conversationId: input.conversationId,
        jobId: input.jobId,
        attempt,
        runtime,
      });
      let status: 'completed' | 'failed' | 'cancelled' = 'failed';
      let next = '';
      inputTokens = null;
      outputTokens = null;
      let checking = false;
      const timer = setInterval(() => {
        if (checking) return;
        checking = true;
        void this.providers
          .resolve(settings.providerModelId!)
          .catch(() => controller.abort())
          .finally(() => {
            checking = false;
          });
      }, 15_000);
      timer.unref();
      try {
        const currentRuntime = await this.providers.resolve(
          settings.providerModelId,
        );
        const currentBudget = contextBudget(
          currentRuntime,
          currentRuntime.contextWindow ?? 16_384,
          Math.min(settings.maxOutputTokens, 1_024),
        );
        if (
          estimateInput(settings.prompt, [{ content: text, role: 'user' }]) >
          currentBudget.input
        )
          throw new ContextSummarizationUnavailableError();
        await input.beforeProviderSend?.();
        signal.throwIfAborted();
        await this.repository.markAttemptSent(usageId);
        for await (const event of streamProvider(
          {
            apiKey: currentRuntime.apiKey,
            baseUrl: currentRuntime.baseUrl,
            messages: [{ content: text, role: 'user' }],
            modelId: currentRuntime.modelId,
            parameters: normalizeProviderParameters(
              currentRuntime.template,
              currentRuntime.modelId,
              {
                ...settings.providerParameters,
                maxOutputTokens: currentBudget.output,
                ...(settings.temperature !== null
                  ? { temperature: settings.temperature }
                  : {}),
                ...(settings.topP !== null ? { topP: settings.topP } : {}),
              },
            ),
            signal,
            maximumGeneratedTextBytes: 16_384,
            systemPrompt: settings.prompt,
            template: currentRuntime.template,
          },
          runtimeProviderFetch(currentRuntime),
        )) {
          if (event.type === 'text_delta') next += event.text;
          if (event.type === 'usage') {
            inputTokens = event.inputTokens ?? inputTokens;
            outputTokens = event.outputTokens ?? outputTokens;
            await this.repository.recordAttemptTokens(
              usageId,
              inputTokens,
              outputTokens,
            );
          }
        }
        signal.throwIfAborted();
        summary = next.trim();
        if (!summary) throw new ContextSummarizationUnavailableError();
        status = 'completed';
      } catch {
        status = input.signal?.aborted ? 'cancelled' : 'failed';
        throw new ContextSummarizationUnavailableError();
      } finally {
        clearInterval(timer);
        await this.repository.finishAttempt(
          usageId,
          status,
          inputTokens,
          outputTokens,
        );
      }
      offset = end;
    }
    summary = summary.trim();
    if (!summary) throw new ContextSummarizationUnavailableError();
    const first = prefix[0]!;
    const last = prefix.at(-1)!;
    const fitted = [
      this.summaryMessage(`summary:${last.id}`, summary),
      ...input.context.slice(prefix.length),
    ];
    if (
      input.signal?.aborted ||
      estimateContextSize(input.systemPrompt, fitted) > input.contextLimit
    )
      throw new ContextSummarizationUnavailableError();
    await this.repository.save({
      ...(input.jobId ? { jobId: input.jobId } : {}),
      branchId: input.branchId,
      conversationId: input.conversationId,
      coveredMessageCount: prefix.length,
      durationMs: Date.now() - startedAt,
      firstMessageId: first.id,
      inputTokens,
      lastMessageId: last.id,
      modelId: runtime.modelId,
      outputTokens,
      promptVersion: settings.promptVersion,
      providerModelId: settings.providerModelId,
      summary,
      templateId: runtime.template.id,
    });
    return fitted;
  }

  private prefixToSummarize(
    context: ContextMessage[],
    systemPrompt: string,
    limit: number,
  ): ContextMessage[] {
    if (context.length < 2) return [];
    let keepFrom = context.length - 1;
    while (
      keepFrom > 0 &&
      estimateContextSize(systemPrompt, context.slice(keepFrom - 1)) <=
        Math.floor(limit * 0.55)
    ) {
      keepFrom -= 1;
    }
    return context.slice(0, keepFrom);
  }

  private summaryMessage(id: string, summary: string): ContextMessage {
    return {
      content: `[이전 대화 요약]\n${summary}`,
      id,
      role: 'user',
    };
  }
}
