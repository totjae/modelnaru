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

  @Post('provider-connections/custom')
  @UseGuards(AdminMutationGuard)
  async createCustom(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = recordBody(body);
    if (
      !input ||
      typeof input.name !== 'string' ||
      typeof input.baseUrl !== 'string' ||
      (input.authMode !== 'bearer' && input.authMode !== 'none') ||
      (input.destinationKind !== 'public' &&
        input.destinationKind !== 'local') ||
      (input.apiKey !== undefined && typeof input.apiKey !== 'string') ||
      (input.approvedLocalIp !== undefined &&
        typeof input.approvedLocalIp !== 'string') ||
      (input.approvedLocalPort !== undefined &&
        (!Number.isInteger(input.approvedLocalPort) ||
          typeof input.approvedLocalPort !== 'number'))
    )
      this.invalidInput();
    try {
      return await this.providers.createCustom(
        {
          name: input.name,
          baseUrl: input.baseUrl,
          authMode: input.authMode,
          destinationKind: input.destinationKind,
          ...(typeof input.apiKey === 'string' ? { apiKey: input.apiKey } : {}),
          ...(typeof input.approvedLocalIp === 'string'
            ? { approvedLocalIp: input.approvedLocalIp }
            : {}),
          ...(typeof input.approvedLocalPort === 'number'
            ? { approvedLocalPort: input.approvedLocalPort }
            : {}),
        },
        this.audit(request),
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post('provider-connections/:id/models/manual')
  @UseGuards(AdminMutationGuard)
  async addManualModel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = recordBody(body);
    if (
      !uuid(id) ||
      !input ||
      typeof input.modelId !== 'string' ||
      (input.displayName !== undefined &&
        typeof input.displayName !== 'string') ||
      (input.contextWindow !== undefined &&
        typeof input.contextWindow !== 'number') ||
      (input.maxOutputTokens !== undefined &&
        typeof input.maxOutputTokens !== 'number')
    )
      this.invalidInput();
    try {
      return await this.providers.addManualModel(
        id,
        {
          modelId: input.modelId,
          ...(typeof input.displayName === 'string'
            ? { displayName: input.displayName }
            : {}),
          ...(typeof input.contextWindow === 'number'
            ? { contextWindow: input.contextWindow }
            : {}),
          ...(typeof input.maxOutputTokens === 'number'
            ? { maxOutputTokens: input.maxOutputTokens }
            : {}),
        },
        this.audit(request),
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post('provider-connections/:id/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminMutationGuard)
  async testCustom(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = recordBody(body);
    if (
      !uuid(id) ||
      !input ||
      (input.stage !== 'network' &&
        input.stage !== 'models' &&
        input.stage !== 'chat') ||
      (input.providerModelId !== undefined &&
        (typeof input.providerModelId !== 'string' ||
          !uuid(input.providerModelId)))
    )
      this.invalidInput();
    try {
      return await this.providers.testCustom(
        id,
        input.stage,
        typeof input.providerModelId === 'string'
          ? input.providerModelId
          : undefined,
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
    const patch: {
      isEnabled?: boolean;
      name?: string;
      baseUrl?: string;
      authMode?: 'bearer' | 'none';
      apiKey?: string;
      destinationKind?: 'public' | 'local';
      approvedLocalIp?: string;
      approvedLocalPort?: number;
    } = {};
    if (typeof input?.name === 'string') patch.name = input.name.trim();
    if (typeof input?.isEnabled === 'boolean') {
      patch.isEnabled = input.isEnabled;
    }
    if (input && 'baseUrl' in input) {
      if (typeof input.baseUrl !== 'string') this.invalidInput();
      patch.baseUrl = input.baseUrl;
    }
    if (input && 'authMode' in input) {
      if (input.authMode !== 'bearer' && input.authMode !== 'none')
        this.invalidInput();
      patch.authMode = input.authMode;
    }
    if (input && 'apiKey' in input) {
      if (typeof input.apiKey !== 'string') this.invalidInput();
      patch.apiKey = input.apiKey;
    }
    if (input && 'destinationKind' in input) {
      if (
        input.destinationKind !== 'public' &&
        input.destinationKind !== 'local'
      )
        this.invalidInput();
      patch.destinationKind = input.destinationKind;
    }
    if (input && 'approvedLocalIp' in input) {
      if (typeof input.approvedLocalIp !== 'string') this.invalidInput();
      patch.approvedLocalIp = input.approvedLocalIp;
    }
    if (input && 'approvedLocalPort' in input) {
      if (
        typeof input.approvedLocalPort !== 'number' ||
        !Number.isInteger(input.approvedLocalPort)
      )
        this.invalidInput();
      patch.approvedLocalPort = input.approvedLocalPort;
    }
    if (
      Object.keys(patch).length === 0 ||
      (patch.name !== undefined &&
        (patch.name.length < 1 || patch.name.length > 100))
    ) {
      this.invalidInput();
    }
    try {
      if (
        patch.baseUrl !== undefined ||
        patch.authMode !== undefined ||
        patch.apiKey !== undefined ||
        patch.destinationKind !== undefined ||
        patch.approvedLocalIp !== undefined ||
        patch.approvedLocalPort !== undefined
      )
        return await this.providers.updateCustom(
          id,
          patch,
          this.audit(request),
        );
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
  @HttpCode(HttpStatus.OK)
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
    const patch: {
      isEnabled?: boolean;
      supportsImageInput?: boolean;
      supportsWebSearch?: boolean;
      imageTokenEstimate?: number | null;
    } = {};
    if (typeof input?.isEnabled === 'boolean') {
      patch.isEnabled = input.isEnabled;
    }
    if (typeof input?.supportsImageInput === 'boolean') {
      patch.supportsImageInput = input.supportsImageInput;
    }
    if (typeof input?.supportsWebSearch === 'boolean') {
      patch.supportsWebSearch = input.supportsWebSearch;
    }
    if (
      input &&
      'imageTokenEstimate' in input &&
      input.imageTokenEstimate !== null &&
      !(
        typeof input.imageTokenEstimate === 'number' &&
        Number.isInteger(input.imageTokenEstimate) &&
        input.imageTokenEstimate >= 1024 &&
        input.imageTokenEstimate <= 2_147_483_647
      )
    )
      this.invalidInput();
    if (
      input?.imageTokenEstimate === null ||
      (typeof input?.imageTokenEstimate === 'number' &&
        Number.isInteger(input.imageTokenEstimate) &&
        input.imageTokenEstimate >= 1024 &&
        input.imageTokenEstimate <= 2_147_483_647)
    ) {
      patch.imageTokenEstimate = input.imageTokenEstimate;
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
