import { Module } from '@nestjs/common';

import { modelNaruConfigProvider } from './config.provider.js';
import { AuthController } from './auth.controller.js';
import { AdminMutationGuard, AdminSessionGuard } from './auth.guard.js';
import { AuthRateLimiter } from './auth.rate-limiter.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { DATABASE_HEALTH } from './tokens.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [HealthController, AuthController, UsersController],
  providers: [
    modelNaruConfigProvider,
    DatabaseService,
    AuthRepository,
    AuthRateLimiter,
    AuthService,
    AdminSessionGuard,
    AdminMutationGuard,
    UsersRepository,
    UsersService,
    { provide: DATABASE_HEALTH, useExisting: DatabaseService },
  ],
})
export class AppModule {}
