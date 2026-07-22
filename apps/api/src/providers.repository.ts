import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';

import { DatabaseService } from './database.service.js';
import type { EncryptedProviderSecret } from './provider-credentials.js';
import type { DiscoveredProviderModel } from './provider-discovery.js';

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
}

export class ProviderNotFoundError extends Error {}

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
        status, last_model_sync_at, created_at, updated_at
      FROM provider_connections
      ORDER BY lower(name), created_at
    `;
    const models = await sql<RawModelRow[]>`
      SELECT id, provider_connection_id, model_id, display_name,
        context_window, max_output_tokens, is_enabled, is_available
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
          is_enabled, status, last_model_sync_at, created_at, updated_at
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
        WHERE provider_connection_id = ${id}
      `;
      await this.upsertModels(transaction, id, models);
      const rows = await transaction<RawConnectionRow[]>`
        UPDATE provider_connections
        SET status = 'ready', last_model_sync_at = now()
        WHERE id = ${id}
        RETURNING id, template_id, name, base_url, credential_hint,
          is_enabled, status, last_model_sync_at, created_at, updated_at
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
          is_enabled, status, last_model_sync_at, created_at, updated_at
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

  async setModelEnabled(
    id: string,
    isEnabled: boolean,
    audit: ProviderAuditContext,
  ): Promise<ProviderModelRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawModelRow[]>`
        UPDATE provider_models
        SET is_enabled = ${isEnabled}
        WHERE id = ${id} AND is_available = true
        RETURNING id, provider_connection_id, model_id, display_name,
          context_window, max_output_tokens, is_enabled, is_available
      `;
      const row = rows[0];
      if (!row) throw new ProviderNotFoundError();
      const model = mapModel(row);
      await writeAudit(transaction, {
        action: isEnabled
          ? 'provider.model_enabled'
          : 'provider.model_disabled',
        after: { isEnabled, modelId: model.modelId },
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
          max_output_tokens, metadata, is_available, last_seen_at
        ) VALUES (
          ${connectionId}, ${model.id}, ${model.displayName},
          ${model.contextWindow}, ${model.maxOutputTokens},
          ${transaction.json(model.metadata)}, true, now()
        )
        ON CONFLICT (provider_connection_id, model_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          context_window = EXCLUDED.context_window,
          max_output_tokens = EXCLUDED.max_output_tokens,
          metadata = EXCLUDED.metadata,
          is_available = true,
          last_seen_at = now()
        RETURNING id, provider_connection_id, model_id, display_name,
          context_window, max_output_tokens, is_enabled, is_available
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
        context_window, max_output_tokens, is_enabled, is_available
      FROM provider_models
      WHERE provider_connection_id = ${connectionId}
      ORDER BY model_id
    `;
    return rows.map(mapModel);
  }
}
