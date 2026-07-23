import { Injectable } from '@nestjs/common';

import type { ProviderTemplate } from './provider-catalog.js';

export type ProviderConnectionErrorCode =
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'PROVIDER_UPSTREAM_ERROR';

export class ProviderConnectionError extends Error {
  constructor(readonly code: ProviderConnectionErrorCode) {
    super('Provider connection test failed.');
  }
}

export interface DiscoveredProviderModel {
  contextWindow: number | null;
  displayName: string | null;
  id: string;
  maxOutputTokens: number | null;
  metadata: Record<string, string | string[]>;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

type FetchImplementation = (
  input: string,
  init: RequestInit,
) => Promise<FetchResponse>;

async function fetchProviderText(
  url: string,
  headers: Record<string, string>,
  fetchImplementation: FetchImplementation,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImplementation(url, {
      headers,
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ProviderConnectionError('PROVIDER_AUTH_FAILED');
      }
      if (response.status === 429) {
        throw new ProviderConnectionError('PROVIDER_RATE_LIMITED');
      }
      throw new ProviderConnectionError('PROVIDER_UPSTREAM_ERROR');
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > 5_242_880) {
      throw new ProviderConnectionError('PROVIDER_RESPONSE_INVALID');
    }
    return raw;
  } catch (error) {
    if (error instanceof ProviderConnectionError) throw error;
    throw new ProviderConnectionError('PROVIDER_NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function providerDiscoveryHeaders(
  template: ProviderTemplate,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (
    template.authType === 'bearer' ||
    (template.authType === 'bearer-optional' && apiKey)
  ) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (template.authType === 'x-api-key') {
    headers['anthropic-version'] = '2023-06-01';
    headers['x-api-key'] = apiKey;
  } else if (template.authType === 'google-api-key') {
    headers['x-goog-api-key'] = apiKey;
  }
  return headers;
}

export function normalizeProviderModels(
  template: ProviderTemplate,
  document: unknown,
): DiscoveredProviderModel[] {
  const root = asRecord(document);
  const source =
    template.modelResponseType === 'google'
      ? root?.models
      : Array.isArray(document)
        ? document
        : (root?.data ?? root?.models ?? root?.result);
  if (!Array.isArray(source)) {
    throw new ProviderConnectionError('PROVIDER_RESPONSE_INVALID');
  }

  const models = new Map<string, DiscoveredProviderModel>();
  for (const item of source) {
    const record = asRecord(item);
    if (!record) continue;
    const rawId = stringValue(
      template.modelResponseType === 'google'
        ? record.name
        : (record.id ?? record.model_id ?? record.modelId ?? record.model_name),
    );
    const id = rawId?.replace(/^models\//u, '');
    if (
      !id ||
      id.length > 255 ||
      [...id].some((character) => character.charCodeAt(0) < 32)
    )
      continue;
    const supportedMethods = Array.isArray(record.supportedGenerationMethods)
      ? record.supportedGenerationMethods.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const ownedBy = stringValue(record.owned_by);
    models.set(id, {
      contextWindow: positiveInteger(
        record.inputTokenLimit ??
          record.context_window ??
          record.context_length,
      ),
      displayName: stringValue(record.displayName ?? record.name),
      id,
      maxOutputTokens: positiveInteger(
        record.outputTokenLimit ?? record.max_output_tokens,
      ),
      metadata: {
        ...(ownedBy ? { ownedBy } : {}),
        ...(supportedMethods.length > 0
          ? { supportedGenerationMethods: supportedMethods }
          : {}),
      },
    });
  }
  if (models.size === 0) {
    throw new ProviderConnectionError('PROVIDER_RESPONSE_INVALID');
  }
  return [...models.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function staticProviderModels(
  template: ProviderTemplate,
): DiscoveredProviderModel[] {
  return (template.staticModels ?? []).map((id) => ({
    contextWindow: null,
    displayName: null,
    id,
    maxOutputTokens: null,
    metadata: {},
  }));
}

export async function discoverProviderModels(
  template: ProviderTemplate,
  apiKey: string,
  fetchImplementation: FetchImplementation = fetch,
  baseUrlOverride?: string,
): Promise<DiscoveredProviderModel[]> {
  if (!template.baseUrl) {
    throw new ProviderConnectionError('PROVIDER_RESPONSE_INVALID');
  }
  const staticModels = staticProviderModels(template);
  if (!template.modelListPath) {
    if (staticModels.length === 0) {
      throw new ProviderConnectionError('PROVIDER_RESPONSE_INVALID');
    }
    return staticModels;
  }
  const baseUrl = (baseUrlOverride ?? template.baseUrl).replace(/\/$/u, '');
  const headers = providerDiscoveryHeaders(template, apiKey);
  if (template.credentialValidationPath) {
    await fetchProviderText(
      `${baseUrl}/${template.credentialValidationPath.replace(/^\//u, '')}`,
      headers,
      fetchImplementation,
    );
  }
  const raw = await fetchProviderText(
    `${baseUrl}/${template.modelListPath.replace(/^\//u, '')}`,
    headers,
    fetchImplementation,
  );
  let document: unknown;
  try {
    document = JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderConnectionError('PROVIDER_RESPONSE_INVALID');
  }
  const discovered = normalizeProviderModels(template, document);
  const models = new Map(
    [...discovered, ...staticModels].map((model) => [model.id, model]),
  );
  return [...models.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

@Injectable()
export class ProviderDiscoveryService {
  discover(
    template: ProviderTemplate,
    apiKey: string,
    baseUrl?: string,
  ): Promise<DiscoveredProviderModel[]> {
    return discoverProviderModels(template, apiKey, fetch, baseUrl);
  }
}
