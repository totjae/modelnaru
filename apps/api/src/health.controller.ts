import { Controller, Get, Inject } from '@nestjs/common';

import type { LoadedConfig } from '@modelnaru/config';

import { MODELNARU_CONFIG } from './tokens.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
  ) {}

  @Get('live')
  live(): { service: string; status: 'ok' } {
    return { status: 'ok', service: 'modelnaru-api' };
  }

  @Get('ready')
  ready(): { checks: { config: 'ok' }; status: 'ready' } {
    void this.loadedConfig.sourcePath;
    return { status: 'ready', checks: { config: 'ok' } };
  }
}
