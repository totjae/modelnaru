import { Injectable } from '@nestjs/common';

import {
  providerCatalog,
  providerTemplateById,
  type ProviderTemplate,
} from './provider-catalog.js';
import { ProviderCredentialService } from './provider-credentials.js';
import {
  ProviderConnectionError,
  ProviderDiscoveryService,
} from './provider-discovery.js';
import {
  ProviderNotFoundError,
  ProvidersRepository,
  type ProviderAuditContext,
  type ProviderConnectionRecord,
  type ProviderModelRecord,
} from './providers.repository.js';

export type ProviderErrorCode =
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_CONNECTION_CONFLICT'
  | 'PROVIDER_INPUT_INVALID'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'PROVIDER_TEMPLATE_UNAVAILABLE'
  | 'PROVIDER_UPSTREAM_ERROR';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly status: 400 | 404 | 409 | 422 | 429 | 502,
    message: string,
  ) {
    super(message);
  }
}

function databaseCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly repository: ProvidersRepository,
    private readonly credentials: ProviderCredentialService,
    private readonly discovery: ProviderDiscoveryService,
  ) {}

  templates(): readonly ProviderTemplate[] {
    return providerCatalog;
  }

  list(): Promise<ProviderConnectionRecord[]> {
    return this.repository.list();
  }

  async create(
    input: {
      apiKey: string;
      name: string;
      templateId: string;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    const template = this.availableTemplate(input.templateId);
    const models = await this.discover(template, input.apiKey);
    const credential = await this.credentials.encrypt(input.apiKey);
    try {
      return await this.repository.create(
        {
          baseUrl: template.baseUrl!,
          credential,
          credentialHint:
            input.apiKey.length >= 8 ? input.apiKey.slice(-4) : null,
          models,
          name: input.name,
          templateId: template.id,
        },
        audit,
      );
    } catch (error) {
      if (databaseCode(error) === '23505') {
        throw new ProviderError(
          'PROVIDER_CONNECTION_CONFLICT',
          409,
          'A provider connection with that name already exists.',
        );
      }
      throw error;
    }
  }

  async syncModels(
    id: string,
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    const connection = await this.repository.findCredential(id);
    if (!connection) throw this.notFound();
    const template = this.availableTemplate(connection.templateId);
    const apiKey = await this.credentials.decrypt(connection);
    const models = await this.discover(template, apiKey);
    return this.mapNotFound(() =>
      this.repository.syncModels(id, models, audit),
    );
  }

  update(
    id: string,
    patch: { isEnabled?: boolean; name?: string },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.mapNotFound(() => this.repository.update(id, patch, audit));
  }

  setModelEnabled(
    id: string,
    isEnabled: boolean,
    audit: ProviderAuditContext,
  ): Promise<ProviderModelRecord> {
    return this.mapNotFound(() =>
      this.repository.setModelEnabled(id, isEnabled, audit),
    );
  }

  private availableTemplate(id: string): ProviderTemplate {
    const template = providerTemplateById(id);
    if (!template?.canRegister) {
      throw new ProviderError(
        'PROVIDER_TEMPLATE_UNAVAILABLE',
        422,
        'This provider template is not available for registration yet.',
      );
    }
    return template;
  }

  private async discover(template: ProviderTemplate, apiKey: string) {
    try {
      return await this.discovery.discover(template, apiKey);
    } catch (error) {
      if (error instanceof ProviderConnectionError) {
        const status =
          error.code === 'PROVIDER_RATE_LIMITED'
            ? 429
            : error.code === 'PROVIDER_NETWORK_ERROR' ||
                error.code === 'PROVIDER_UPSTREAM_ERROR'
              ? 502
              : 422;
        throw new ProviderError(error.code, status, error.message);
      }
      throw error;
    }
  }

  private async mapNotFound<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProviderNotFoundError) throw this.notFound();
      if (databaseCode(error) === '23505') {
        throw new ProviderError(
          'PROVIDER_CONNECTION_CONFLICT',
          409,
          'A provider connection with that name already exists.',
        );
      }
      throw error;
    }
  }

  private notFound(): ProviderError {
    return new ProviderError(
      'PROVIDER_NOT_FOUND',
      404,
      'Provider connection or model was not found.',
    );
  }
}
