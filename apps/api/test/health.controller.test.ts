import type { LoadedConfig } from '@modelnaru/config';
import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from '../src/health.controller.js';
import type { DatabaseHealth } from '../src/tokens.js';

const loadedConfig = {
  sourcePath: '/deployment/config.yaml',
} as LoadedConfig;

describe('HealthController', () => {
  const database = {
    ping: () => Promise.resolve(),
  } satisfies DatabaseHealth;
  const controller = new HealthController(loadedConfig, database);

  it('reports liveness without exposing configuration', () => {
    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'modelnaru-api',
    });
  });

  it('reports readiness after config and database checks', async () => {
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { config: 'ok', database: 'ok' },
    });
  });

  it('reports service unavailable without exposing database details', async () => {
    const failingDatabase = {
      ping: () =>
        Promise.reject(new Error('connection contains sensitive details')),
    } satisfies DatabaseHealth;
    const failingController = new HealthController(
      loadedConfig,
      failingDatabase,
    );

    await expect(failingController.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(failingController.ready()).rejects.not.toThrow(
      'sensitive details',
    );
  });
});
