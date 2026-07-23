import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { ChatExecutionService } from './chat-execution.service.js';
import { ChatMessageStateError } from './chat-messages.repository.js';
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
  type UpdateConversationInput,
} from './chats.repository.js';

interface ResponseLike {
  end?(): void;
  flushHeaders?(): void;
  on?(event: 'close', listener: () => void): void;
  setHeader(name: string, value: string): void;
  write?(chunk: string): boolean;
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
  if (
    parsedTitle === undefined ||
    parsedSystemPrompt === undefined ||
    !validInteger(historyMessageLimit, 0, 10_000) ||
    !validInteger(contextTokenLimit, 1_000, 2_000_000)
  ) {
    return undefined;
  }
  return {
    contextTokenLimit,
    historyMessageLimit,
    systemPrompt: parsedSystemPrompt,
    title: parsedTitle,
  };
}

function parseUpdate(body: unknown): UpdateConversationInput | undefined {
  const input = recordBody(body);
  if (!input) return undefined;
  const output: UpdateConversationInput = {};
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
  return Object.keys(output).length > 0 ? output : undefined;
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
      content: string;
      parameters: ChatParameters;
      providerModelId: string;
    }
  | undefined {
  const input = recordBody(body);
  if (!input || typeof input.content !== 'string') return undefined;
  const content = input.content.trim();
  const parameters = parseParameters(input.parameters);
  if (
    content.length < 1 ||
    content.length > 200_000 ||
    typeof input.providerModelId !== 'string' ||
    !UUID.test(input.providerModelId) ||
    !parameters
  ) {
    return undefined;
  }
  return { content, parameters, providerModelId: input.providerModelId };
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
  ) {}

  @Get()
  @UseGuards(AuthenticatedSessionGuard)
  async list(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    try {
      return {
        conversations: await this.chats.list(
          request.authenticatedSession!.principal,
        ),
      };
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
      return await this.chats.update(
        request.authenticatedSession!.principal,
        id,
        input,
      );
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
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id) || !UUID.test(branchId)) this.invalidInput();
    try {
      return await this.chats.activateBranch(
        request.authenticatedSession!.principal,
        id,
        branchId,
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
    const emit = (event: ChatEvent) => {
      response.write?.(`data: ${JSON.stringify(event)}\n\n`);
    };
    await this.execution.execute(
      {
        ...input,
        conversationId: id,
        principal: request.authenticatedSession!.principal,
      },
      emit,
      disconnected.signal,
    );
    completed = true;
    response.end?.();
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
    const emit = (event: ChatEvent) => {
      response.write?.(`data: ${JSON.stringify(event)}\n\n`);
    };
    await this.execution.regenerate(
      {
        ...input,
        assistantMessageId: messageId,
        conversationId: id,
        principal: request.authenticatedSession!.principal,
      },
      emit,
      disconnected.signal,
    );
    completed = true;
    response.end?.();
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
