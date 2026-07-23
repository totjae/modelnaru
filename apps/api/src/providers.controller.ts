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

import type { AdminRequest } from './auth.guard.js';
import { AdminMutationGuard, AdminSessionGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ProviderError, ProvidersService } from './providers.service.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

function recordBody(body: unknown): Record<string, unknown> | undefined {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
}

function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

@Controller('admin')
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly auth: AuthService,
  ) {}

  @Get('provider-templates')
  @UseGuards(AdminSessionGuard)
  templates(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return { templates: this.providers.templates() };
  }

  @Get('provider-connections')
  @UseGuards(AdminSessionGuard)
  async list(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return { connections: await this.providers.list() };
  }

  @Post('provider-connections')
  @UseGuards(AdminMutationGuard)
  async create(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = recordBody(body);
    const templateId =
      typeof input?.templateId === 'string' ? input.templateId.trim() : '';
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
    const rawConfiguration = recordBody(input?.configuration);
    const configuration = Object.fromEntries(
      Object.entries(rawConfiguration ?? {}).filter(
        (entry): entry is [string, string] =>
          /^[A-Za-z0-9_-]{1,64}$/u.test(entry[0]) &&
          typeof entry[1] === 'string' &&
          entry[1].length <= 512,
      ),
    );
    if (
      !/^[a-z0-9][a-z0-9-]{1,63}$/u.test(templateId) ||
      name.length < 1 ||
      name.length > 100 ||
      apiKey.length > 4_096
    ) {
      this.invalidInput();
    }
    try {
      return await this.providers.create(
        { apiKey, configuration, name, templateId },
        this.audit(request),
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch('provider-connections/:id')
  @UseGuards(AdminMutationGuard)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!uuid(id)) this.invalidInput();
    const input = recordBody(body);
    const patch: { isEnabled?: boolean; name?: string } = {};
    if (typeof input?.name === 'string') patch.name = input.name.trim();
    if (typeof input?.isEnabled === 'boolean') {
      patch.isEnabled = input.isEnabled;
    }
    if (
      Object.keys(patch).length === 0 ||
      (patch.name !== undefined &&
        (patch.name.length < 1 || patch.name.length > 100))
    ) {
      this.invalidInput();
    }
    try {
      return await this.providers.update(id, patch, this.audit(request));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Delete('provider-connections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminMutationGuard)
  async disable(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (!uuid(id)) this.invalidInput();
    try {
      await this.providers.update(
        id,
        { isEnabled: false },
        this.audit(request),
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post('provider-connections/:id/models/sync')
  @UseGuards(AdminMutationGuard)
  async syncModels(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!uuid(id)) this.invalidInput();
    try {
      return await this.providers.syncModels(id, this.audit(request));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch('provider-models/:id')
  @UseGuards(AdminMutationGuard)
  async updateModel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = recordBody(body);
    const patch: { isEnabled?: boolean; supportsImageInput?: boolean } = {};
    if (typeof input?.isEnabled === 'boolean') {
      patch.isEnabled = input.isEnabled;
    }
    if (typeof input?.supportsImageInput === 'boolean') {
      patch.supportsImageInput = input.supportsImageInput;
    }
    if (!uuid(id) || Object.keys(patch).length === 0) {
      this.invalidInput();
    }
    try {
      return await this.providers.updateModel(id, patch, this.audit(request));
    } catch (error) {
      this.mapError(error);
    }
  }

  private audit(request: AdminRequest) {
    return {
      actorId: request.adminSession!.row.accountKey,
      ipHash: this.auth.hashIpAddress(
        request.ip ?? request.socket?.remoteAddress,
      ),
    };
  }

  private invalidInput(): never {
    throw new HttpException(
      {
        error: {
          code: 'PROVIDER_INPUT_INVALID',
          message: 'Provider input is invalid.',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private mapError(error: unknown): never {
    if (error instanceof ProviderError) {
      throw new HttpException(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  }
}
