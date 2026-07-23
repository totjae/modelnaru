import { Module } from '@nestjs/common';

import {
  AdminAccessController,
  PrincipalAccessController,
} from './access.controller.js';
import { AccessRepository } from './access.repository.js';
import { AccessService } from './access.service.js';
import { modelNaruConfigProvider } from './config.provider.js';
import { AuthController } from './auth.controller.js';
import {
  AdminMutationGuard,
  AdminSessionGuard,
  AuthenticatedMutationGuard,
  AuthenticatedSessionGuard,
} from './auth.guard.js';
import { AuthRateLimiter } from './auth.rate-limiter.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { ChatsController } from './chats.controller.js';
import { ChatExecutionService } from './chat-execution.service.js';
import { ChatMessagesRepository } from './chat-messages.repository.js';
import { ChatProviderService } from './chat-provider.service.js';
import { ChatsRepository } from './chats.repository.js';
import { ChatsService } from './chats.service.js';
import { HealthController } from './health.controller.js';
import { ProviderCredentialService } from './provider-credentials.js';
import { ProviderDiscoveryService } from './provider-discovery.js';
import { ProvidersController } from './providers.controller.js';
import { ProvidersRepository } from './providers.repository.js';
import { ProvidersService } from './providers.service.js';
import { DATABASE_HEALTH } from './tokens.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';
import { SummarizationController } from './summarization.controller.js';
import { SummarizationRepository } from './summarization.repository.js';
import { SummarizationService } from './summarization.service.js';
import { UsageController } from './usage.controller.js';
import { UsageRepository } from './usage.repository.js';
import { UsageService } from './usage.service.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    ProvidersController,
    AdminAccessController,
    PrincipalAccessController,
    ChatsController,
    SummarizationController,
    UsageController,
  ],
  providers: [
    modelNaruConfigProvider,
    DatabaseService,
    AuthRepository,
    AuthRateLimiter,
    AuthService,
    AdminSessionGuard,
    AdminMutationGuard,
    AuthenticatedSessionGuard,
    AuthenticatedMutationGuard,
    UsersRepository,
    UsersService,
    ProviderCredentialService,
    ProviderDiscoveryService,
    ProvidersRepository,
    ProvidersService,
    AccessRepository,
    AccessService,
    ChatsRepository,
    ChatsService,
    ChatMessagesRepository,
    ChatProviderService,
    ChatExecutionService,
    SummarizationRepository,
    SummarizationService,
    UsageRepository,
    UsageService,
    { provide: DATABASE_HEALTH, useExisting: DatabaseService },
  ],
})
export class AppModule {}
