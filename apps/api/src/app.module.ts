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
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsRepository } from './attachments.repository.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentLifecycleController } from './attachment-lifecycle.controller.js';
import { AttachmentLifecycleRepository } from './attachment-lifecycle.repository.js';
import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import { AdminLogsController } from './admin-logs.controller.js';
import { AdminLogsRepository } from './admin-logs.repository.js';
import { AdminLogsService } from './admin-logs.service.js';
import { RequestTraceService } from './request-trace.service.js';

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
    AttachmentsController,
    AttachmentLifecycleController,
    AdminLogsController,
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
    AdminLogsRepository,
    AdminLogsService,
    RequestTraceService,
    AttachmentLifecycleRepository,
    AttachmentLifecycleService,
    AttachmentsRepository,
    AttachmentsService,
    { provide: DATABASE_HEALTH, useExisting: DatabaseService },
  ],
})
export class AppModule {}
