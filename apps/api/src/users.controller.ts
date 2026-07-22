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
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import {
  AdminMutationGuard,
  AdminSessionGuard,
  type AdminRequest,
} from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UserError, UsersService } from './users.service.js';
import type {
  UpdateUserRecordInput,
  UserAuditContext,
  UserRecord,
} from './users.repository.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

interface CreateUserBody {
  displayName: string | null;
  isEnabled: boolean;
  password: string;
  reason: string | null;
  username: string;
}

const USERNAME = /^[a-zA-Z0-9_.-]{3,64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function asRecord(body: unknown): Record<string, unknown> | undefined {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
}

function parseDisplayName(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length <= 100 ? normalized || null : undefined;
}

function parseReason(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 500
    ? normalized
    : undefined;
}

function validPassword(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length >= 8 && value.length <= 1_024
  );
}

function parseCreateBody(body: unknown): CreateUserBody | undefined {
  const record = asRecord(body);
  if (
    !record ||
    typeof record.username !== 'string' ||
    !USERNAME.test(record.username)
  ) {
    return undefined;
  }
  const displayName = parseDisplayName(record.displayName ?? null);
  const reason = parseReason(record.reason);
  if (
    displayName === undefined ||
    reason === undefined ||
    !validPassword(record.password)
  ) {
    return undefined;
  }
  if (record.isEnabled !== undefined && typeof record.isEnabled !== 'boolean') {
    return undefined;
  }
  return {
    displayName,
    isEnabled: record.isEnabled ?? true,
    password: record.password,
    reason,
    username: record.username,
  };
}

function parseUpdateBody(
  body: unknown,
): { patch: UpdateUserRecordInput; reason: string | null } | undefined {
  const record = asRecord(body);
  if (!record) return undefined;
  const patch: UpdateUserRecordInput = {};
  if (record.username !== undefined) {
    if (typeof record.username !== 'string' || !USERNAME.test(record.username))
      return undefined;
    patch.username = record.username;
  }
  if (record.displayName !== undefined) {
    const displayName = parseDisplayName(record.displayName);
    if (displayName === undefined) return undefined;
    patch.displayName = displayName;
  }
  if (record.isEnabled !== undefined) {
    if (typeof record.isEnabled !== 'boolean') return undefined;
    patch.isEnabled = record.isEnabled;
  }
  const reason = parseReason(record.reason);
  if (reason === undefined || Object.keys(patch).length === 0) return undefined;
  return { patch, reason };
}

@Controller('admin/users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  async list(
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<{ users: UserRecord[] }> {
    response.setHeader('Cache-Control', 'no-store');
    return { users: await this.users.list() };
  }

  @Post()
  @UseGuards(AdminMutationGuard)
  async create(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<UserRecord> {
    response.setHeader('Cache-Control', 'no-store');
    const input = parseCreateBody(body);
    if (!input) return this.invalidInput();
    try {
      return await this.users.create(
        {
          displayName: input.displayName,
          isEnabled: input.isEnabled,
          password: input.password,
          username: input.username,
        },
        this.auditContext(request, input.reason),
      );
    } catch (error) {
      return this.userError(error);
    }
  }

  @Patch(':id')
  @UseGuards(AdminMutationGuard)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<UserRecord> {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) return this.invalidInput();
    const input = parseUpdateBody(body);
    if (!input) return this.invalidInput();
    try {
      return await this.users.update(
        id,
        input.patch,
        this.auditContext(request, input.reason),
      );
    } catch (error) {
      return this.userError(error);
    }
  }

  @Put(':id/password')
  @UseGuards(AdminMutationGuard)
  async password(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<UserRecord> {
    response.setHeader('Cache-Control', 'no-store');
    const record = asRecord(body);
    const reason = parseReason(record?.reason);
    if (
      !UUID.test(id) ||
      !record ||
      !validPassword(record.password) ||
      reason === undefined
    ) {
      return this.invalidInput();
    }
    try {
      return await this.users.setPassword(
        id,
        record.password,
        this.auditContext(request, reason),
      );
    } catch (error) {
      return this.userError(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminMutationGuard)
  async delete(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const record = body === undefined ? {} : asRecord(body);
    const reason = parseReason(record?.reason);
    if (!UUID.test(id) || !record || reason === undefined) this.invalidInput();
    try {
      await this.users.delete(id, this.auditContext(request, reason ?? null));
    } catch (error) {
      this.userError(error);
    }
  }

  private auditContext(
    request: AdminRequest,
    reason: string | null,
  ): UserAuditContext {
    const session = request.adminSession;
    if (!session) {
      throw new Error('Admin guard did not attach a session');
    }
    return {
      actorId: session.row.accountKey,
      ipHash: this.auth.hashIpAddress(
        request.ip ?? request.socket?.remoteAddress,
      ),
      reason,
    };
  }

  private invalidInput(): never {
    throw new HttpException(
      {
        error: {
          code: 'USER_INPUT_INVALID',
          message: 'User input is invalid.',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private userError(error: unknown): never {
    if (error instanceof UserError) {
      throw new HttpException(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  }
}
