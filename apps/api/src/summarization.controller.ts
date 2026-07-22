import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { AdminRequest } from './auth.guard.js';
import { AdminMutationGuard, AdminSessionGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SummarizationModelUnavailableError } from './summarization.repository.js';
import { SummarizationService } from './summarization.service.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

@Controller('admin/summarization')
export class SummarizationController {
  constructor(
    private readonly summarization: SummarizationService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  get(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return this.summarization.adminState();
  }

  @Put()
  @UseGuards(AdminMutationGuard)
  async update(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const record =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : undefined;
    const prompt =
      typeof record?.prompt === 'string' ? record.prompt.trim() : '';
    const providerModelId =
      record?.providerModelId === null
        ? null
        : typeof record?.providerModelId === 'string'
          ? record.providerModelId
          : undefined;
    const maxOutputTokens = record?.maxOutputTokens;
    const temperature = record?.temperature;
    const topP = record?.topP;
    if (
      prompt.length < 20 ||
      prompt.length > 20_000 ||
      providerModelId === undefined ||
      (providerModelId !== null && !uuid(providerModelId)) ||
      typeof maxOutputTokens !== 'number' ||
      !Number.isInteger(maxOutputTokens) ||
      maxOutputTokens < 128 ||
      maxOutputTokens > 32_768 ||
      (temperature !== null &&
        (typeof temperature !== 'number' ||
          !Number.isFinite(temperature) ||
          temperature < 0 ||
          temperature > 2)) ||
      (topP !== null &&
        (typeof topP !== 'number' ||
          !Number.isFinite(topP) ||
          topP < 0 ||
          topP > 1))
    ) {
      throw new HttpException(
        {
          error: {
            code: 'SUMMARIZATION_INPUT_INVALID',
            message: 'Summarization settings are invalid.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.summarization.updateAdminSettings({
        actorId: request.adminSession!.row.accountKey,
        ipHash: this.auth.hashIpAddress(
          request.ip ?? request.socket?.remoteAddress,
        ),
        maxOutputTokens,
        prompt,
        providerModelId,
        temperature,
        topP,
      });
    } catch (error) {
      if (error instanceof SummarizationModelUnavailableError) {
        throw new HttpException(
          {
            error: {
              code: 'SUMMARIZATION_MODEL_UNAVAILABLE',
              message: 'The selected summary model is unavailable.',
            },
          },
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
}
