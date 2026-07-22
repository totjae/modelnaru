import { describe, expect, it } from 'vitest';

import {
  providerCatalog,
  providerTemplateById,
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
        'together-ai',
      ]),
    );
  });

  it('only enables templates with complete fixed discovery contracts', () => {
    for (const template of providerCatalog.filter(
      (candidate) => candidate.canRegister,
    )) {
      expect(template.baseUrl).toMatch(/^https:\/\//u);
      expect(template.authType).toBeTruthy();
      expect(template.modelListPath).toBeTruthy();
      expect(template.modelResponseType).toBeTruthy();
    }
    expect(providerTemplateById('llm-gateway')?.canRegister).toBe(true);
    expect(providerTemplateById('bedrock')?.canRegister).toBe(false);
  });
});
