import { Injectable } from '@nestjs/common';

import { providerTemplateById } from './provider-catalog.js';
import { providerParameterPolicy } from './provider-parameter-policy.js';
import { hash, type Algorithm } from '@node-rs/argon2';

import type { AuthenticatedPrincipal } from './auth.service.js';
import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import {
  AccessDailyLimitError,
  AccessGuestCodeRequiredError,
  AccessModelNotAllowedError,
  AccessRepository,
  AccessSubjectNotFoundError,
  type AccessUpdateInput,
  type AdminAccessState,
  type GuestAccessUpdateInput,
} from './access.repository.js';
import type { ProviderAuditContext } from './providers.repository.js';

export type AccessErrorCode =
  | 'ACCESS_DAILY_LIMIT_REACHED'
  | 'ACCESS_INPUT_INVALID'
  | 'ACCESS_MODEL_FORBIDDEN'
  | 'ACCESS_SUBJECT_NOT_FOUND';

export class AccessError extends Error {
  constructor(
    readonly code: AccessErrorCode,
    readonly status: 400 | 404 | 429,
    message: string,
    readonly scope?: string,
  ) {
    super(message);
  }
}

async function hashAccessCode(accessCode: string): Promise<string> {
  return hash(accessCode, {
    algorithm: 2 as Algorithm,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
}

@Injectable()
export class AccessService {
  constructor(
    private readonly repository: AccessRepository,
    private readonly attachmentLifecycle: AttachmentLifecycleService = {
      flushQueuedFiles: () => Promise.resolve(),
    } as AttachmentLifecycleService,
  ) {}

  state(): Promise<AdminAccessState> {
    return this.repository.adminState();
  }

  async updateUser(
    userId: string,
    input: AccessUpdateInput,
    audit: ProviderAuditContext,
  ): Promise<AdminAccessState> {
    try {
      await this.repository.updateUserAccess(userId, input, audit);
      return await this.repository.adminState();
    } catch (error) {
      this.mapError(error);
    }
  }

  async updateGuest(
    input: Omit<GuestAccessUpdateInput, 'accessCodeHash'> & {
      accessCode?: string;
    },
    audit: ProviderAuditContext,
  ): Promise<AdminAccessState> {
    if (!this.validTimezone(input.resetTimezone)) {
      throw new AccessError(
        'ACCESS_INPUT_INVALID',
        400,
        'Reset timezone is invalid.',
      );
    }
    try {
      await this.repository.updateGuestAccess(
        {
          ...input,
          ...(input.accessCode
            ? { accessCodeHash: await hashAccessCode(input.accessCode) }
            : {}),
        },
        audit,
      );
      await this.attachmentLifecycle.flushQueuedFiles();
      return await this.repository.adminState();
    } catch (error) {
      this.mapError(error);
    }
  }

  async allowedModels(principal: AuthenticatedPrincipal): Promise<{
    models: Awaited<ReturnType<AccessRepository['allowedModels']>>;
  }> {
    if (principal.type === 'admin') {
      throw new AccessError(
        'ACCESS_MODEL_FORBIDDEN',
        404,
        'No user model workspace is available.',
      );
    }
    const models = await this.repository.allowedModels(principal);
    return {
      models: models.map((model) => {
        const template = providerTemplateById(model.templateId);
        return {
          ...model,
          ...(template
            ? {
                parameterPolicy: providerParameterPolicy(
                  template,
                  model.modelId,
                ),
              }
            : {}),
        };
      }),
    };
  }

  async reserveDailyRequest(
    principal: AuthenticatedPrincipal,
    providerModelId: string,
  ): Promise<void> {
    if (principal.type === 'admin') {
      throw new AccessError(
        'ACCESS_MODEL_FORBIDDEN',
        404,
        'The model is not available.',
      );
    }
    try {
      await this.repository.reserveDailyRequest(principal, providerModelId);
    } catch (error) {
      this.mapError(error);
    }
  }

  async assertModelAllowed(
    principal: AuthenticatedPrincipal,
    providerModelId: string,
  ): Promise<void> {
    if (principal.type === 'admin') {
      throw new AccessError(
        'ACCESS_MODEL_FORBIDDEN',
        404,
        'The model is not available.',
      );
    }
    try {
      await this.repository.assertModelAllowed(principal, providerModelId);
    } catch (error) {
      this.mapError(error);
    }
  }

  private validTimezone(value: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }

  private mapError(error: unknown): never {
    if (error instanceof AccessGuestCodeRequiredError) {
      throw new AccessError(
        'ACCESS_INPUT_INVALID',
        400,
        'A guest access code is required before enabling guest access.',
      );
    }
    if (error instanceof AccessSubjectNotFoundError) {
      throw new AccessError(
        'ACCESS_SUBJECT_NOT_FOUND',
        404,
        'The access subject or model was not found.',
      );
    }
    if (error instanceof AccessModelNotAllowedError) {
      throw new AccessError(
        'ACCESS_MODEL_FORBIDDEN',
        404,
        'The model is not available.',
      );
    }
    if (error instanceof AccessDailyLimitError) {
      throw new AccessError(
        'ACCESS_DAILY_LIMIT_REACHED',
        429,
        'The daily request limit has been reached.',
        error.scope,
      );
    }
    throw error;
  }
}
