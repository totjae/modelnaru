import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';

import { DatabaseService } from './database.service.js';
import type { EncryptedProviderSecret } from './provider-credentials.js';
import type { DiscoveredProviderModel } from './provider-discovery.js';
import type {
  CustomDestination,
  DestinationKind,
} from './provider-destination.js';

export interface ProviderAuditContext {
  actorId: string;
  ipHash: Buffer | null;
}

export interface ProviderModelRecord {
  contextWindow: number | null;
  displayName: string | null;
  id: string;
  isAvailable: boolean;
  isEnabled: boolean;
  maxOutputTokens: number | null;
  modelId: string;
  providerConnectionId: string;
  supportsImageInput: boolean;
  supportsWebSearch: boolean;
  source?: 'discovered' | 'manual';
  imageTokenEstimate?: number | null;
}

export interface ProviderConnectionRecord {
  baseUrl: string;
  createdAt: Date;
  credentialHint: string | null;
  id: string;
  isEnabled: boolean;
  lastModelSyncAt: Date | null;
  models: ProviderModelRecord[];
  name: string;
  status: 'error' | 'ready';
  templateId: string;
  updatedAt: Date;
  kind?: 'builtin' | 'custom';
  authMode?: 'bearer' | 'none';
  destinationKind?: DestinationKind;
  baseUrlDisplay?: string;
  approvedLocalIpDisplay?: string | null;
  diagnostics?: Record<
    'network' | 'models' | 'chat',
    {
      status: string | null;
      checkedAt: Date | null;
      errorCode: string | null;
    }
  >;
}

export interface ProviderConnectionCredentialRecord
  extends Omit<ProviderConnectionRecord, 'models'>, EncryptedProviderSecret {}

interface RawConnectionRow {
  base_url: string;
  created_at: Date;
  credential_auth_tag?: Buffer;
  credential_ciphertext?: Buffer;
  credential_hint: string | null;
  credential_nonce?: Buffer;
  id: string;
  is_enabled: boolean;
  last_model_sync_at: Date | null;
  name: string;
  status: 'error' | 'ready';
  template_id: string;
  updated_at: Date;
  kind?: 'builtin' | 'custom';
  auth_mode?: 'bearer' | 'none';
  destination_kind?: DestinationKind;
  approved_local_ip?: string | null;
  approved_local_port?: number | null;
  diagnostic_network_status?: string | null;
  diagnostic_network_checked_at?: Date | null;
  diagnostic_network_error_code?: string | null;
  diagnostic_models_status?: string | null;
  diagnostic_models_checked_at?: Date | null;
  diagnostic_models_error_code?: string | null;
  diagnostic_chat_status?: string | null;
  diagnostic_chat_checked_at?: Date | null;
  diagnostic_chat_error_code?: string | null;
}

interface RawModelRow {
  context_window: number | null;
  display_name: string | null;
  id: string;
  is_available: boolean;
  is_enabled: boolean;
  max_output_tokens: number | null;
  model_id: string;
  provider_connection_id: string;
  supports_image_input: boolean;
  supports_web_search: boolean;
  source?: 'discovered' | 'manual';
  image_token_estimate?: number | null;
}

export class ProviderNotFoundError extends Error {}
export class ProviderInUseError extends Error {}
export class ProviderDiagnosticStaleError extends Error {}

function mapModel(row: RawModelRow): ProviderModelRecord {
  return {
    contextWindow: row.context_window,
    displayName: row.display_name,
    id: row.id,
    isAvailable: row.is_available,
    isEnabled: row.is_enabled,
    maxOutputTokens: row.max_output_tokens,
    modelId: row.model_id,
    providerConnectionId: row.provider_connection_id,
    supportsImageInput: row.supports_image_input,
    supportsWebSearch: row.supports_web_search,
    ...(row.source ? { source: row.source } : {}),
    ...(row.image_token_estimate !== undefined
      ? { imageTokenEstimate: row.image_token_estimate }
      : {}),
  };
}

function mapConnection(
  row: RawConnectionRow,
  models: ProviderModelRecord[] = [],
): ProviderConnectionRecord {
  return {
    baseUrl: row.base_url,
    createdAt: row.created_at,
    credentialHint: row.credential_hint,
    id: row.id,
    isEnabled: row.is_enabled,
    lastModelSyncAt: row.last_model_sync_at,
    models,
    name: row.name,
    status: row.status,
    templateId: row.template_id,
    updatedAt: row.updated_at,
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.auth_mode ? { authMode: row.auth_mode } : {}),
    ...(row.destination_kind ? { destinationKind: row.destination_kind } : {}),
    ...(row.kind === 'custom'
      ? {
          diagnostics: {
            network: {
              status: row.diagnostic_network_status ?? null,
              checkedAt: row.diagnostic_network_checked_at ?? null,
              errorCode: row.diagnostic_network_error_code ?? null,
            },
            models: {
              status: row.diagnostic_models_status ?? null,
              checkedAt: row.diagnostic_models_checked_at ?? null,
              errorCode: row.diagnostic_models_error_code ?? null,
            },
            chat: {
              status: row.diagnostic_chat_status ?? null,
              checkedAt: row.diagnostic_chat_checked_at ?? null,
              errorCode: row.diagnostic_chat_error_code ?? null,
            },
          },
        }
      : {}),
  };
}

async function writeAudit(
  transaction: DatabaseTransaction,
  input: {
    action: string;
    after: JSONValue | null;
    audit: ProviderAuditContext;
    targetId: string;
    targetType: 'provider_connection' | 'provider_model';
  },
): Promise<void> {
  await transaction`
    INSERT INTO audit_logs (
      actor_type, actor_id, action, target_type, target_id, after_data, ip_hash
    ) VALUES (
      'admin',
      ${input.audit.actorId},
      ${input.action},
      ${input.targetType},
      ${input.targetId},
      ${input.after ? transaction.json(input.after) : null},
      ${input.audit.ipHash}
    )
  `;
}

@Injectable()
export class ProvidersRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<ProviderConnectionRecord[]> {
    const sql = this.database.getClient();
    const connections = await sql<RawConnectionRow[]>`
      SELECT id, template_id, name, base_url, credential_hint, is_enabled,
        kind, auth_mode, destination_kind, host(approved_local_ip) AS approved_local_ip,
        approved_local_port,
        diagnostic_network_status, diagnostic_network_checked_at, diagnostic_network_error_code,
        diagnostic_models_status, diagnostic_models_checked_at, diagnostic_models_error_code,
        diagnostic_chat_status, diagnostic_chat_checked_at, diagnostic_chat_error_code,
        status, last_model_sync_at, created_at, updated_at
      FROM provider_connections
      ORDER BY lower(name), created_at
    `;
    const models = await sql<RawModelRow[]>`
      SELECT id, provider_connection_id, model_id, display_name,
        context_window, max_output_tokens, is_enabled, is_available,
        supports_image_input, supports_web_search, source, image_token_estimate
      FROM provider_models
      ORDER BY model_id
    `;
    const byConnection = new Map<string, ProviderModelRecord[]>();
    for (const row of models) {
      const model = mapModel(row);
      const group = byConnection.get(model.providerConnectionId) ?? [];
      group.push(model);
      byConnection.set(model.providerConnectionId, group);
    }
    return connections.map((row) =>
      mapConnection(row, byConnection.get(row.id) ?? []),
    );
  }

  async findCredential(
    id: string,
  ): Promise<ProviderConnectionCredentialRecord | undefined> {
    const rows = await this.database.getClient()<RawConnectionRow[]>`
      SELECT id, template_id, name, base_url, credential_hint, is_enabled,
        status, last_model_sync_at, created_at, updated_at,
        credential_ciphertext, credential_nonce, credential_auth_tag
      FROM provider_connections
      WHERE id = ${id}
      LIMIT 1
    `;
    const row = rows[0];
    if (
      !row ||
      !row.credential_ciphertext ||
      !row.credential_nonce ||
      !row.credential_auth_tag
    ) {
      return undefined;
    }
    return {
      ...mapConnection(row),
      authTag: row.credential_auth_tag,
      ciphertext: row.credential_ciphertext,
      nonce: row.credential_nonce,
    };
  }

  async findCustom(id: string): Promise<
    | {
        authMode: 'bearer' | 'none';
        credential: EncryptedProviderSecret | null;
        credentialHint: string | null;
        version: string;
        destination: CustomDestination;
        id: string;
        isEnabled: boolean;
      }
    | undefined
  > {
    const rows = await this.database.getClient()<RawConnectionRow[]>`
      SELECT id, base_url, auth_mode, destination_kind, credential_hint,
        xmin::text AS row_version,
        host(approved_local_ip) AS approved_local_ip, approved_local_port,
        credential_ciphertext, credential_nonce, credential_auth_tag, is_enabled
      FROM provider_connections WHERE id = ${id} AND kind = 'custom' LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.auth_mode || !row.destination_kind) return undefined;
    return {
      id: row.id,
      isEnabled: row.is_enabled,
      authMode: row.auth_mode,
      credentialHint: row.credential_hint,
      version: (row as RawConnectionRow & { row_version: string }).row_version,
      destination: {
        baseUrl: row.base_url,
        destinationKind: row.destination_kind,
        approvedLocalIp: row.approved_local_ip ?? null,
        approvedLocalPort: row.approved_local_port ?? null,
      },
      credential:
        row.credential_ciphertext &&
        row.credential_nonce &&
        row.credential_auth_tag
          ? {
              ciphertext: row.credential_ciphertext,
              nonce: row.credential_nonce,
              authTag: row.credential_auth_tag,
            }
          : null,
    };
  }

  async createCustom(
    input: {
      name: string;
      destination: CustomDestination;
      authMode: 'bearer' | 'none';
      credential: EncryptedProviderSecret | null;
      credentialHint: string | null;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.database.getClient().begin(async (tx) => {
      const rows = await tx<RawConnectionRow[]>`
        INSERT INTO provider_connections (template_id, kind, protocol, name, base_url,
          auth_mode, destination_kind, approved_local_ip, approved_local_port,
          credential_ciphertext, credential_nonce, credential_auth_tag, credential_hint,
          status)
        VALUES ('custom-openai', 'custom', 'openai-chat-completions', ${input.name},
          ${input.destination.baseUrl}, ${input.authMode}, ${input.destination.destinationKind},
          ${input.destination.approvedLocalIp}, ${input.destination.approvedLocalPort},
          ${input.credential?.ciphertext ?? null}, ${input.credential?.nonce ?? null},
          ${input.credential?.authTag ?? null}, ${input.credentialHint}, 'ready')
        RETURNING id, template_id, name, base_url, credential_hint, is_enabled,
          kind, auth_mode, destination_kind, status, last_model_sync_at, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new Error('Custom Provider insert returned no row');
      await writeAudit(tx, {
        action: 'provider.custom_created',
        after: {
          name: row.name,
          authMode: input.authMode,
          destinationKind: input.destination.destinationKind,
        },
        audit,
        targetId: row.id,
        targetType: 'provider_connection',
      });
      return mapConnection(row);
    });
  }

  async addManualModel(
    connectionId: string,
    input: {
      modelId: string;
      displayName: string | null;
      contextWindow: number | null;
      maxOutputTokens: number | null;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderModelRecord> {
    return this.database.getClient().begin(async (tx) => {
      const rows = await tx<RawConnectionRow[]>`
        SELECT id FROM provider_connections WHERE id = ${connectionId}
          AND kind = 'custom' AND is_enabled = true FOR UPDATE
      `;
      if (!rows[0]) throw new ProviderNotFoundError();
      const models = await tx<RawModelRow[]>`
        INSERT INTO provider_models (provider_connection_id, model_id, display_name,
          context_window, max_output_tokens, source)
        VALUES (${connectionId}, ${input.modelId}, ${input.displayName},
          ${input.contextWindow}, ${input.maxOutputTokens}, 'manual')
        RETURNING id, provider_connection_id, model_id, display_name, context_window,
          max_output_tokens, is_enabled, is_available, supports_image_input,
          supports_web_search, source, image_token_estimate
      `;
      const model = models[0];
      if (!model) throw new Error('Manual model insert returned no row');
      await writeAudit(tx, {
        action: 'provider.manual_model_added',
        after: {
          modelId: model.model_id,
        },
        audit,
        targetId: model.id,
        targetType: 'provider_model',
      });
      return mapModel(model);
    });
  }

  async updateCustom(
    id: string,
    input: {
      name?: string;
      isEnabled?: boolean;
      destination: CustomDestination;
      authMode: 'bearer' | 'none';
      credential: EncryptedProviderSecret | null;
      credentialHint: string | null;
      connectionChanged: boolean;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.database.getClient().begin(async (tx) => {
      const existing = await tx<RawConnectionRow[]>`
        SELECT id FROM provider_connections WHERE id = ${id} AND kind = 'custom' FOR UPDATE
      `;
      if (!existing[0]) throw new ProviderNotFoundError();
      if (input.connectionChanged) {
        const active = await tx<{ id: string }[]>`
          SELECT j.id FROM chat_jobs j
          JOIN provider_models m ON m.id = j.provider_model_id
          WHERE m.provider_connection_id = ${id}
            AND j.status IN ('pending', 'streaming') LIMIT 1
        `;
        if (active[0]) throw new ProviderInUseError();
      }
      const rows = await tx<RawConnectionRow[]>`
        UPDATE provider_connections SET
          name = COALESCE(${input.name ?? null}, name),
          is_enabled = COALESCE(${input.isEnabled ?? null}, is_enabled),
          base_url = ${input.destination.baseUrl},
          destination_kind = ${input.destination.destinationKind},
          approved_local_ip = ${input.destination.approvedLocalIp},
          approved_local_port = ${input.destination.approvedLocalPort},
          auth_mode = ${input.authMode},
          credential_ciphertext = ${input.credential?.ciphertext ?? null},
          credential_nonce = ${input.credential?.nonce ?? null},
          credential_auth_tag = ${input.credential?.authTag ?? null},
          credential_hint = ${input.credentialHint},
          diagnostic_network_status = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_network_status END,
          diagnostic_network_checked_at = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_network_checked_at END,
          diagnostic_network_error_code = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_network_error_code END,
          diagnostic_models_status = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_models_status END,
          diagnostic_models_checked_at = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_models_checked_at END,
          diagnostic_models_error_code = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_models_error_code END,
          diagnostic_chat_status = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_chat_status END,
          diagnostic_chat_checked_at = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_chat_checked_at END,
          diagnostic_chat_error_code = CASE WHEN ${input.connectionChanged}
            THEN NULL ELSE diagnostic_chat_error_code END
        WHERE id = ${id}
        RETURNING id, template_id, name, base_url, credential_hint, is_enabled,
          kind, auth_mode, destination_kind, status, last_model_sync_at, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new ProviderNotFoundError();
      await writeAudit(tx, {
        action: 'provider.custom_updated',
        after: {
          name: row.name,
          isEnabled: row.is_enabled,
          authMode: input.authMode,
          destinationKind: input.destination.destinationKind,
          connectionChanged: input.connectionChanged,
        },
        audit,
        targetId: id,
        targetType: 'provider_connection',
      });
      return mapConnection(row, await this.listModelsForConnection(tx, id));
    });
  }

  async findCustomModel(
    connectionId: string,
    providerModelId: string,
  ): Promise<{ modelId: string } | undefined> {
    const rows = await this.database.getClient()<{ model_id: string }[]>`
      SELECT m.model_id FROM provider_models m
      JOIN provider_connections c ON c.id = m.provider_connection_id
      WHERE c.id = ${connectionId} AND c.kind = 'custom'
        AND c.is_enabled = true AND m.id = ${providerModelId}
        AND m.is_available = true LIMIT 1
    `;
    return rows[0] ? { modelId: rows[0].model_id } : undefined;
  }

  async recordDiagnostic(
    id: string,
    expectedVersion: string,
    stage: 'network' | 'models' | 'chat',
    status: string,
    errorCode: string | null,
    audit: ProviderAuditContext,
  ): Promise<{
    stage: string;
    status: string;
    errorCode: string | null;
    checkedAt: Date;
  }> {
    return this.database.getClient().begin(async (tx) => {
      let rows: Array<{ id: string }>;
      if (stage === 'network')
        rows = await tx<{ id: string }[]>`
        UPDATE provider_connections SET diagnostic_network_status = ${status},
          diagnostic_network_checked_at = now(), diagnostic_network_error_code = ${errorCode}
        WHERE id = ${id} AND kind = 'custom' AND xmin::text = ${expectedVersion} RETURNING id
      `;
      else if (stage === 'models')
        rows = await tx<{ id: string }[]>`
        UPDATE provider_connections SET diagnostic_models_status = ${status},
          diagnostic_models_checked_at = now(), diagnostic_models_error_code = ${errorCode}
        WHERE id = ${id} AND kind = 'custom' AND xmin::text = ${expectedVersion} RETURNING id
      `;
      else
        rows = await tx<{ id: string }[]>`
        UPDATE provider_connections SET diagnostic_chat_status = ${status},
          diagnostic_chat_checked_at = now(), diagnostic_chat_error_code = ${errorCode}
        WHERE id = ${id} AND kind = 'custom' AND xmin::text = ${expectedVersion} RETURNING id
      `;
      if (!rows[0]) throw new ProviderDiagnosticStaleError();
      await writeAudit(tx, {
        action: 'provider.diagnostic_run',
        after: {
          stage,
          status,
          errorCode,
        },
        audit,
        targetId: id,
        targetType: 'provider_connection',
      });
      return { stage, status, errorCode, checkedAt: new Date() };
    });
  }

  async create(
    input: {
      baseUrl: string;
      credential: EncryptedProviderSecret;
      credentialHint: string | null;
      models: DiscoveredProviderModel[];
      name: string;
      templateId: string;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawConnectionRow[]>`
        INSERT INTO provider_connections (
          template_id, name, base_url, credential_ciphertext,
          credential_nonce, credential_auth_tag, credential_hint,
          last_model_sync_at
        ) VALUES (
          ${input.templateId}, ${input.name}, ${input.baseUrl},
          ${input.credential.ciphertext}, ${input.credential.nonce},
          ${input.credential.authTag}, ${input.credentialHint}, now()
        )
        RETURNING id, template_id, name, base_url, credential_hint,
          is_enabled, kind, auth_mode, destination_kind,
          status, last_model_sync_at, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new Error('Provider connection insert returned no row');
      const models = await this.upsertModels(transaction, row.id, input.models);
      await writeAudit(transaction, {
        action: 'provider.created',
        after: {
          modelCount: models.length,
          name: row.name,
          templateId: row.template_id,
        },
        audit,
        targetId: row.id,
        targetType: 'provider_connection',
      });
      return mapConnection(row, models);
    });
  }

  async syncModels(
    id: string,
    models: DiscoveredProviderModel[],
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const connectionRows = await transaction<RawConnectionRow[]>`
        SELECT id, template_id, name, base_url, credential_hint, is_enabled,
          status, last_model_sync_at, created_at, updated_at
        FROM provider_connections
        WHERE id = ${id}
        FOR UPDATE
      `;
      if (!connectionRows[0]) throw new ProviderNotFoundError();
      await transaction`
        UPDATE provider_models
        SET is_available = false
        WHERE provider_connection_id = ${id} AND source = 'discovered'
      `;
      await this.upsertModels(transaction, id, models);
      const rows = await transaction<RawConnectionRow[]>`
        UPDATE provider_connections
        SET status = 'ready', last_model_sync_at = now()
        WHERE id = ${id}
        RETURNING id, template_id, name, base_url, credential_hint,
          is_enabled, kind, auth_mode, destination_kind,
          status, last_model_sync_at, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new ProviderNotFoundError();
      await writeAudit(transaction, {
        action: 'provider.models_synced',
        after: { modelCount: models.length },
        audit,
        targetId: id,
        targetType: 'provider_connection',
      });
      return mapConnection(
        row,
        await this.listModelsForConnection(transaction, id),
      );
    });
  }

  async update(
    id: string,
    patch: { isEnabled?: boolean; name?: string },
    audit: ProviderAuditContext,
  ): Promise<ProviderConnectionRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawConnectionRow[]>`
        UPDATE provider_connections
        SET name = COALESCE(${patch.name ?? null}, name),
          is_enabled = COALESCE(${patch.isEnabled ?? null}, is_enabled)
        WHERE id = ${id}
        RETURNING id, template_id, name, base_url, credential_hint,
          is_enabled, kind, auth_mode, destination_kind,
          status, last_model_sync_at, created_at, updated_at
      `;
      const row = rows[0];
      if (!row) throw new ProviderNotFoundError();
      await writeAudit(transaction, {
        action: row.is_enabled ? 'provider.updated' : 'provider.disabled',
        after: { isEnabled: row.is_enabled, name: row.name },
        audit,
        targetId: id,
        targetType: 'provider_connection',
      });
      return mapConnection(
        row,
        await this.listModelsForConnection(transaction, id),
      );
    });
  }

  async updateModel(
    id: string,
    patch: {
      isEnabled?: boolean;
      supportsImageInput?: boolean;
      supportsWebSearch?: boolean;
      imageTokenEstimate?: number | null;
    },
    audit: ProviderAuditContext,
  ): Promise<ProviderModelRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawModelRow[]>`
        UPDATE provider_models
        SET is_enabled = COALESCE(${patch.isEnabled ?? null}, is_enabled),
          supports_image_input = COALESCE(
            ${patch.supportsImageInput ?? null},
            supports_image_input
          ),
          supports_web_search = COALESCE(
            ${patch.supportsWebSearch ?? null},
            supports_web_search
          ),
          image_token_estimate = CASE WHEN ${patch.imageTokenEstimate !== undefined}
            THEN ${patch.imageTokenEstimate ?? null}
            ELSE image_token_estimate END
        WHERE id = ${id} AND is_available = true
        RETURNING id, provider_connection_id, model_id, display_name,
          context_window, max_output_tokens, is_enabled, is_available,
          supports_image_input, supports_web_search, source, image_token_estimate
      `;
      const row = rows[0];
      if (!row) throw new ProviderNotFoundError();
      const model = mapModel(row);
      await writeAudit(transaction, {
        action:
          patch.isEnabled === undefined
            ? 'provider.model_capabilities_updated'
            : patch.isEnabled
              ? 'provider.model_enabled'
              : 'provider.model_disabled',
        after: {
          isEnabled: model.isEnabled,
          modelId: model.modelId,
          supportsImageInput: model.supportsImageInput,
          supportsWebSearch: model.supportsWebSearch,
        },
        audit,
        targetId: id,
        targetType: 'provider_model',
      });
      return model;
    });
  }

  private async upsertModels(
    transaction: DatabaseTransaction,
    connectionId: string,
    models: DiscoveredProviderModel[],
  ): Promise<ProviderModelRecord[]> {
    const output: ProviderModelRecord[] = [];
    for (const model of models) {
      const rows = await transaction<RawModelRow[]>`
        INSERT INTO provider_models (
          provider_connection_id, model_id, display_name, context_window,
          max_output_tokens, metadata, is_available, last_seen_at, source
        ) VALUES (
          ${connectionId}, ${model.id}, ${model.displayName},
          ${model.contextWindow}, ${model.maxOutputTokens},
          ${transaction.json(model.metadata)}, true, now(), 'discovered'
        )
        ON CONFLICT (provider_connection_id, model_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          context_window = EXCLUDED.context_window,
          max_output_tokens = EXCLUDED.max_output_tokens,
          metadata = EXCLUDED.metadata,
          is_available = true,
          last_seen_at = now()
        WHERE provider_models.source = 'discovered'
        RETURNING id, provider_connection_id, model_id, display_name,
          context_window, max_output_tokens, is_enabled, is_available,
          supports_image_input, supports_web_search, source, image_token_estimate
      `;
      if (rows[0]) output.push(mapModel(rows[0]));
    }
    return output.sort((left, right) =>
      left.modelId.localeCompare(right.modelId),
    );
  }

  private async listModelsForConnection(
    transaction: DatabaseTransaction,
    connectionId: string,
  ): Promise<ProviderModelRecord[]> {
    const rows = await transaction<RawModelRow[]>`
      SELECT id, provider_connection_id, model_id, display_name,
        context_window, max_output_tokens, is_enabled, is_available,
        supports_image_input, supports_web_search, source, image_token_estimate
      FROM provider_models
      WHERE provider_connection_id = ${connectionId}
      ORDER BY model_id
    `;
    return rows.map(mapModel);
  }
}
