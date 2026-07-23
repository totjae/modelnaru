import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

import { AdminSessionGuard } from './auth.guard.js';
import { isUsagePeriod } from './usage-period.js';
import { UsageService } from './usage.service.js';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

@Controller('admin/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @UseGuards(AdminSessionGuard)
  get(
    @Query('period') period: string | undefined,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const selected = period ?? '1d';
    if (!isUsagePeriod(selected)) {
      throw new HttpException(
        {
          error: {
            code: 'USAGE_PERIOD_INVALID',
            message: 'Usage period is invalid.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.usage.dashboard(selected);
  }
}
