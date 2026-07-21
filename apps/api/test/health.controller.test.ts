import type { LoadedConfig } from '@modelnaru/config';
import { describe, expect, it } from 'vitest';

import { HealthController } from '../src/health.controller.js';

const loadedConfig = {
  sourcePath: '/deployment/config.yaml',
} as LoadedConfig;

describe('HealthController', () => {
  const controller = new HealthController(loadedConfig);

  it('reports liveness without exposing configuration', () => {
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'modelnaru-api',
    });
  });

  it('reports readiness after config injection', () => {
    expect(controller.ready()).toEqual({
      status: 'ready',
      checks: { config: 'ok' },
    });
  });
});
