import { Injectable } from '@nestjs/common';

import type { ChatTurnRecord } from './chat-messages.repository.js';
import { ChatProviderService } from './chat-provider.service.js';
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
  return Array.from(
    `${systemPrompt}\n${context.map((message) => message.content).join('\n')}`,
  ).length;
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
    branchId: string;
    context: ContextMessage[];
    contextLimit: number;
    conversationId: string;
    signal?: AbortSignal;
    systemPrompt: string;
  }): Promise<ContextMessage[]> {
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
    const transcript = prefix
      .map(
        (message) =>
          `${message.role === 'user' ? '사용자' : 'AI'}: ${message.content}`,
      )
      .join('\n\n');
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
    let summary = '';
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    try {
      for await (const event of streamProvider({
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        messages: [{ content: transcript, role: 'user' }],
        modelId: runtime.modelId,
        parameters: normalizeProviderParameters(
          runtime.template,
          runtime.modelId,
          {
            maxOutputTokens: Math.min(
              settings.maxOutputTokens,
              runtime.maxOutputTokens ?? settings.maxOutputTokens,
            ),
            ...(settings.temperature !== null
              ? { temperature: settings.temperature }
              : {}),
            ...(settings.topP !== null ? { topP: settings.topP } : {}),
            ...settings.providerParameters,
          },
        ),
        signal: controller.signal,
        systemPrompt: settings.prompt,
        template: runtime.template,
      })) {
        if (event.type === 'text_delta') summary += event.text;
        if (event.type === 'usage') {
          inputTokens = event.inputTokens ?? inputTokens;
          outputTokens = event.outputTokens ?? outputTokens;
        }
      }
    } catch {
      throw new ContextSummarizationUnavailableError();
    } finally {
      input.signal?.removeEventListener('abort', abort);
    }
    summary = summary.trim();
    if (!summary) throw new ContextSummarizationUnavailableError();
    const first = prefix[0]!;
    const last = prefix.at(-1)!;
    await this.repository.save({
      branchId: input.branchId,
      conversationId: input.conversationId,
      coveredMessageCount: prefix.length,
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
    const fitted = [
      this.summaryMessage(`summary:${last.id}`, summary),
      ...input.context.slice(prefix.length),
    ];
    if (estimateContextSize(input.systemPrompt, fitted) > input.contextLimit) {
      throw new ContextSummarizationUnavailableError();
    }
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
