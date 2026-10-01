import { Injectable } from '@nestjs/common';

import {
  providerCatalog,
  providerTemplateById,
  resolveProviderBaseUrl,
  type ProviderTemplate,
} from './provider-catalog.js';
import { ProviderCredentialService } from './provider-credentials.js';
import {
  normalizeCustomDestination,
  resolveCustomDestination,
  ProviderDestinationError,
  secureProviderFetch,
  type CustomDestination,
} from './provider-destination.js';
import { ChatUpstreamError, streamProvider } from './chat-streaming.js';
import {
  ProviderConnectionError,
  ProviderDiscoveryService,
} from './provider-discovery.js';
import {
  ProviderNotFoundError,
  ProviderInUseError,
  ProviderDiagnosticStaleError,
  ProvidersRepository,
  type ProviderAuditContext,
  type ProviderConnectionRecord,
  type ProviderModelRecord,
} from './providers.repository.js';

export type ProviderErrorCode =
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_CONNECTION_CONFLICT'
  | 'PROVIDER_DESTINATION_DENIED'
  | 'PROVIDER_INPUT_INVALID'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_IN_USE'
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

  async list(): Promise<ProviderConnectionRecord[]> {
    return (await this.repository.list()).map((connection) =>
      this.publicConnection(connection),
    );
  }

  async createCustom(
    input: {
      name: string;
      baseUrl: string;
      authMode: 'bearer' | 'none';
      apiKey?: string;
      destinationKind: 'public' | 'local';
      approvedLocalIp?: string;
      approvedLocalPort?: number;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    if (
      input.name.trim().length < 1 ||
      input.name.trim().length > 100 ||
      (input.authMode !== 'bearer' && input.authMode !== 'none') ||
      (input.authMode === 'bearer' &&
        (!input.apiKey ||
          input.apiKey.length < 8 ||
          input.apiKey.length > 4_096)) ||
      (input.authMode === 'none' && input.apiKey)
    )
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        400,
        'Custom Provider input is invalid.',
      );
    let destination: CustomDestination;
    try {
      destination = normalizeCustomDestination({
        baseUrl: input.baseUrl,
        destinationKind: input.destinationKind,
        approvedLocalIp: input.approvedLocalIp ?? null,
        approvedLocalPort: input.approvedLocalPort ?? null,
      });
      await resolveCustomDestination(destination);
    } catch (error) {
      if (error instanceof ProviderDestinationError)
        throw new ProviderError(
          'PROVIDER_DESTINATION_DENIED',
          422,
          error.message,
        );
      throw error;
    }
    const credential =
      input.authMode === 'bearer'
        ? await this.credentials.encrypt(input.apiKey!)
        : null;
    return this.mapNotFound(async () =>
      this.publicConnection(
        await this.repository.createCustom(
          {
            name: input.name.trim(),
            destination,
            authMode: input.authMode,
            credential,
            credentialHint:
              input.apiKey && input.apiKey.length >= 8
                ? input.apiKey.slice(-4)
                : null,
          },
          audit,
        ),
      ),
    );
  }

  async addManualModel(
    connectionId: string,
    input: {
      modelId: string;
      displayName?: string;
      contextWindow?: number;
      maxOutputTokens?: number;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderModelRecord> {
    if (
      !input.modelId ||
      input.modelId.length > 255 ||
      input.modelId.trim() !== input.modelId ||
      [...input.modelId].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) ||
      (input.displayName !== undefined && input.displayName.length > 255) ||
      (input.contextWindow !== undefined &&
        (!Number.isInteger(input.contextWindow) ||
          input.contextWindow < 1 ||
          input.contextWindow > 2_147_483_647)) ||
      (input.maxOutputTokens !== undefined &&
        (!Number.isInteger(input.maxOutputTokens) ||
          input.maxOutputTokens < 1 ||
          input.maxOutputTokens > 2_147_483_647))
    )
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        400,
        'Manual model input is invalid.',
      );
    return this.mapNotFound(() =>
      this.repository.addManualModel(
        connectionId,
        {
          modelId: input.modelId,
          displayName: input.displayName ?? null,
          contextWindow: input.contextWindow ?? null,
          maxOutputTokens: input.maxOutputTokens ?? null,
        },
        audit,
      ),
    );
  }

  async testCustom(
    id: string,
    stage: 'network' | 'models' | 'chat',
    providerModelId: string | undefined,
    audit: ProviderAuditContext,
  ) {
    const custom = await this.repository.findCustom(id);
    if (!custom || !custom.isEnabled) throw this.notFound();
    const template = providerTemplateById('custom-openai');
    if (!template) throw this.notFound();
    const apiKey =
      custom.authMode === 'bearer' && custom.credential
        ? await this.credentials.decrypt(custom.credential)
        : '';
    try {
      if (stage === 'network') {
        const response = await secureProviderFetch(
          custom.destination.baseUrl,
          { method: 'HEAD', signal: AbortSignal.timeout(15_000) },
          custom.destination,
        );
        await response.body?.cancel();
      } else if (stage === 'models') {
        await this.discovery.discoverCustom(
          template,
          apiKey,
          custom.destination,
        );
      } else {
        if (!providerModelId)
          throw new ProviderError(
            'PROVIDER_INPUT_INVALID',
            400,
            'A model is required for chat test.',
          );
        const model = await this.repository.findCustomModel(
          id,
          providerModelId,
        );
        if (!model) throw this.notFound();
        let receivedText = false;
        for await (const event of streamProvider(
          {
            apiKey,
            baseUrl: custom.destination.baseUrl,
            modelId: model.modelId,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            parameters: { maxOutputTokens: 16 },
            systemPrompt: '',
            signal: AbortSignal.timeout(30_000),
            template,
          },
          (url, init) =>
            secureProviderFetch(
              url instanceof Request
                ? url.url
                : url instanceof URL
                  ? url.href
                  : url,
              init ?? {},
              custom.destination,
            ),
        )) {
          if (event.type === 'text_delta' && event.text) receivedText = true;
        }
        if (!receivedText)
          throw new ProviderError(
            'PROVIDER_RESPONSE_INVALID',
            422,
            'Chat test returned no text.',
          );
      }
      return this.repository.recordDiagnostic(
        id,
        custom.version,
        stage,
        stage === 'network'
          ? 'reachable'
          : stage === 'models'
            ? 'models_available'
            : 'chat_verified',
        null,
        audit,
      );
    } catch (error) {
      if (error instanceof ProviderDiagnosticStaleError)
        throw new ProviderError(
          'PROVIDER_CONNECTION_CONFLICT',
          409,
          'Provider connection changed during the test.',
        );
      if (
        error instanceof ProviderError &&
        (error.code === 'PROVIDER_INPUT_INVALID' ||
          error.code === 'PROVIDER_NOT_FOUND')
      )
        throw error;
      const code =
        error instanceof ProviderDestinationError
          ? 'PROVIDER_DESTINATION_DENIED'
          : error instanceof ProviderConnectionError
            ? error.code
            : error instanceof ChatUpstreamError
              ? error.code === 'CHAT_PROVIDER_DESTINATION_DENIED'
                ? 'PROVIDER_DESTINATION_DENIED'
                : error.code === 'CHAT_PROVIDER_AUTH_FAILED'
                  ? 'PROVIDER_AUTH_FAILED'
                  : error.code === 'CHAT_PROVIDER_RATE_LIMITED'
                    ? 'PROVIDER_RATE_LIMITED'
                    : error.code === 'CHAT_PROVIDER_NETWORK_ERROR' ||
                        error.code === 'CHAT_PROVIDER_TIMEOUT'
                      ? 'PROVIDER_NETWORK_ERROR'
                      : error.code === 'CHAT_PROVIDER_RESPONSE_INVALID' ||
                          error.code === 'CHAT_PROVIDER_INCOMPLETE' ||
                          error.code === 'CHAT_EMPTY_RESPONSE'
                        ? 'PROVIDER_RESPONSE_INVALID'
                        : 'PROVIDER_UPSTREAM_ERROR'
              : error instanceof ProviderError
                ? error.code
                : 'PROVIDER_NETWORK_ERROR';
      try {
        await this.repository.recordDiagnostic(
          id,
          custom.version,
          stage,
          'failed',
          code,
          audit,
        );
      } catch (recordError) {
        if (recordError instanceof ProviderDiagnosticStaleError)
          throw new ProviderError(
            'PROVIDER_CONNECTION_CONFLICT',
            409,
            'Provider connection changed during the test.',
          );
        throw recordError;
      }
      throw new ProviderError(
        code,
        code === 'PROVIDER_RATE_LIMITED'
          ? 429
          : code === 'PROVIDER_NETWORK_ERROR' ||
              code === 'PROVIDER_UPSTREAM_ERROR'
            ? 502
            : 422,
        'Provider test failed.',
      );
    }
  }

  async create(
    input: {
      apiKey: string;
      configuration: Record<string, string>;
      name: string;
      templateId: string;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    const template = this.availableTemplate(input.templateId);
    this.validateCredential(template, input.apiKey);
    const baseUrl = resolveProviderBaseUrl(template, input.configuration);
    if (!baseUrl) {
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        422,
        'Provider configuration is invalid.',
      );
    }
    const models = await this.discover(template, input.apiKey, baseUrl);
    const credential = await this.credentials.encrypt(input.apiKey);
    try {
      return await this.repository.create(
        {
          baseUrl,
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
    const custom = await this.repository.findCustom(id);
    if (custom) {
      if (!custom.isEnabled) throw this.notFound();
      const template = providerTemplateById('custom-openai');
      if (!template) throw this.notFound();
      const apiKey =
        custom.authMode === 'bearer' && custom.credential
          ? await this.credentials.decrypt(custom.credential)
          : '';
      let models;
      try {
        models = await this.discovery.discoverCustom(
          template,
          apiKey,
          custom.destination,
        );
      } catch (error) {
        if (error instanceof ProviderDestinationError)
          throw new ProviderError(
            'PROVIDER_DESTINATION_DENIED',
            422,
            error.message,
          );
        if (error instanceof ProviderConnectionError)
          throw new ProviderError(
            error.code,
            error.code === 'PROVIDER_RATE_LIMITED'
              ? 429
              : error.code === 'PROVIDER_NETWORK_ERROR' ||
                  error.code === 'PROVIDER_UPSTREAM_ERROR'
                ? 502
                : 422,
            error.message,
          );
        throw error;
      }
      return this.publicConnection(
        await this.mapNotFound(() =>
          this.repository.syncModels(id, models, audit),
        ),
      );
    }
    const connection = await this.repository.findCredential(id);
    if (!connection) throw this.notFound();
    const template = this.availableTemplate(connection.templateId);
    const apiKey = await this.credentials.decrypt(connection);
    const models = await this.discover(template, apiKey, connection.baseUrl);
    return this.mapNotFound(() =>
      this.repository.syncModels(id, models, audit),
    );
  }

  async update(
    id: string,
    patch: { isEnabled?: boolean; name?: string },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.publicConnection(
      await this.mapNotFound(() => this.repository.update(id, patch, audit)),
    );
  }

  async updateCustom(
    id: string,
    patch: {
      name?: string;
      isEnabled?: boolean;
      baseUrl?: string;
      authMode?: 'bearer' | 'none';
      apiKey?: string;
      destinationKind?: 'public' | 'local';
      approvedLocalIp?: string;
      approvedLocalPort?: number;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    const existing = await this.repository.findCustom(id);
    if (!existing) throw this.notFound();
    if (
      patch.name !== undefined &&
      (patch.name.trim().length < 1 || patch.name.trim().length > 100)
    )
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        400,
        'Provider name is invalid.',
      );
    const authMode = patch.authMode ?? existing.authMode;
    if (
      (authMode === 'none' && patch.apiKey) ||
      (patch.apiKey !== undefined &&
        (patch.apiKey.length < 8 || patch.apiKey.length > 4_096))
    )
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        400,
        'Provider credential is invalid.',
      );
    const destinationKind =
      patch.destinationKind ?? existing.destination.destinationKind;
    let destination: CustomDestination;
    try {
      destination = normalizeCustomDestination({
        baseUrl: patch.baseUrl ?? existing.destination.baseUrl,
        destinationKind,
        approvedLocalIp:
          destinationKind === 'public'
            ? null
            : (patch.approvedLocalIp ?? existing.destination.approvedLocalIp),
        approvedLocalPort:
          destinationKind === 'public'
            ? null
            : (patch.approvedLocalPort ??
              existing.destination.approvedLocalPort),
      });
      if (
        patch.baseUrl !== undefined ||
        patch.destinationKind !== undefined ||
        patch.approvedLocalIp !== undefined ||
        patch.approvedLocalPort !== undefined
      )
        await resolveCustomDestination(destination);
    } catch (error) {
      if (error instanceof ProviderDestinationError)
        throw new ProviderError(
          'PROVIDER_DESTINATION_DENIED',
          422,
          error.message,
        );
      throw error;
    }
    const credential =
      authMode === 'none'
        ? null
        : patch.apiKey
          ? await this.credentials.encrypt(patch.apiKey)
          : existing.credential;
    if (authMode === 'bearer' && !credential)
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        400,
        'Bearer credential is required.',
      );
    const connectionChanged =
      destination.baseUrl !== existing.destination.baseUrl ||
      destination.destinationKind !== existing.destination.destinationKind ||
      destination.approvedLocalIp !== existing.destination.approvedLocalIp ||
      destination.approvedLocalPort !==
        existing.destination.approvedLocalPort ||
      authMode !== existing.authMode ||
      patch.apiKey !== undefined;
    return this.publicConnection(
      await this.mapNotFound(() =>
        this.repository.updateCustom(
          id,
          {
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.isEnabled !== undefined
              ? { isEnabled: patch.isEnabled }
              : {}),
            destination,
            authMode,
            credential,
            credentialHint:
              authMode === 'none'
                ? null
                : patch.apiKey
                  ? patch.apiKey.slice(-4)
                  : existing.credentialHint,
            connectionChanged,
          },
          audit,
        ),
      ),
    );
  }

  updateModel(
    id: string,
    patch: {
      isEnabled?: boolean;
      supportsImageInput?: boolean;
      supportsWebSearch?: boolean;
      imageTokenEstimate?: number | null;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderModelRecord> {
    return this.mapNotFound(() =>
      this.repository.updateModel(id, patch, audit),
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

  private async discover(
    template: ProviderTemplate,
    apiKey: string,
    baseUrl: string,
  ) {
    try {
      return await this.discovery.discover(template, apiKey, baseUrl);
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

  private validateCredential(template: ProviderTemplate, apiKey: string): void {
    const optional =
      template.authType === 'bearer-optional' || template.authType === 'none';
    if (
      (!optional && apiKey.length < 8) ||
      apiKey.length > 4_096 ||
      (apiKey.length > 0 && apiKey.length < 8)
    ) {
      throw new ProviderError(
        'PROVIDER_INPUT_INVALID',
        422,
        'Provider credential is invalid.',
      );
    }
  }

  private async mapNotFound<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProviderNotFoundError) throw this.notFound();
      if (error instanceof ProviderInUseError)
        throw new ProviderError(
          'PROVIDER_IN_USE',
          409,
          'Provider connection is in use.',
        );
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

  private publicConnection(
    connection: ProviderConnectionRecord,
  ): ProviderConnectionRecord {
    if (connection.kind !== 'custom') return connection;
    const url = new URL(connection.baseUrl);
    return {
      ...connection,
      baseUrl: '[REDACTED]',
      baseUrlDisplay: `${url.protocol}//[masked]${url.pathname}`,
      approvedLocalIpDisplay:
        connection.destinationKind === 'local' ? '[masked]' : null,
    };
  }
}
