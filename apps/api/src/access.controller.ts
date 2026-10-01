import {
  Body,
  Delete,
  HttpCode,
  Query,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { AccessError, AccessService } from './access.service.js';
import {
  AdminMutationGuard,
  AdminSessionGuard,
  AuthenticatedSessionGuard,
  AuthenticatedMutationGuard,
  type AdminRequest,
  type AuthenticatedRequest,
} from './auth.guard.js';
import { AuthService } from './auth.service.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function dailyLimit(value: unknown, maximum = 100_000): number | null | false {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maximum
    ? value
    : false;
}

function permissions(value: unknown) {
  if (!Array.isArray(value) || value.length > 10_000) return undefined;
  const output: Array<{
    dailyRequestLimit: number | null;
    providerModelId: string;
  }> = [];
  const ids = new Set<string>();
  for (const item of value) {
    const permission = record(item);
    const id = permission?.providerModelId;
    const limit = dailyLimit(permission?.dailyRequestLimit);
    if (typeof id !== 'string' || !UUID.test(id) || limit === false) {
      return undefined;
    }
    if (ids.has(id)) return undefined;
    ids.add(id);
    output.push({ dailyRequestLimit: limit, providerModelId: id });
  }
  return output;
}

function userAccessBody(body: unknown) {
  const input = record(body);
  const limit = dailyLimit(input?.dailyRequestLimit);
  const parsedPermissions = permissions(input?.permissions);
  return input && limit !== false && parsedPermissions
    ? { dailyRequestLimit: limit, permissions: parsedPermissions }
    : undefined;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function guestAccessBody(body: unknown) {
  const input = record(body);
  if (!input) return undefined;
  const parsedPermissions = permissions(input.permissions);
  const maximumActiveSessions = boundedInteger(
    input.maximumActiveSessions,
    1,
    100,
  );
  const sessionDailyRequestLimit = dailyLimit(
    input.sessionDailyRequestLimit,
    1_000,
  );
  const globalDailyRequestLimit = boundedInteger(
    input.globalDailyRequestLimit,
    1,
    100_000,
  );
  const idleTimeoutMinutes = boundedInteger(input.idleTimeoutMinutes, 15, 360);
  const absoluteTimeoutHours = boundedInteger(
    input.absoluteTimeoutHours,
    1,
    72,
  );
  const accessCode = input.accessCode;
  if (
    typeof input.isEnabled !== 'boolean' ||
    typeof input.fileUploadEnabled !== 'boolean' ||
    typeof input.requestTraceEnabled !== 'boolean' ||
    typeof input.resetTimezone !== 'string' ||
    input.resetTimezone.length < 1 ||
    input.resetTimezone.length > 64 ||
    !parsedPermissions ||
    !maximumActiveSessions ||
    sessionDailyRequestLimit === false ||
    sessionDailyRequestLimit === null ||
    !globalDailyRequestLimit ||
    !idleTimeoutMinutes ||
    !absoluteTimeoutHours ||
    (accessCode !== undefined &&
      (typeof accessCode !== 'string' ||
        accessCode.length < 6 ||
        accessCode.length > 128))
  ) {
    return undefined;
  }
  return {
    absoluteTimeoutHours,
    ...(typeof accessCode === 'string' ? { accessCode } : {}),
    dailyRequestLimit: sessionDailyRequestLimit,
    fileUploadEnabled: input.fileUploadEnabled,
    globalDailyRequestLimit,
    idleTimeoutMinutes,
    isEnabled: input.isEnabled,
    maximumActiveSessions,
    permissions: parsedPermissions,
    resetTimezone: input.resetTimezone,
    requestTraceEnabled: input.requestTraceEnabled,
  };
}

@Controller('admin/access')
export class AdminAccessController {
  constructor(
    private readonly access: AccessService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  async state(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return this.access.state();
  }

  @Put('users/:id')
  @UseGuards(AdminMutationGuard)
  async updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = userAccessBody(body);
    if (!UUID.test(id) || !input) return this.invalid();
    try {
      return await this.access.updateUser(id, input, this.audit(request));
    } catch (error) {
      return this.mapError(error);
    }
  }

  @Put('guest')
  @UseGuards(AdminMutationGuard)
  async updateGuest(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = guestAccessBody(body);
    if (!input) return this.invalid();
    try {
      return await this.access.updateGuest(input, this.audit(request));
    } catch (error) {
      return this.mapError(error);
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

  private invalid(): never {
    throw new HttpException(
      {
        error: {
          code: 'ACCESS_INPUT_INVALID',
          message: 'Access policy input is invalid.',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private mapError(error: unknown): never {
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
    throw error;
  }
}

@Controller('access')
export class PrincipalAccessController {
  constructor(private readonly access: AccessService) {}

  @Get('models')
  @UseGuards(AuthenticatedSessionGuard)
  async models(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
    @Query() query: Record<string, string | undefined> = {},
  ) {
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (
        Object.keys(query).some(
          (key) =>
            ![
              'query',
              'provider',
              'image',
              'webSearch',
              'favoriteOnly',
            ].includes(key),
        ) ||
        Object.values(query).some((value) => typeof value !== 'string')
      )
        throw new AccessError(
          'ACCESS_INPUT_INVALID',
          400,
          'Model filters are invalid.',
        );
      const state = await this.access.allowedModels(
        request.authenticatedSession!.principal,
      );
      const text = (query.query ?? '')
        .trim()
        .normalize('NFC')
        .toLocaleLowerCase();
      if (
        text.length > 200 ||
        (query.provider?.length ?? 0) > 100 ||
        ['image', 'webSearch', 'favoriteOnly'].some(
          (key) =>
            query[key] !== undefined && !['true', 'false'].includes(query[key]),
        )
      )
        throw new AccessError(
          'ACCESS_INPUT_INVALID',
          400,
          'Model filters are invalid.',
        );
      const favorites = await this.access.favorites(
        request.authenticatedSession!.principal,
      );
      const ids = new Set(favorites.favorites.map((f) => f.providerModelId));
      return {
        models: state.models
          .filter(
            (model) =>
              (!text ||
                `${model.connectionName} ${model.displayName ?? ''} ${model.modelId}`
                  .toLocaleLowerCase()
                  .includes(text)) &&
              (!query.provider || model.connectionName === query.provider) &&
              (query.image === undefined ||
                model.supportsImageInput === (query.image === 'true')) &&
              (query.webSearch === undefined ||
                model.supportsWebSearch === (query.webSearch === 'true')) &&
              (query.favoriteOnly === undefined ||
                ids.has(model.id) === (query.favoriteOnly === 'true')),
          )
          .map((model) => ({ ...model, isFavorite: ids.has(model.id) })),
      };
    } catch (error) {
      if (error instanceof AccessError) {
        throw new HttpException(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      }
      throw error;
    }
  }
}

@Controller('model-favorites')
export class ModelFavoritesController {
  constructor(private readonly access: AccessService) {}
  @Get()
  @UseGuards(AuthenticatedSessionGuard)
  async list(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    try {
      return await this.access.favorites(
        request.authenticatedSession!.principal,
      );
    } catch (error) {
      if (error instanceof AccessError)
        throw new HttpException(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      throw error;
    }
  }
  @Put(':id')
  @HttpCode(204)
  @UseGuards(AuthenticatedMutationGuard)
  async put(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    await this.mutate(id, request, response, true);
  }
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthenticatedMutationGuard)
  async delete(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    await this.mutate(id, request, response, false);
  }
  private async mutate(
    id: string,
    request: AuthenticatedRequest,
    response: ResponseLike,
    enabled: boolean,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id))
      throw new HttpException(
        {
          error: {
            code: 'ACCESS_INPUT_INVALID',
            message: 'Model ID is invalid.',
          },
        },
        400,
      );
    try {
      await this.access.setFavorite(
        request.authenticatedSession!.principal,
        id,
        enabled,
      );
    } catch (error) {
      if (error instanceof AccessError)
        throw new HttpException(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      throw error;
    }
  }
}
