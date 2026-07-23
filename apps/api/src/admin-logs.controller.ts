import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import {
  type AdminLogCategory,
  type AdminLogFilter,
} from './admin-logs.repository.js';
import { AdminLogsService } from './admin-logs.service.js';
import type { AdminRequest } from './auth.guard.js';
import { AdminMutationGuard, AdminSessionGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { isUsagePeriod, usagePeriodStart } from './usage-period.js';

interface ResponseLike {
  send?(value: string): void;
  setHeader(name: string, value: string): void;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const categories = new Set([
  'all',
  'ai',
  'security',
  'audit',
  'file',
  'system',
]);
const levels = new Set(['all', 'debug', 'info', 'warn', 'error']);
const statuses = new Set([
  'all',
  'pending',
  'completed',
  'failed',
  'cancelled',
  'success',
  'denied',
]);

@Controller('admin/logs')
export class AdminLogsController {
  constructor(
    private readonly logs: AdminLogsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  async list(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const filter = this.filter(query);
    const page = await this.logs.list(filter);
    await this.logs.auditAccess('logs.viewed', this.audit(request), {
      category: filter.category,
      page: page.page,
      period: query.period ?? '1d',
    });
    return page;
  }

  @Get('export')
  @UseGuards(AdminSessionGuard)
  async export(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AdminRequest,
    @Res() response: ResponseLike,
  ) {
    const filter = this.filter(query);
    const csv = await this.logs.export({
      category: filter.category,
      level: filter.level,
      search: filter.search,
      since: filter.since,
      status: filter.status,
    });
    await this.logs.auditAccess('logs.exported', this.audit(request), {
      category: filter.category,
      period: query.period ?? '1d',
    });
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="modelnaru-logs-${Date.now()}.csv"`,
    );
    response.send?.(csv);
  }

  @Get('settings')
  @UseGuards(AdminSessionGuard)
  settings(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return this.logs.settings();
  }

  @Put('settings')
  @UseGuards(AdminMutationGuard)
  updateSettings(
    @Body() body: unknown,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const input = this.retention(body);
    return this.logs.updateSettings(input, this.audit(request));
  }

  @Post('cleanup')
  @UseGuards(AdminMutationGuard)
  async cleanup(@Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    return { deletedCount: await this.logs.runCleanup() };
  }

  @Get(':id')
  @UseGuards(AdminSessionGuard)
  async detail(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!UUID.test(id)) this.invalid();
    const item = await this.logs.detail(id);
    if (!item) {
      throw new HttpException(
        { error: { code: 'LOG_NOT_FOUND', message: 'Log not found.' } },
        HttpStatus.NOT_FOUND,
      );
    }
    await this.logs.auditAccess('logs.viewed', this.audit(request), {
      logId: id,
    });
    return item;
  }

  private filter(query: Record<string, string | undefined>): AdminLogFilter {
    const category = query.category ?? 'all';
    const level = query.level ?? 'all';
    const status = query.status ?? 'all';
    const period = query.period ?? '1d';
    const page = Number(query.page ?? '1');
    const pageSize = Number(query.pageSize ?? '50');
    const search = (query.search ?? '').trim();
    if (
      !categories.has(category) ||
      !levels.has(level) ||
      !statuses.has(status) ||
      !isUsagePeriod(period) ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 10 ||
      pageSize > 100 ||
      search.length > 100
    ) {
      this.invalid();
    }
    return {
      category: category as AdminLogCategory,
      level,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search,
      since: usagePeriodStart(period),
      status,
    };
  }

  private retention(body: unknown) {
    const input =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const values = {
      aiRetentionDays: input.aiRetentionDays,
      auditRetentionDays: input.auditRetentionDays,
      fileRetentionDays: input.fileRetentionDays,
      securityRetentionDays: input.securityRetentionDays,
      systemRetentionDays: input.systemRetentionDays,
    };
    const ranges: Record<keyof typeof values, [number, number]> = {
      aiRetentionDays: [7, 365],
      auditRetentionDays: [90, 1_825],
      fileRetentionDays: [7, 365],
      securityRetentionDays: [30, 730],
      systemRetentionDays: [7, 180],
    };
    for (const [key, value] of Object.entries(values) as Array<
      [keyof typeof values, unknown]
    >) {
      const [minimum, maximum] = ranges[key];
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < minimum ||
        value > maximum
      ) {
        this.invalid();
      }
    }
    return values as {
      aiRetentionDays: number;
      auditRetentionDays: number;
      fileRetentionDays: number;
      securityRetentionDays: number;
      systemRetentionDays: number;
    };
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
          code: 'LOG_INPUT_INVALID',
          message: 'Log query or settings are invalid.',
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
