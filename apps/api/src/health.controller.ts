import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { LoadedConfig } from '@modelnaru/config';

import {
  DATABASE_HEALTH,
  MODELNARU_CONFIG,
  type DatabaseHealth,
} from './tokens.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
    @Inject(DATABASE_HEALTH) private readonly database: DatabaseHealth,
  ) {}

  @Get('live')
  live(): { service: string; status: 'ok' } {
    return { status: 'ok', service: 'modelnaru-api' };
  }

  @Get('ready')
  async ready(): Promise<{
    checks: { config: 'ok'; database: 'ok' };
    status: 'ready';
  }> {
    void this.loadedConfig.sourcePath;
    try {
      await this.database.ping();
      return {
        status: 'ready',
        checks: { config: 'ok', database: 'ok' },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { config: 'ok', database: 'error' },
      });
    }
  }
}
