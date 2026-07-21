import { Module } from '@nestjs/common';

import { modelNaruConfigProvider } from './config.provider.js';
import { AuthController } from './auth.controller.js';
import { AuthRateLimiter } from './auth.rate-limiter.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { DATABASE_HEALTH } from './tokens.js';

@Module({
  controllers: [HealthController, AuthController],
  providers: [
    modelNaruConfigProvider,
    DatabaseService,
    AuthRepository,
    AuthRateLimiter,
    AuthService,
    { provide: DATABASE_HEALTH, useExisting: DatabaseService },
  ],
})
export class AppModule {}
