import { Injectable } from '@nestjs/common';

import {
  providerBaseUrlMatchesTemplate,
  providerTemplateById,
  type ProviderTemplate,
} from './provider-catalog.js';
import { ProviderCredentialService } from './provider-credentials.js';
import {
  resolveCustomDestination,
  secureProviderFetch,
  type CustomDestination,
} from './provider-destination.js';
import { DatabaseService } from './database.service.js';

export interface ChatProviderRuntime {
  apiKey: string;
  baseUrl: string;
  destination?: CustomDestination | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  imageTokenEstimate?: number | null;
  modelId: string;
  providerModelId: string;
  supportsImageInput: boolean;
  supportsWebSearch: boolean;
  template: ProviderTemplate;
}

interface RawRuntimeRow {
  base_url: string;
  kind: 'builtin' | 'custom';
  auth_mode: 'bearer' | 'none';
  destination_kind: 'public' | 'local';
  approved_local_ip: string | null;
  approved_local_port: number | null;
  credential_auth_tag: Buffer | null;
  credential_ciphertext: Buffer | null;
  credential_nonce: Buffer | null;
  context_window: number | null;
  max_output_tokens: number | null;
  image_token_estimate: number | null;
  model_id: string;
  provider_model_id: string;
  supports_image_input: boolean;
  supports_web_search: boolean;
  template_id: string;
}

export class ChatProviderUnavailableError extends Error {}

export function runtimeProviderFetch(
  runtime: ChatProviderRuntime,
): typeof fetch {
  return runtime.destination
    ? (url, init) =>
        secureProviderFetch(
          url instanceof Request
            ? url.url
            : url instanceof URL
              ? url.href
              : url,
          init ?? {},
          runtime.destination!,
        )
    : fetch;
}

@Injectable()
export class ChatProviderService {
  constructor(
    private readonly database: DatabaseService,
    private readonly credentials: ProviderCredentialService,
  ) {}

  async resolve(providerModelId: string): Promise<ChatProviderRuntime> {
    const rows = await this.database.getClient()<RawRuntimeRow[]>`
      SELECT m.id AS provider_model_id, m.model_id, m.context_window,
        m.max_output_tokens, m.image_token_estimate,
        m.supports_image_input, m.supports_web_search,
        c.template_id, c.base_url, c.kind, c.auth_mode, c.destination_kind,
        host(c.approved_local_ip) AS approved_local_ip, c.approved_local_port,
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
      !template ||
      (row.kind === 'builtin' &&
        (!template.canRegister ||
          !template.baseUrl ||
          !providerBaseUrlMatchesTemplate(template, row.base_url)))
    ) {
      throw new ChatProviderUnavailableError();
    }
    const destination: CustomDestination | null =
      row.kind === 'custom'
        ? {
            baseUrl: row.base_url,
            destinationKind: row.destination_kind,
            approvedLocalIp: row.approved_local_ip,
            approvedLocalPort: row.approved_local_port,
          }
        : null;
    if (destination) await resolveCustomDestination(destination);
    return {
      apiKey:
        row.auth_mode === 'none'
          ? ''
          : await this.credentials.decrypt({
              authTag: row.credential_auth_tag!,
              ciphertext: row.credential_ciphertext!,
              nonce: row.credential_nonce!,
            }),
      baseUrl: row.base_url,
      destination,
      contextWindow:
        row.kind === 'custom'
          ? (row.context_window ?? 16_384)
          : row.context_window,
      imageTokenEstimate: row.image_token_estimate,
      maxOutputTokens: row.max_output_tokens,
      modelId: row.model_id,
      providerModelId: row.provider_model_id,
      supportsImageInput: row.supports_image_input,
      supportsWebSearch: row.supports_web_search,
      template,
    };
  }
}
