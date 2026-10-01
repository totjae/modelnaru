import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  Res,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import {
  AdminMutationGuard,
  AdminSessionGuard,
  type AdminRequest,
} from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TitleGenerationRepository } from './title-generation.repository.js';

@Controller('admin/title-generation')
export class TitleGenerationController {
  constructor(
    private readonly repository: TitleGenerationRepository,
    private readonly auth: AuthService,
  ) {}
  @Get()
  @UseGuards(AdminSessionGuard)
  get(
    @Res({ passthrough: true })
    response: {
      setHeader(name: string, value: string): void;
    },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.repository.settings();
  }
  @Put()
  @UseGuards(AdminMutationGuard)
  async update(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    const model = input?.providerModelId;
    if (
      !input ||
      Object.keys(input).some((key) => key !== 'providerModelId') ||
      (model !== null &&
        (typeof model !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            model,
          )))
    )
      throw new HttpException(
        {
          error: {
            code: 'TITLE_INPUT_INVALID',
            message: 'Title settings are invalid.',
          },
        },
        400,
      );
    try {
      return await this.repository.updateSettings(
        model,
        request.adminSession!.row.accountKey,
        this.auth.hashIpAddress(request.ip ?? request.socket?.remoteAddress),
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'TITLE_MODEL_UNAVAILABLE')
        throw new HttpException(
          {
            error: {
              code: 'TITLE_MODEL_UNAVAILABLE',
              message: 'Title model is unavailable.',
            },
          },
          409,
        );
      throw error;
    }
  }
}
