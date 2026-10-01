import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { ChatExecutionService } from './chat-execution.service.js';
import {
  ChatMessageStateError,
  ChatSettingsConflictError,
  ChatRegenerationTargetError,
  ChatAttachmentError,
} from './chat-messages.repository.js';
import {
  ChatJobConflictError,
  type ChatJobRecord,
} from './chat-jobs.repository.js';
import { ChatJobsService } from './chat-jobs.service.js';
import { serializeJobFrame, type JobCommitEvent } from './chat-job-events.js';
import { AccessError } from './access.service.js';
import {
  AccessDailyLimitError,
  AccessModelNotAllowedError,
} from './access.repository.js';
import { ChatProviderUnavailableError } from './chat-provider.service.js';
import { ProviderDestinationError } from './provider-destination.js';
import { ProviderParameterValidationError } from './provider-parameter-policy.js';
import type { ChatEvent, ChatParameters } from './chat-streaming.js';
import {
  AuthenticatedMutationGuard,
  type AuthenticatedRequest,
  AuthenticatedSessionGuard,
} from './auth.guard.js';
import { ChatError, ChatsService } from './chats.service.js';
import {
  ConversationNotFoundError,
  type CreateConversationInput,
  type MessagePageInput,
  type UpdateConversationInput,
} from './chats.repository.js';
import { RequestTraceService } from './request-trace.service.js';

interface ResponseLike {
  writableLength?: number;
  end?(): void;
  flushHeaders?(): void;
  off?(event: 'close' | 'drain', listener: () => void): void;
  on?(event: 'close' | 'drain', listener: () => void): void;
  once?(event: 'close' | 'drain', listener: () => void): void;
  setHeader(name: string, value: string): void;
  status?(code: number): ResponseLike;
  write?(chunk: string): boolean;
}

const REVISION = /^[1-9][0-9]{0,18}$/u;
const IDEMPOTENCY_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function publicJob(job: ChatJobRecord) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    revision: job.revision,
    conversationId: job.conversationId,
    branchId: job.branchId,
    userMessageId: job.userMessageId,
    assistantMessageId: job.assistantMessageId,
    content: job.content,
    errorCode: job.errorCode,
    inputTokens: job.inputTokens,
    outputTokens: job.outputTokens,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function writeSseEvent(
  response: ResponseLike,
  event: ChatEvent,
): void | Promise<void> {
  const accepted = response.write?.(`data: ${JSON.stringify(event)}\n\n`);
  if (accepted !== false) return;
  if (!response.once) {
    return Promise.reject(
      new Error('SSE response cannot wait for writable backpressure.'),
    );
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      response.off?.('drain', handleDrain);
      response.off?.('close', handleClose);
    };
    const handleDrain = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const handleClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('SSE response closed before the buffer drained.'));
    };
    response.once!('drain', handleDrain);
    response.once!('close', handleClose);
  });
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function recordBody(body: unknown): Record<string, unknown> | undefined {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
}

function validInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function parseMessagePage(
  beforeSequence: string | undefined,
  limit: string | undefined,
): MessagePageInput | undefined {
  const parsedBefore =
    beforeSequence === undefined ? undefined : Number(beforeSequence);
  const parsedLimit = limit === undefined ? 50 : Number(limit);
  if (
    (parsedBefore !== undefined &&
      !validInteger(parsedBefore, 1, Number.MAX_SAFE_INTEGER)) ||
    !validInteger(parsedLimit, 1, 100)
  ) {
    return undefined;
  }
  return {
    ...(parsedBefore === undefined ? {} : { beforeSequence: parsedBefore }),
    limit: parsedLimit,
  };
}

function title(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 200
    ? normalized
    : undefined;
}

function systemPrompt(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 100_000
    ? value
    : undefined;
}

function parseCreate(body: unknown): CreateConversationInput | undefined {
  const input = recordBody(body);
  if (!input) return undefined;
  const parsedTitle =
    input.title === undefined ? '새 대화' : title(input.title);
  const parsedSystemPrompt =
    input.systemPrompt === undefined ? '' : systemPrompt(input.systemPrompt);
  const historyMessageLimit = input.historyMessageLimit ?? 0;
  const contextTokenLimit = input.contextTokenLimit ?? 100_000;
  const requestTraceLimit = input.requestTraceLimit ?? 3;
  const responseTimeoutSeconds = input.responseTimeoutSeconds ?? 120;
  const webSearchEnabled = input.webSearchEnabled ?? false;
  const defaultProviderModelId =
    input.defaultProviderModelId === undefined
      ? null
      : input.defaultProviderModelId;
  const generationParameters =
    input.generationParameters === undefined
      ? ({} satisfies ChatParameters)
      : parseParameters(input.generationParameters);
  if (
    parsedTitle === undefined ||
    parsedSystemPrompt === undefined ||
    !validInteger(historyMessageLimit, 0, 10_000) ||
    !validInteger(contextTokenLimit, 1_000, 2_000_000) ||
    !validInteger(requestTraceLimit, 0, 3) ||
    !validInteger(responseTimeoutSeconds, 1, 1_800) ||
    typeof webSearchEnabled !== 'boolean' ||
    (defaultProviderModelId !== null &&
      (typeof defaultProviderModelId !== 'string' ||
        !UUID.test(defaultProviderModelId))) ||
    !generationParameters
  ) {
    return undefined;
  }
  return {
    contextTokenLimit,
    defaultProviderModelId,
    generationParameters,
    historyMessageLimit,
    requestTraceLimit,
    responseTimeoutSeconds,
    systemPrompt: parsedSystemPrompt,
    title: parsedTitle,
    titleSource: input.title === undefined ? 'default' : 'manual',
    webSearchEnabled,
  };
}

function parseUpdate(body: unknown): UpdateConversationInput | undefined {
  const input = recordBody(body);
  if (
    !input ||
    typeof input.settingsRevision !== 'string' ||
    !/^[1-9]\d{0,18}$/.test(input.settingsRevision) ||
    BigInt(input.settingsRevision) > 9_223_372_036_854_775_807n ||
    Object.keys(input).some(
      (key) =>
        ![
          'settingsRevision',
          'isPinned',
          'title',
          'systemPrompt',
          'historyMessageLimit',
          'contextTokenLimit',
          'requestTraceLimit',
          'responseTimeoutSeconds',
          'defaultProviderModelId',
          'generationParameters',
          'webSearchEnabled',
        ].includes(key),
    )
  )
    return undefined;
  const output: UpdateConversationInput = {
    settingsRevision: input.settingsRevision,
  };
  if (input.isPinned !== undefined) {
    if (typeof input.isPinned !== 'boolean') return undefined;
    output.isPinned = input.isPinned;
  }
  if (input.title !== undefined) {
    const value = title(input.title);
    if (value === undefined) return undefined;
    output.title = value;
  }
  if (input.systemPrompt !== undefined) {
    const value = systemPrompt(input.systemPrompt);
    if (value === undefined) return undefined;
    output.systemPrompt = value;
  }
  if (input.historyMessageLimit !== undefined) {
    if (!validInteger(input.historyMessageLimit, 0, 10_000)) return undefined;
    output.historyMessageLimit = input.historyMessageLimit;
  }
  if (input.contextTokenLimit !== undefined) {
    if (!validInteger(input.contextTokenLimit, 1_000, 2_000_000)) {
      return undefined;
    }
    output.contextTokenLimit = input.contextTokenLimit;
  }
  if (input.requestTraceLimit !== undefined) {
    if (!validInteger(input.requestTraceLimit, 0, 3)) return undefined;
    output.requestTraceLimit = input.requestTraceLimit;
  }
  if (input.responseTimeoutSeconds !== undefined) {
    if (!validInteger(input.responseTimeoutSeconds, 1, 1_800)) {
      return undefined;
    }
    output.responseTimeoutSeconds = input.responseTimeoutSeconds;
  }
  if (input.defaultProviderModelId !== undefined) {
    if (
      input.defaultProviderModelId !== null &&
      (typeof input.defaultProviderModelId !== 'string' ||
        !UUID.test(input.defaultProviderModelId))
    ) {
      return undefined;
    }
    output.defaultProviderModelId = input.defaultProviderModelId;
  }
  if (input.generationParameters !== undefined) {
    const parameters = parseParameters(input.generationParameters);
    if (!parameters) return undefined;
    output.generationParameters = parameters;
  }
  if (input.webSearchEnabled !== undefined) {
    if (typeof input.webSearchEnabled !== 'boolean') return undefined;
    output.webSearchEnabled = input.webSearchEnabled;
  }
  return Object.keys(output).length > 1 ? output : undefined;
}

function parseParameters(value: unknown): ChatParameters | undefined {
  if (value === undefined) return {};
  const input = recordBody(value);
  if (!input) return undefined;
  const allowed = new Set([
    'frequencyPenalty',
    'maxOutputTokens',
    'outputEffort',
    'presencePenalty',
    'reasoningEffort',
    'seed',
    'stopSequences',
    'temperature',
    'thinkingBudget',
    'thinkingDisplay',
    'thinkingLevel',
    'topK',
    'topP',
    'verbosity',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return undefined;
  const output: ChatParameters = {};
  if (input.maxOutputTokens !== undefined) {
    if (!validInteger(input.maxOutputTokens, 1, 131_072)) return undefined;
    output.maxOutputTokens = input.maxOutputTokens;
  }
  if (input.temperature !== undefined) {
    if (
      typeof input.temperature !== 'number' ||
      !Number.isFinite(input.temperature) ||
      input.temperature < 0 ||
      input.temperature > 2
    ) {
      return undefined;
    }
    output.temperature = input.temperature;
  }
  if (input.topP !== undefined) {
    if (
      typeof input.topP !== 'number' ||
      !Number.isFinite(input.topP) ||
      input.topP < 0 ||
      input.topP > 1
    ) {
      return undefined;
    }
    output.topP = input.topP;
  }
  for (const key of ['frequencyPenalty', 'presencePenalty'] as const) {
    const parameter = input[key];
    if (parameter !== undefined) {
      if (
        typeof parameter !== 'number' ||
        !Number.isFinite(parameter) ||
        parameter < -2 ||
        parameter > 2
      )
        return undefined;
      output[key] = parameter;
    }
  }
  for (const [key, minimum, maximum] of [
    ['topK', 0, 1_000],
    ['seed', 0, 2_147_483_647],
    ['thinkingBudget', 0, 131_072],
  ] as const) {
    const parameter = input[key];
    if (parameter !== undefined && !validInteger(parameter, minimum, maximum))
      return undefined;
    if (parameter !== undefined) output[key] = parameter;
  }
  for (const key of [
    'outputEffort',
    'reasoningEffort',
    'thinkingDisplay',
    'thinkingLevel',
    'verbosity',
  ] as const) {
    const parameter = input[key];
    if (
      parameter !== undefined &&
      (typeof parameter !== 'string' || parameter.length > 32)
    )
      return undefined;
    if (typeof parameter === 'string') output[key] = parameter;
  }
  if (input.stopSequences !== undefined) {
    if (
      !Array.isArray(input.stopSequences) ||
      input.stopSequences.length > 16 ||
      input.stopSequences.some(
        (item) => typeof item !== 'string' || item.length > 500,
      )
    )
      return undefined;
    output.stopSequences = input.stopSequences as string[];
  }
  return output;
}

function parseMessage(body: unknown):
  | {
      attachmentIds: string[];
      content: string;
      parameters: ChatParameters;
      providerModelId: string;
    }
  | undefined {
  const input = recordBody(body);
  if (!input || typeof input.content !== 'string') return undefined;
  const content = input.content.trim();
  const parameters = parseParameters(input.parameters);
  const attachmentIds =
    input.attachmentIds === undefined ? [] : input.attachmentIds;
  if (
    !Array.isArray(attachmentIds) ||
    attachmentIds.length > 10 ||
    attachmentIds.some(
      (attachmentId) =>
        typeof attachmentId !== 'string' || !UUID.test(attachmentId),
    ) ||
    new Set(attachmentIds).size !== attachmentIds.length ||
    (content.length < 1 && attachmentIds.length === 0) ||
    content.length > 200_000 ||
    typeof input.providerModelId !== 'string' ||
    !UUID.test(input.providerModelId) ||
    !parameters
  ) {
    return undefined;
  }
  return {
    attachmentIds: attachmentIds as string[],
    content,
    parameters,
    providerModelId: input.providerModelId,
  };
}

function parseRegeneration(
  body: unknown,
): { parameters: ChatParameters; providerModelId: string } | undefined {
  const input = recordBody(body);
  if (!input) return undefined;
  const parameters = parseParameters(input.parameters);
  if (
    typeof input.providerModelId !== 'string' ||
    !UUID.test(input.providerModelId) ||
    !parameters
  ) {
    return undefined;
  }
  return { parameters, providerModelId: input.providerModelId };
}

@Controller('conversations')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly execution: ChatExecutionService,
    private readonly traces: RequestTraceService = {
      applyConversationLimit: () => undefined,
      clearSessionConversation: () => undefined,
      list: () => Promise.resolve([]),
    } as unknown as RequestTraceService,
  ) {}

  @Get()
  @UseGuards(AuthenticatedSessionGuard)
  async list(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
    @Query() query: Record<string, string | undefined> = {},
  ) {
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (
        Object.keys(query).some(
          (key) => !['query', 'pinned', 'limit', 'cursor'].includes(key),
        ) ||
        Object.values(query).some((value) => typeof value !== 'string')
      )
        this.invalidInput();
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      const text = (query.query ?? '').trim().normalize('NFC');
      if (
        text.length > 200 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (query.pinned !== undefined &&
          !['true', 'false'].includes(query.pinned))
      )
        this.invalidInput();
      return await this.chats.listPage(
        request.authenticatedSession!.principal,
        {
          limit,
          query: text,
          ...(query.pinned === undefined
            ? {}
            : { pinned: query.pinned === 'true' }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        },
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post()
  @UseGuards(AuthenticatedMutationGuard)
  async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = parseCreate(body);
    if (!input) this.invalidInput();
    try {
      return await this.chats.create(
        request.authenticatedSession!.principal,
        input,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get(':id')
  @UseGuards(AuthenticatedSessionGuard)
  async detail(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) this.invalidInput();
    try {
      return await this.chats.detail(
        request.authenticatedSession!.principal,
        id,
        { limit: 50 },
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get(':id/messages')
  @UseGuards(AuthenticatedSessionGuard)
  async messages(
    @Param('id') id: string,
    @Query('beforeSequence') beforeSequence: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const page = parseMessagePage(beforeSequence, limit);
    if (!UUID.test(id) || !page) this.invalidInput();
    try {
      return await this.chats.messagePage(
        request.authenticatedSession!.principal,
        id,
        page,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch(':id')
  @UseGuards(AuthenticatedMutationGuard)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = parseUpdate(body);
    if (!UUID.test(id) || !input) this.invalidInput();
    try {
      const updated = await this.chats.update(
        request.authenticatedSession!.principal,
        id,
        input,
      );
      if (input.requestTraceLimit !== undefined) {
        this.traces.applyConversationLimit(
          request.authenticatedSession!.row.id,
          id,
          input.requestTraceLimit,
        );
      }
      return updated;
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch(':id/branches/:branchId/active')
  @UseGuards(AuthenticatedMutationGuard)
  async activateBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
    @Body() body?: unknown,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const revision = recordBody(body)?.settingsRevision;
    if (
      !UUID.test(id) ||
      !UUID.test(branchId) ||
      typeof revision !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(revision) ||
      BigInt(revision) > 9_223_372_036_854_775_807n ||
      Object.keys(recordBody(body) ?? {}).length !== 1
    )
      this.invalidInput();
    try {
      return await this.chats.activateBranch(
        request.authenticatedSession!.principal,
        id,
        branchId,
        revision,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedMutationGuard)
  async delete(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) this.invalidInput();
    try {
      await this.chats.delete(request.authenticatedSession!.principal, id);
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedMutationGuard)
  async message(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res() response: ResponseLike,
  ): Promise<void> {
    const input = parseMessage(body);
    if (!UUID.test(id) || !input) this.invalidInput();
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    const disconnected = new AbortController();
    let completed = false;
    response.on?.('close', () => {
      if (!completed) disconnected.abort();
    });
    const emit = (event: ChatEvent) => writeSseEvent(response, event);
    try {
      await this.execution.execute(
        {
          ...input,
          absoluteExpiresAt: request.authenticatedSession!.absoluteExpiresAt,
          conversationId: id,
          principal: request.authenticatedSession!.principal,
          sessionId: request.authenticatedSession!.row.id,
        },
        emit,
        disconnected.signal,
      );
    } finally {
      completed = true;
      response.end?.();
    }
  }

  @Post(':id/messages/:messageId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedMutationGuard)
  async cancel(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id) || !UUID.test(messageId)) this.invalidInput();
    try {
      await this.execution.cancel(
        request.authenticatedSession!.principal,
        id,
        messageId,
      );
    } catch (error) {
      if (error instanceof ChatMessageStateError) {
        throw new HttpException(
          {
            error: {
              code: 'CHAT_NOT_CANCELLABLE',
              message: 'The response is not active.',
            },
          },
          HttpStatus.CONFLICT,
        );
      }
      this.mapError(error);
    }
  }

  @Get(':id/traces')
  @UseGuards(AuthenticatedSessionGuard)
  async tracesForConversation(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) this.invalidInput();
    await this.chats.detail(request.authenticatedSession!.principal, id, {
      limit: 1,
    });
    return {
      traces: this.traces.list(request.authenticatedSession!.row.id, id),
    };
  }

  @Delete(':id/traces')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthenticatedMutationGuard)
  async clearTraces(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) this.invalidInput();
    await this.chats.detail(request.authenticatedSession!.principal, id, {
      limit: 1,
    });
    this.traces.clearSessionConversation(
      request.authenticatedSession!.row.id,
      id,
    );
  }

  @Post(':id/messages/:messageId/regenerate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthenticatedMutationGuard)
  async regenerate(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res() response: ResponseLike,
  ): Promise<void> {
    const input = parseRegeneration(body);
    if (!UUID.test(id) || !UUID.test(messageId) || !input) {
      this.invalidInput();
    }
    response.setHeader('Cache-Control', 'no-cache, no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    const disconnected = new AbortController();
    let completed = false;
    response.on?.('close', () => {
      if (!completed) disconnected.abort();
    });
    const emit = (event: ChatEvent) => writeSseEvent(response, event);
    try {
      await this.execution.regenerate(
        {
          ...input,
          absoluteExpiresAt: request.authenticatedSession!.absoluteExpiresAt,
          assistantMessageId: messageId,
          conversationId: id,
          principal: request.authenticatedSession!.principal,
          sessionId: request.authenticatedSession!.row.id,
        },
        emit,
        disconnected.signal,
      );
    } finally {
      completed = true;
      response.end?.();
    }
  }

  private invalidInput(): never {
    throw new HttpException(
      {
        error: {
          code: 'CHAT_INPUT_INVALID',
          message: 'Conversation input is invalid.',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private mapError(error: unknown): never {
    if (error instanceof AccessModelNotAllowedError)
      throw new HttpException(
        {
          error: {
            code: 'ACCESS_MODEL_FORBIDDEN',
            message: 'The model is not available.',
          },
        },
        404,
      );
    if (
      error instanceof Error &&
      ['CHAT_INPUT_INVALID', 'CHAT_PARAMETER_INVALID'].includes(error.message)
    ) {
      throw new HttpException(
        {
          error: {
            code: error.message,
            message: 'Conversation input is invalid.',
          },
        },
        400,
      );
    }
    if (error instanceof ConversationNotFoundError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_NOT_FOUND',
            message: 'Conversation not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }
    if (error instanceof ChatError) {
      throw new HttpException(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  }
}

@Controller('conversations')
export class ChatJobsController {
  constructor(
    private readonly jobs: ChatJobsService,
    private readonly chats: ChatsService,
  ) {}

  private invalid(): never {
    throw new HttpException(
      {
        error: {
          code: 'CHAT_INPUT_INVALID',
          message: 'Chat job input is invalid.',
        },
      },
      400,
    );
  }

  private mapError(error: unknown): never {
    if (error instanceof ProviderParameterValidationError) this.invalid();
    if (error instanceof ProviderDestinationError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_PROVIDER_DESTINATION_DENIED',
            message: 'Provider destination is not allowed.',
          },
        },
        422,
      );
    }
    if (error instanceof ChatJobConflictError) {
      const status = error.code === 'CHAT_SERVER_BUSY' ? 503 : 409;
      throw new HttpException(
        { error: { code: error.code, message: error.code } },
        status,
      );
    }
    if (error instanceof ChatSettingsConflictError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_SETTINGS_CONFLICT',
            message: 'Conversation settings changed.',
          },
        },
        409,
      );
    }
    if (error instanceof ChatRegenerationTargetError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_REGENERATION_INVALID',
            message: 'The answer cannot be regenerated.',
          },
        },
        409,
      );
    }
    if (error instanceof ChatAttachmentError) this.invalid();
    if (error instanceof ChatProviderUnavailableError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_MODEL_UNAVAILABLE',
            message: 'The model is unavailable.',
          },
        },
        404,
      );
    }
    if (error instanceof AccessError) {
      throw new HttpException(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.scope ? { scope: error.scope } : {}),
          },
        },
        error.status,
      );
    }
    if (error instanceof AccessDailyLimitError) {
      throw new HttpException(
        {
          error: {
            code: 'ACCESS_DAILY_LIMIT_REACHED',
            message: 'The daily request limit has been reached.',
            scope: error.scope,
            resetAt: error.resetAt?.toISOString() ?? null,
          },
        },
        429,
      );
    }
    if (error instanceof AccessModelNotAllowedError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_MODEL_UNAVAILABLE',
            message: 'The model is unavailable.',
          },
        },
        404,
      );
    }
    if (
      error instanceof ConversationNotFoundError ||
      error instanceof ChatError
    ) {
      throw new HttpException(
        {
          error: { code: 'CHAT_NOT_FOUND', message: 'Conversation not found.' },
        },
        404,
      );
    }
    throw error;
  }

  private async mapStartError(
    error: unknown,
    request: AuthenticatedRequest,
    id: string,
  ): Promise<never> {
    if (error instanceof ChatSettingsConflictError) {
      const conversation = await this.chats.detail(
        request.authenticatedSession!.principal,
        id,
        { limit: 1 },
      );
      throw new HttpException(
        {
          error: {
            code: 'CHAT_SETTINGS_CONFLICT',
            message: 'Conversation settings changed.',
            conversation,
            settingsRevision: conversation.settingsRevision,
          },
        },
        409,
      );
    }
    this.mapError(error);
  }

  private startInput(
    body: unknown,
    key: string | undefined,
    regeneration: boolean,
  ) {
    const raw = recordBody(body);
    const settingsRevision = raw?.settingsRevision;
    const parsed = regeneration ? parseRegeneration(body) : parseMessage(body);
    if (
      !key ||
      !IDEMPOTENCY_KEY.test(key) ||
      typeof settingsRevision !== 'string' ||
      !REVISION.test(settingsRevision) ||
      BigInt(settingsRevision) > 9_223_372_036_854_775_807n ||
      !parsed
    )
      this.invalid();
    return { key, parsed, settingsRevision };
  }

  @Post(':id/jobs')
  @UseGuards(AuthenticatedMutationGuard)
  async startTurn(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) this.invalid();
    const {
      key: validatedKey,
      parsed,
      settingsRevision,
    } = this.startInput(body, key, false);
    const message = parsed as NonNullable<ReturnType<typeof parseMessage>>;
    try {
      const result = await this.jobs.start({
        ...message,
        principal: request.authenticatedSession!.principal,
        conversationId: id,
        kind: 'turn',
        idempotencyKey: validatedKey,
        settingsRevision,
        sessionId: request.authenticatedSession!.row.id,
        absoluteExpiresAt: request.authenticatedSession!.absoluteExpiresAt,
      });
      response.status?.(result.reused ? 200 : 202);
      return { job: publicJob(result.job) };
    } catch (error) {
      if (
        error instanceof ChatJobConflictError &&
        error.code === 'CHAT_SERVER_BUSY'
      )
        response.setHeader('Retry-After', '1');
      return this.mapStartError(error, request, id);
    }
  }

  @Post(':id/messages/:messageId/regeneration-jobs')
  @UseGuards(AuthenticatedMutationGuard)
  async startRegeneration(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id) || !UUID.test(messageId)) this.invalid();
    const {
      key: validatedKey,
      parsed,
      settingsRevision,
    } = this.startInput(body, key, true);
    try {
      const result = await this.jobs.start({
        ...parsed,
        content: '',
        attachmentIds: [],
        principal: request.authenticatedSession!.principal,
        conversationId: id,
        kind: 'regenerate',
        regenerateAssistantMessageId: messageId,
        idempotencyKey: validatedKey,
        settingsRevision,
        sessionId: request.authenticatedSession!.row.id,
        absoluteExpiresAt: request.authenticatedSession!.absoluteExpiresAt,
      });
      response.status?.(result.reused ? 200 : 202);
      return { job: publicJob(result.job) };
    } catch (error) {
      if (
        error instanceof ChatJobConflictError &&
        error.code === 'CHAT_SERVER_BUSY'
      )
        response.setHeader('Retry-After', '1');
      return this.mapStartError(error, request, id);
    }
  }

  @Get(':id/jobs/:jobId')
  @UseGuards(AuthenticatedSessionGuard)
  async get(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id) || !UUID.test(jobId)) this.invalid();
    try {
      return {
        job: publicJob(
          await this.jobs.get(
            request.authenticatedSession!.principal,
            id,
            jobId,
          ),
        ),
      };
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(':id/jobs/:jobId/cancel')
  @HttpCode(204)
  @UseGuards(AuthenticatedMutationGuard)
  async cancelJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id) || !UUID.test(jobId)) this.invalid();
    try {
      await this.jobs.cancel(
        request.authenticatedSession!.principal,
        id,
        jobId,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Get(':id/jobs/:jobId/events')
  @UseGuards(AuthenticatedSessionGuard)
  async events(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: ResponseLike,
  ): Promise<void> {
    if (!UUID.test(id) || !UUID.test(jobId)) this.invalid();
    const principal = request.authenticatedSession!.principal;
    const sessionId = request.authenticatedSession!.row.id;
    let subscription: Awaited<ReturnType<ChatJobsService['subscribe']>>;
    let ready = false;
    let closed = false;
    let revision = 0n;
    let pendingBytes = 0;
    let preSnapshotBytes = 0;
    let blocked = false;
    let terminalQueued = false;
    const queued: JobCommitEvent[] = [];
    const frames: string[] = [];
    let finish: () => void = () => undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      subscription?.close();
      response.end?.();
      finish();
    };
    const drain = () => {
      blocked = false;
      while (frames.length && !blocked && !closed) {
        const frame = frames.shift()!;
        pendingBytes -= Buffer.byteLength(frame, 'utf8');
        blocked = response.write?.(frame) === false;
      }
      if (terminalQueued && !frames.length && !closed) close();
    };
    const enqueue = (frame: string) => {
      if (closed) return;
      const bytes = Buffer.byteLength(frame, 'utf8');
      if (
        bytes > this.jobs.maximumPendingBytes ||
        pendingBytes + bytes + (response.writableLength ?? 0) >
          this.jobs.maximumPendingBytes
      ) {
        close();
        return;
      }
      frames.push(frame);
      pendingBytes += bytes;
      drain();
    };
    const deliver = (event: JobCommitEvent) => {
      if (!ready) {
        preSnapshotBytes += Buffer.byteLength(serializeJobFrame(event), 'utf8');
        if (preSnapshotBytes > this.jobs.maximumPendingBytes) close();
        else queued.push(event);
        return;
      }
      const next = BigInt(event.revision);
      if (next <= revision) return;
      if (next !== revision + 1n) {
        close();
        return;
      }
      revision = next;
      enqueue(serializeJobFrame(event));
      if (event.name === 'terminal') {
        terminalQueued = true;
        if (!frames.length) close();
      }
    };
    try {
      subscription = await this.jobs.subscribe(principal, id, jobId, deliver);
    } catch (error) {
      this.mapError(error);
    }
    if (closed) {
      subscription.close();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    response.on?.('close', close);
    response.on?.('drain', drain);
    revision = BigInt(subscription.job.revision);
    enqueue(
      `id: ${revision}\nevent: snapshot\ndata: ${JSON.stringify({
        jobId,
        revision: subscription.job.revision,
        status: subscription.job.status,
        contentBytes: Buffer.byteLength(subscription.job.content, 'utf8'),
      })}\n\n`,
    );
    ready = true;
    for (const event of queued) deliver(event);
    queued.length = 0;
    if (
      subscription.job.status === 'completed' ||
      subscription.job.status === 'failed' ||
      subscription.job.status === 'cancelled'
    )
      close();
    const timer = setInterval(() => {
      if (closed) return;
      void this.jobs
        .subscriptionValid(sessionId, principal, subscription.job)
        .then((valid) => {
          if (!valid) {
            close();
            return;
          }
          enqueue('event: heartbeat\n\n');
        })
        .catch(close);
    }, 15_000);
    timer.unref();
    try {
      await new Promise<void>((resolve) => {
        finish = resolve;
        if (closed) resolve();
      });
    } finally {
      clearInterval(timer);
      close();
    }
  }
}
