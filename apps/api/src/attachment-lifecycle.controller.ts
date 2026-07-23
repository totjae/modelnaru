import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import type { AdminRequest } from './auth.guard.js';
import { AdminMutationGuard, AdminSessionGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

@Controller('admin/file-settings')
export class AttachmentLifecycleController {
  constructor(
    private readonly lifecycle: AttachmentLifecycleService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  get(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return this.lifecycle.settings();
  }

  @Put()
  @UseGuards(AdminMutationGuard)
  update(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const retentionDays =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).retentionDays
        : undefined;
    if (
      typeof retentionDays !== 'number' ||
      !Number.isInteger(retentionDays) ||
      retentionDays < 1 ||
      retentionDays > 3_650
    ) {
      throw new HttpException(
        {
          error: {
            code: 'FILE_SETTINGS_INPUT_INVALID',
            message: 'File retention settings are invalid.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.lifecycle.updateRetention(retentionDays, this.audit(request));
  }

  @Post('cleanup')
  @UseGuards(AdminMutationGuard)
  runCleanup(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.lifecycle.runNow(this.audit(request));
  }

  private audit(request: AdminRequest) {
    return {
      actorId: request.adminSession!.row.accountKey,
      ipHash: this.auth.hashIpAddress(
        request.ip ?? request.socket?.remoteAddress,
      ),
    };
  }
}
