import { createHash } from 'node:crypto';

import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type BeforeApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { LoadedConfig } from '@modelnaru/config';

import { AccessService } from './access.service.js';
import { AttachmentsService } from './attachments.service.js';
import type { AuthenticatedPrincipal } from './auth.service.js';
import {
  ChatProviderService,
  runtimeProviderFetch,
  type ChatProviderRuntime,
} from './chat-provider.service.js';
import {
  type ChatJobRecord,
  ChatJobConflictError,
  ChatJobsRepository,
  type ChatJobKind,
  type StartChatJobInput,
} from './chat-jobs.repository.js';
import {
  fittingPrefix,
  jobFrameBytes,
  maximumJobFrameBytes,
  type JobCommitEvent,
} from './chat-job-events.js';
import type { ChatTurnRecord } from './chat-messages.repository.js';
import {
  type ChatParameters,
  buildProviderStreamRequest,
  ChatUpstreamError,
  providerSupportsNativeWebSearch,
  streamProviderRequest,
} from './chat-streaming.js';
import type { ChatPrincipal } from './chats.repository.js';
import { normalizeProviderParameters } from './provider-parameter-policy.js';
import {
  ContextSummarizationUnavailableError,
  estimateContextSize,
  SummarizationService,
} from './summarization.service.js';
import { RequestTraceService } from './request-trace.service.js';
import { DatabaseService } from './database.service.js';
import { MODELNARU_CONFIG } from './tokens.js';
import { contextBudget } from './context-budget.js';
import { TitleGenerationService } from './title-generation.service.js';

interface StartInput {
  principal: AuthenticatedPrincipal;
  conversationId: string;
  kind: ChatJobKind;
  idempotencyKey: string;
  settingsRevision: string;
  sessionId: string;
  absoluteExpiresAt: Date;
  content: string;
  attachmentIds: string[];
  regenerateAssistantMessageId?: string;
  providerModelId: string;
  parameters: ChatParameters;
}

interface ActiveRun {
  controller: AbortController;
  cancel: () => Promise<ChatJobRecord | null>;
}

function principalOf(value: AuthenticatedPrincipal): ChatPrincipal {
  if (value.type === 'admin') throw new Error('Admins cannot start chat jobs');
  return value;
}

function fingerprint(input: StartInput): Buffer {
  const sortedParameters = Object.fromEntries(
    Object.entries(input.parameters).sort(([a], [b]) => a.localeCompare(b)),
  );
  return createHash('sha256')
    .update(
      JSON.stringify({
        kind: input.kind,
        conversationId: input.conversationId,
        regenerateAssistantMessageId:
          input.regenerateAssistantMessageId ?? null,
        content: input.content.trim(),
        attachmentIds: input.attachmentIds,
        providerModelId: input.providerModelId,
        parameters: sortedParameters,
        settingsRevision: input.settingsRevision,
      }),
    )
    .digest();
}

@Injectable()
export class ChatJobsService
  implements OnModuleInit, BeforeApplicationShutdown
{
  private readonly logger = new Logger(ChatJobsService.name);
  private readonly active = new Map<string, ActiveRun>();
  private readonly listeners = new Map<
    string,
    Set<(event: JobCommitEvent) => void>
  >();
  private stopping = false;
  private readonly work = new Set<Promise<unknown>>();
  private slots = 0;
  private subscriberCount = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loaded: LoadedConfig,
    private readonly jobs: ChatJobsRepository,
    private readonly access: AccessService,
    private readonly providers: ChatProviderService,
    private readonly attachments: AttachmentsService,
    private readonly summarization: SummarizationService,
    private readonly traces: RequestTraceService,
    private readonly database: DatabaseService,
    @Optional() private readonly titles?: TitleGenerationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.database.ready();
    const recovered = await this.jobs.recover();
    if (recovered)
      this.logger.warn(`Recovered ${recovered} interrupted chat jobs`);
    await this.jobs.purgeExpired();
    await this.titles?.recover();
    this.cleanupTimer = setInterval(() => {
      void this.jobs
        .purgeExpired()
        .catch((error: unknown) =>
          this.logger.error('Chat job retention cleanup failed', error),
        );
    }, 3_600_000);
    this.cleanupTimer.unref();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.titles?.onApplicationShutdown();
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const run of this.active.values()) run.controller.abort();
    let timer: NodeJS.Timeout | undefined;
    const drained = async () => {
      while (this.work.size) await Promise.allSettled([...this.work]);
    };
    try {
      await Promise.race([
        drained(),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            this.logger.warn(
              'Shutdown grace expired; remaining jobs recover on restart',
            );
            resolve();
          }, this.loaded.config.server.shutdownGraceSeconds * 1000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.work.add(promise);
    void promise.then(
      () => this.work.delete(promise),
      () => this.work.delete(promise),
    );
    return promise;
  }

  async start(
    input: StartInput,
  ): Promise<{ job: ChatJobRecord; reused: boolean }> {
    if (this.stopping) throw new ChatJobConflictError('CHAT_SERVER_BUSY');
    return this.track(this.startJob(input));
  }

  private async startJob(
    input: StartInput,
  ): Promise<{ job: ChatJobRecord; reused: boolean }> {
    const principal = principalOf(input.principal);
    const requestFingerprint = fingerprint(input);
    const existing = await this.jobs.existing(
      principal,
      input.idempotencyKey,
      requestFingerprint,
    );
    if (existing) return { job: existing, reused: true };
    await this.access.assertModelAllowed(principal, input.providerModelId);
    const runtime = await this.providers.resolve(input.providerModelId);
    const normalized = normalizeProviderParameters(
      runtime.template,
      runtime.modelId,
      input.parameters,
    );
    const parameters = {
      ...normalized,
      maxOutputTokens: contextBudget(
        runtime,
        runtime.contextWindow ?? 16_384,
        normalized.maxOutputTokens,
      ).output,
    };
    let slotAcquired = false;
    const reserveSlot = () => {
      if (this.slots >= this.loaded.config.limits.maximumGlobalAiGenerations)
        return false;
      this.slots++;
      slotAcquired = true;
      return true;
    };
    const startInput: StartChatJobInput = {
      principal,
      conversationId: input.conversationId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      fingerprint: requestFingerprint,
      settingsRevision: input.settingsRevision,
      maximumGeneratedTextBytes:
        this.loaded.config.limits.maximumGeneratedTextBytes,
      startedSessionId: input.sessionId,
      attachmentIds: input.attachmentIds,
      content: input.content.trim(),
      ...(input.regenerateAssistantMessageId
        ? { regenerateAssistantMessageId: input.regenerateAssistantMessageId }
        : {}),
      providerModelId: input.providerModelId,
      modelId: runtime.modelId,
      templateId: runtime.template.id,
      parameters,
    };
    try {
      const result = await this.jobs.start(startInput, reserveSlot);
      if (!result.turn) {
        if (slotAcquired) this.slots--;
        return { job: result.job, reused: true };
      }
      const job = result.job;
      void this.track(
        this.run(job, result.turn, input, runtime, parameters)
          .catch((error: unknown) =>
            this.logger.error(
              `Chat job ${job.id} failed to settle`,
              error instanceof Error ? error.stack : undefined,
            ),
          )
          .finally(() => {
            this.slots--;
            return this.titles
              ?.forJob(job.id, () => {
                if (
                  this.slots >=
                  this.loaded.config.limits.maximumGlobalAiGenerations
                )
                  return null;
                this.slots++;
                return () => {
                  this.slots--;
                };
              })
              .catch(() => this.logger.error('Title task failed to settle'));
          }),
      );
      return { job, reused: false };
    } catch (error) {
      if (slotAcquired) this.slots--;
      throw error;
    }
  }

  async get(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    jobId: string,
  ): Promise<ChatJobRecord> {
    const job = await this.jobs.get(
      principalOf(principal),
      conversationId,
      jobId,
    );
    if (job.providerModelId)
      await this.access.assertModelAllowed(principal, job.providerModelId);
    return job;
  }

  async cancel(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
    jobId: string,
  ): Promise<void> {
    const job = await this.get(principalValue, conversationId, jobId);
    if (job.status !== 'pending' && job.status !== 'streaming')
      throw new ChatJobConflictError('CHAT_NOT_CANCELLABLE');
    const active = this.active.get(jobId);
    const completed = active
      ? await active.cancel()
      : await this.jobs.terminal(jobId, {
          status: 'cancelled',
          content: job.content,
          errorCode: 'CHAT_CANCELLED',
          inputTokens: job.inputTokens,
          outputTokens: job.outputTokens,
        });
    if (!completed) {
      const latest = await this.jobs.get(
        principalOf(principalValue),
        conversationId,
        jobId,
      );
      if (latest.status !== 'cancelled')
        throw new ChatJobConflictError('CHAT_NOT_CANCELLABLE');
      return;
    }
    if (completed.status !== 'cancelled')
      throw new ChatJobConflictError('CHAT_NOT_CANCELLABLE');
    active?.controller.abort();
    if (!active) this.publish(this.terminalEvent(completed, ''));
  }

  async subscribe(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
    jobId: string,
    callback: (event: JobCommitEvent) => void,
  ): Promise<{ job: ChatJobRecord; close: () => void }> {
    const principal = principalOf(principalValue);
    const perJob = this.listeners.get(jobId) ?? new Set();
    if (
      perJob.size >= this.loaded.config.limits.maximumSseSubscribersPerJob ||
      this.subscriberCount >=
        this.loaded.config.limits.maximumGlobalSseSubscribers
    ) {
      throw new ChatJobConflictError('CHAT_SERVER_BUSY');
    }
    perJob.add(callback);
    this.listeners.set(jobId, perJob);
    this.subscriberCount++;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      perJob.delete(callback);
      this.subscriberCount--;
      if (perJob.size === 0) this.listeners.delete(jobId);
    };
    try {
      const job = await this.get(principal, conversationId, jobId);
      return { job, close };
    } catch (error) {
      close();
      throw error;
    }
  }

  async sessionValid(
    sessionId: string,
    principalValue: AuthenticatedPrincipal,
  ): Promise<boolean> {
    return this.jobs.sessionValid(sessionId, principalOf(principalValue));
  }

  async subscriptionValid(
    sessionId: string,
    principalValue: AuthenticatedPrincipal,
    job: ChatJobRecord,
  ): Promise<boolean> {
    if (!(await this.sessionValid(sessionId, principalValue))) return false;
    if (!job.providerModelId) return true;
    try {
      await this.access.assertModelAllowed(principalValue, job.providerModelId);
      return true;
    } catch {
      return false;
    }
  }

  get maximumPendingBytes(): number {
    return this.loaded.config.limits.maximumSsePendingBytes;
  }

  private publish(event: JobCommitEvent): void {
    for (const listener of this.listeners.get(event.jobId) ?? []) {
      try {
        listener(event);
      } catch {
        /* A subscriber cannot stop generation. */
      }
    }
  }

  private terminalEvent(job: ChatJobRecord, text: string): JobCommitEvent {
    return {
      jobId: job.id,
      name: 'terminal',
      revision: job.revision,
      data: {
        revision: job.revision,
        text,
        status: job.status,
        errorCode: job.errorCode,
        inputTokens: job.inputTokens,
        outputTokens: job.outputTokens,
        finishedAt: job.finishedAt?.toISOString() ?? null,
      },
    };
  }

  private async run(
    job: ChatJobRecord,
    turn: ChatTurnRecord,
    input: StartInput,
    runtime: ChatProviderRuntime,
    parameters: ChatParameters,
  ): Promise<void> {
    const controller = new AbortController();
    if (this.stopping) controller.abort();
    let lifetimeExpired = false;
    const lifetime = setTimeout(
      () => {
        lifetimeExpired = true;
        controller.abort();
      },
      Math.max(0, 1_800_000 - (Date.now() - job.startedAt.getTime())),
    );
    lifetime.unref();
    let content = '';
    let checkpointContent = '';
    let pending = '';
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let traceId: string | null = null;
    let finalized = false;
    let settlement: Promise<ChatJobRecord | null> | null = null;
    let lastCheckpointAt = Date.now();
    let flushing: Promise<void> = Promise.resolve();
    const maxFrame = maximumJobFrameBytes(
      this.loaded.config.limits.maximumSsePendingBytes,
    );
    const appendFrame = (revision: string, text: string): JobCommitEvent => ({
      jobId: job.id,
      name: 'append',
      revision,
      data: { revision, text },
    });
    const flushPieces = async (keepTerminalPiece: boolean) => {
      while (pending) {
        const terminalPrototype = this.terminalEvent(
          {
            ...job,
            revision: '99999999999999999999',
            status: 'completed',
            finishedAt: new Date(),
            inputTokens,
            outputTokens,
          },
          pending,
        );
        if (keepTerminalPiece && jobFrameBytes(terminalPrototype) <= maxFrame)
          break;
        const prefix = fittingPrefix(
          pending,
          maxFrame,
          appendFrame('99999999999999999999', ''),
        );
        if (keepTerminalPiece && prefix === pending) {
          const scalars = Array.from(pending);
          if (scalars.length === 1) break;
          const first = scalars.slice(0, -1).join('');
          pending = scalars.at(-1)!;
          const saved = await this.jobs.checkpoint(
            job.id,
            checkpointContent + first,
          );
          if (!saved) throw new DOMException('Aborted', 'AbortError');
          checkpointContent += first;
          this.publish(appendFrame(saved.revision, first));
        } else {
          const saved = await this.jobs.checkpoint(
            job.id,
            checkpointContent + prefix,
          );
          if (!saved) throw new DOMException('Aborted', 'AbortError');
          checkpointContent += prefix;
          pending = pending.slice(prefix.length);
          this.publish(appendFrame(saved.revision, prefix));
        }
        lastCheckpointAt = Date.now();
      }
    };
    const flush = (keepTerminalPiece = false) => {
      flushing = flushing
        .catch(() => undefined)
        .then(() => flushPieces(keepTerminalPiece));
      return flushing;
    };
    const settle = (
      status: 'completed' | 'failed' | 'cancelled',
      errorCode: string | null,
      stopReason?: string,
    ): Promise<ChatJobRecord | null> =>
      (settlement ??= (async () => {
        if (finalized) return null;
        await flush(true);
        const finalText = pending;
        const completed = await this.jobs.terminal(job.id, {
          status,
          content: checkpointContent + finalText,
          errorCode,
          inputTokens,
          outputTokens,
          ...(status === 'completed' && turn.activateBranchOnComplete
            ? {
                activateBranch: {
                  branchId: turn.branchId,
                  previousActiveBranchId: turn.previousActiveBranchId,
                },
              }
            : {}),
        });
        finalized = true;
        if (completed) {
          pending = '';
          this.publish(this.terminalEvent(completed, finalText));
          if (status === 'completed')
            this.traces.complete(traceId, {
              content,
              durationMs: Date.now() - job.startedAt.getTime(),
              inputTokens,
              outputTokens,
              stopReason: stopReason ?? null,
            });
          else
            this.traces.fail(traceId, {
              cancelled: status === 'cancelled',
              content,
              errorCode: errorCode ?? 'CHAT_INTERNAL_ERROR',
            });
        }
        return completed;
      })());
    this.active.set(job.id, {
      controller,
      cancel: async () => {
        controller.abort();
        return settle('cancelled', 'CHAT_CANCELLED');
      },
    });
    const checkpointTimer = setInterval(() => {
      if (pending && Date.now() - lastCheckpointAt >= 1000)
        void flush().catch(() => controller.abort());
    }, 1000);
    checkpointTimer.unref();
    let checking = false;
    const securityTimer = setInterval(() => {
      if (checking) return;
      checking = true;
      void (async () => {
        try {
          if (!(await this.jobs.startedSessionValid(job))) {
            controller.abort();
            return;
          }
          await this.access.assertModelAllowed(
            input.principal,
            input.providerModelId,
          );
        } catch {
          controller.abort();
        } finally {
          checking = false;
        }
      })();
    }, 15_000);
    securityTimer.unref();
    try {
      if (!(await this.jobs.startedSessionValid(job)))
        throw new DOMException('Aborted', 'AbortError');
      await this.access.assertModelAllowed(
        input.principal,
        input.providerModelId,
      );
      if (turn.imageAttachments.length && !runtime.supportsImageInput)
        throw new Error('CHAT_IMAGE_MODEL_UNSUPPORTED');
      if (
        turn.webSearchEnabled &&
        (!runtime.supportsWebSearch ||
          !providerSupportsNativeWebSearch(runtime.template))
      )
        throw new Error('CHAT_WEB_SEARCH_MODEL_UNSUPPORTED');
      let context = turn.context;
      const budget = contextBudget(
        runtime,
        turn.contextTokenLimit,
        parameters.maxOutputTokens,
        turn.imageAttachments.length,
      );
      const effectiveContextLimit = budget.input;
      parameters = { ...parameters, maxOutputTokens: budget.output };
      if (
        estimateContextSize(turn.systemPrompt, context) > effectiveContextLimit
      ) {
        context = await this.summarization.fitContext({
          jobId: job.id,
          branchId: turn.branchId,
          context,
          contextLimit: effectiveContextLimit,
          conversationId: input.conversationId,
          signal: controller.signal,
          systemPrompt: turn.systemPrompt,
          beforeProviderSend: async () => {
            controller.signal.throwIfAborted();
            if (!(await this.jobs.startedSessionValid(job)))
              throw new DOMException('Aborted', 'AbortError');
            await this.access.assertModelAllowed(
              input.principal,
              input.providerModelId,
            );
            await this.jobs.markSent(job.id);
          },
        });
      }
      if (
        estimateContextSize(turn.systemPrompt, context) > effectiveContextLimit
      )
        throw new ContextSummarizationUnavailableError();
      if (turn.imageAttachments.length) {
        const images = await this.attachments.readImages(
          turn.imageAttachments,
          controller.signal,
        );
        const target = context.findLastIndex(
          (message) => message.role === 'user',
        );
        if (target < 0) throw new Error('CHAT_ATTACHMENT_INVALID');
        context = context.map((message, index) =>
          index === target ? { ...message, images } : message,
        );
      }
      controller.signal.throwIfAborted();
      if (!(await this.jobs.startedSessionValid(job)))
        throw new DOMException('Aborted', 'AbortError');
      await this.access.assertModelAllowed(
        input.principal,
        input.providerModelId,
      );
      const request = buildProviderStreamRequest(
        {
          apiKey: runtime.apiKey,
          baseUrl: runtime.baseUrl,
          messages: context,
          modelId: runtime.modelId,
          parameters,
          systemPrompt: turn.systemPrompt,
          template: runtime.template,
          webSearchEnabled: turn.webSearchEnabled,
        },
        turn.requestTraceLimit > 0,
      );
      if (turn.requestTraceLimit > 0) {
        traceId = await this.traces.begin({
          absoluteExpiresAt: input.absoluteExpiresAt,
          conversationId: input.conversationId,
          limit: turn.requestTraceLimit,
          modelId: runtime.modelId,
          principal: principalOf(input.principal),
          providerTemplateId: runtime.template.id,
          request,
          sessionId: input.sessionId,
        });
      }
      const streaming = await this.jobs.markStreaming(job.id);
      if (!streaming) throw new DOMException('Aborted', 'AbortError');
      this.publish({
        jobId: job.id,
        name: 'state',
        revision: streaming.revision,
        data: { revision: streaming.revision, status: 'streaming' },
      });
      await this.jobs.markSent(job.id);
      let stopReason: string | undefined;
      for await (const event of streamProviderRequest(
        {
          request,
          signal: controller.signal,
          idleTimeoutMs: turn.responseTimeoutSeconds * 1000,
          maximumGeneratedTextBytes: job.maximumGeneratedTextBytes,
          onRawEvent: (document) => this.traces.appendRaw(traceId, document),
        },
        runtimeProviderFetch(runtime),
      )) {
        if (event.type === 'text_delta') {
          content += event.text;
          pending += event.text;
          if (Buffer.byteLength(pending, 'utf8') >= 4096) await flush();
        } else if (event.type === 'usage') {
          inputTokens = event.inputTokens ?? inputTokens;
          outputTokens = event.outputTokens ?? outputTokens;
          await this.jobs.recordUsage(job.id, inputTokens, outputTokens);
        } else if (event.type === 'done') stopReason = event.stopReason;
      }
      if (controller.signal.aborted)
        throw new DOMException('Aborted', 'AbortError');
      await settle('completed', null, stopReason);
    } catch (error) {
      const cancelled =
        !this.stopping &&
        !lifetimeExpired &&
        (controller.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError'));
      const errorCode = this.stopping
        ? 'CHAT_SERVER_SHUTDOWN'
        : lifetimeExpired
          ? 'CHAT_PROVIDER_TIMEOUT'
          : cancelled
            ? 'CHAT_CANCELLED'
            : error instanceof ChatUpstreamError
              ? error.code
              : error instanceof ContextSummarizationUnavailableError
                ? 'CHAT_CONTEXT_LIMIT_EXCEEDED'
                : error instanceof Error && error.message.startsWith('CHAT_')
                  ? error.message
                  : 'CHAT_INTERNAL_ERROR';
      await settle(cancelled ? 'cancelled' : 'failed', errorCode);
    } finally {
      clearInterval(checkpointTimer);
      clearTimeout(lifetime);
      clearInterval(securityTimer);
      this.active.delete(job.id);
    }
  }
}
