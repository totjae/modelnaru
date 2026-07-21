import { Module } from '@nestjs/common';

import { modelNaruConfigProvider } from './config.provider.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { DATABASE_HEALTH } from './tokens.js';

@Module({
  controllers: [HealthController],
  providers: [
    modelNaruConfigProvider,
    DatabaseService,
    { provide: DATABASE_HEALTH, useExisting: DatabaseService },
  ],
})
export class AppModule {}
