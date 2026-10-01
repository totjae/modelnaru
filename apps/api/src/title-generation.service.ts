import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  ChatProviderService,
  runtimeProviderFetch,
} from './chat-provider.service.js';
import { contextBudget, estimateInput } from './context-budget.js';
import { streamProvider } from './chat-streaming.js';
import { TitleGenerationRepository } from './title-generation.repository.js';

const prompt =
  'Generate a short conversation title. Return only one plain text line, with no quotes or explanation.';

export function normalizeTitle(text: string): string {
  return Array.from(text.replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim())
    .slice(0, 200)
    .join('');
}

@Injectable()
export class TitleGenerationService implements OnApplicationShutdown {
  private readonly active = new Set<AbortController>();
  private stopping = false;
  constructor(
    private readonly repository: TitleGenerationRepository,
    private readonly providers: ChatProviderService,
  ) {}

  recover() {
    return this.repository.recover();
  }
  onApplicationShutdown() {
    this.stopping = true;
    for (const controller of this.active) controller.abort();
  }

  async forJob(
    jobId: string,
    acquire: () => (() => void) | null,
  ): Promise<void> {
    if (this.stopping) return;
    const task = await this.repository.forJob(jobId);
    if (!task || this.stopping) return;
    const release = acquire();
    let usageId: string | undefined;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let title: string | null = null;
    let status: 'completed' | 'failed' | 'cancelled' = 'failed';
    let shouldFinish = true;
    const controller = new AbortController();
    this.active.add(controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15_000),
    ]);
    let checking = false;
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void this.repository
        .valid(task.id)
        .then((valid) => {
          if (!valid) controller.abort();
        })
        .catch(() => controller.abort())
        .finally(() => {
          checking = false;
        });
    }, 500);
    timer.unref();
    try {
      if (
        !release ||
        !task.providerModelId ||
        !(await this.repository.valid(task.id))
      )
        return;
      const runtime = await this.providers.resolve(task.providerModelId);
      const budget = contextBudget(
        runtime,
        runtime.contextWindow ?? 16_384,
        64,
      );
      const messages = [
        {
          role: 'user' as const,
          content: `User: ${Array.from(task.userText).slice(0, 1_000).join('')}\nAssistant: ${Array.from(task.assistantText).slice(0, 1_000).join('')}`,
        },
      ];
      if (estimateInput(prompt, messages) > budget.input) return;
      usageId = await this.repository.begin(task, runtime);
      if (!usageId) {
        shouldFinish = false;
        return;
      }
      signal.throwIfAborted();
      let text = '';
      for await (const event of streamProvider(
        {
          apiKey: runtime.apiKey,
          baseUrl: runtime.baseUrl,
          modelId: runtime.modelId,
          template: runtime.template,
          systemPrompt: prompt,
          messages,
          parameters: { maxOutputTokens: budget.output },
          signal,
          maximumGeneratedTextBytes: 4_096,
        },
        runtimeProviderFetch(runtime),
      )) {
        if (event.type === 'text_delta') text += event.text;
        if (event.type === 'usage') {
          inputTokens = event.inputTokens ?? inputTokens;
          outputTokens = event.outputTokens ?? outputTokens;
          await this.repository.tokens(usageId, inputTokens, outputTokens);
        }
      }
      signal.throwIfAborted();
      title = normalizeTitle(text);
      if (title) status = 'completed';
    } catch {
      status = controller.signal.aborted ? 'cancelled' : 'failed';
    } finally {
      clearInterval(timer);
      this.active.delete(controller);
      try {
        if (shouldFinish)
          await this.repository.finish(
            task,
            status,
            title,
            usageId,
            inputTokens,
            outputTokens,
          );
      } finally {
        release?.();
      }
    }
  }
}
