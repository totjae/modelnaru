import { describe, expect, it } from 'vitest';

import {
  providerCatalog,
  providerBaseUrlMatchesTemplate,
  providerTemplateById,
  resolveProviderBaseUrl,
  validateProviderCatalog,
} from '../src/provider-catalog.js';

describe('provider catalog', () => {
  it('contains the reference catalog without validation issues', () => {
    expect(validateProviderCatalog()).toEqual([]);
    expect(providerCatalog.length).toBeGreaterThanOrEqual(35);
    expect(providerCatalog.map((template) => template.id)).toEqual(
      expect.arrayContaining([
        'llm-gateway',
        'openai',
        'anthropic',
        'google',
        'vertex',
        'bedrock',
        'copilot',
        'openrouter',
        'deepseek',
        'together',
      ]),
    );
  });

  it('resolves fixed configuration placeholders without accepting arbitrary URLs', () => {
    const cloudflare = providerTemplateById('cloudflare-ai-gateway')!;
    const resolved = resolveProviderBaseUrl(cloudflare, {
      accountId: 'account_123',
    });
    expect(resolved).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account_123/ai',
    );
    expect(providerBaseUrlMatchesTemplate(cloudflare, resolved!)).toBe(true);
    expect(
      providerBaseUrlMatchesTemplate(
        cloudflare,
        'https://attacker.example/accounts/account_123/ai',
      ),
    ).toBe(false);
  });

  it('only enables templates with complete fixed discovery contracts', () => {
    for (const template of providerCatalog.filter(
      (candidate) => candidate.canRegister,
    )) {
      expect(template.baseUrl).toMatch(/^https:\/\//u);
      expect(template.authType).toBeTruthy();
      expect(
        Boolean(template.modelListPath || template.staticModels?.length),
      ).toBe(true);
      expect(template.modelResponseType).toBeTruthy();
    }
    expect(providerTemplateById('llm-gateway')?.canRegister).toBe(true);
    expect(providerTemplateById('openrouter')?.canRegister).toBe(true);
    expect(providerTemplateById('deepseek')?.canRegister).toBe(true);
    expect(providerTemplateById('bedrock')?.canRegister).toBe(false);
  });

  it('pins the primary vendors first and sorts the remaining catalog by name', () => {
    expect(providerCatalog.slice(0, 4).map((template) => template.id)).toEqual([
      'openai',
      'anthropic',
      'google',
      'vertex',
    ]);
    const remainder = providerCatalog.slice(4).map((template) => template.name);
    expect(remainder).toEqual(
      [...remainder].sort((left, right) =>
        left.localeCompare(right, 'en', { sensitivity: 'base' }),
      ),
    );
    expect(
      providerCatalog.findIndex((template) => template.id === 'llm-gateway'),
    ).toBeGreaterThan(3);
  });
});
