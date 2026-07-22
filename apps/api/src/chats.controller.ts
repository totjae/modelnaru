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

import {
  AuthenticatedMutationGuard,
  type AuthenticatedRequest,
  AuthenticatedSessionGuard,
} from './auth.guard.js';
import { ChatError, ChatsService } from './chats.service.js';
import type {
  CreateConversationInput,
  UpdateConversationInput,
} from './chats.repository.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
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

@Controller('conversations')
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

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
    if (error instanceof ChatError) {
      throw new HttpException(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  }
}
