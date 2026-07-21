import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { LoadedConfig } from '@modelnaru/config';

import { AppModule } from './app.module.js';
import { MODELNARU_CONFIG } from './tokens.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const loaded = app.get<LoadedConfig>(MODELNARU_CONFIG);
  const trustProxy = loaded.config.server.trustProxy;

  if (trustProxy.enabled) {
    app.set('trust proxy', trustProxy.addresses);
  }

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = Number.parseInt(process.env.API_PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
