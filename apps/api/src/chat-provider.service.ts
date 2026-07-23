import { Injectable } from '@nestjs/common';

import {
  providerBaseUrlMatchesTemplate,
  providerTemplateById,
  type ProviderTemplate,
} from './provider-catalog.js';
import { ProviderCredentialService } from './provider-credentials.js';
import { DatabaseService } from './database.service.js';

export interface ChatProviderRuntime {
  apiKey: string;
  baseUrl: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  modelId: string;
  providerModelId: string;
  template: ProviderTemplate;
}

interface RawRuntimeRow {
  base_url: string;
  credential_auth_tag: Buffer;
  credential_ciphertext: Buffer;
  credential_nonce: Buffer;
  context_window: number | null;
  max_output_tokens: number | null;
  model_id: string;
  provider_model_id: string;
  template_id: string;
}

export class ChatProviderUnavailableError extends Error {}

@Injectable()
export class ChatProviderService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: ProviderCredentialService,
  ) {}

  async resolve(providerModelId: string): Promise<ChatProviderRuntime> {
    const rows = await this.database.getClient()<RawRuntimeRow[]>`
      SELECT m.id AS provider_model_id, m.model_id, m.context_window,
        m.max_output_tokens, c.template_id, c.base_url,
        c.credential_ciphertext, c.credential_nonce, c.credential_auth_tag
      FROM provider_models m
      JOIN provider_connections c ON c.id = m.provider_connection_id
      WHERE m.id = ${providerModelId}
        AND m.is_enabled = true
        AND m.is_available = true
        AND c.is_enabled = true
        AND c.status = 'ready'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new ChatProviderUnavailableError();
    const template = providerTemplateById(row.template_id);
    if (
      !template?.canRegister ||
      !template.baseUrl ||
      !providerBaseUrlMatchesTemplate(template, row.base_url)
    ) {
      throw new ChatProviderUnavailableError();
    }
    return {
      apiKey: await this.credentials.decrypt({
        authTag: row.credential_auth_tag,
        ciphertext: row.credential_ciphertext,
        nonce: row.credential_nonce,
      }),
      baseUrl: row.base_url,
      contextWindow: row.context_window,
      maxOutputTokens: row.max_output_tokens,
      modelId: row.model_id,
      providerModelId: row.provider_model_id,
      template,
    };
  }
}
