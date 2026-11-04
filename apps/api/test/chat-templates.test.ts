import 'reflect-metadata';
import {
  AdminChatTemplatesController,
  ChatTemplatesController,
} from '../src/chat-templates.controller.js';
import {
  AdminMutationGuard,
  AdminSessionGuard,
  AuthenticatedMutationGuard,
  AuthenticatedSessionGuard,
} from '../src/auth.guard.js';
import { describe, expect, it } from 'vitest';
import {
  parseTemplate,
  templateParameterFields,
} from '../src/chat-templates.controller.js';
import { mergeTemplateSettings } from '../src/chat-templates.js';
const base = {
  name: '기본',
  description: '',
  isEnabled: true,
  providerModelId: null,
  settings: {
    systemPrompt: '도움말',
    generationParameters: { temperature: 0, maxOutputTokens: 16384 },
    webSearchEnabled: false,
  },
};
describe('R3 template validation and merge', () => {
  it('preserves explicit zero/false and output above default', () => {
    expect(parseTemplate(base).settings).toEqual(base.settings);
  });
  it('rejects unknown fields, reset conflicts, invalid ranges and malformed lists', () => {
    for (const settings of [
      { title: 'not allowed' },
      { generationParameters: { maxOutputTokens: 0 } },
      { resetParameters: ['unknown'] },
      {
        generationParameters: { temperature: 1 },
        resetParameters: ['temperature'],
      },
      { responseTimeoutSeconds: 1801 },
      { generationParameters: { stopSequences: [false] } },
    ])
      expect(() => parseTemplate({ ...base, settings })).toThrow();
  });
  it('merges only specified values and resets selected overrides without mutating inputs', () => {
    const current = {
      systemPrompt: 'old',
      historyMessageLimit: 42,
      webSearchEnabled: true,
      generationParameters: {
        temperature: 0.9,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    };
    const result = mergeTemplateSettings(current, {
      systemPrompt: 'new',
      webSearchEnabled: false,
      generationParameters: { temperature: 0 },
      resetParameters: ['topP'],
    });
    expect(result).toEqual({
      systemPrompt: 'new',
      historyMessageLimit: 42,
      webSearchEnabled: false,
      generationParameters: { temperature: 0, maxOutputTokens: 1024 },
    });
    expect(current.generationParameters.topP).toBe(0.8);
  });
});

it('offers the union of native template settings without narrowing to a boolean transport', () => {
  expect(
    templateParameterFields().find((f) => f.key === 'thinkingBudget')?.maximum,
  ).toBe(131072);
  expect(() =>
    parseTemplate({
      ...base,
      settings: { generationParameters: { thinkingLevel: 'invalid' } },
    }),
  ).toThrow();
});

it('protects admin CRUD and principal apply with the existing session and CSRF guards', () => {
  expect(
    Reflect.getMetadata(
      '__guards__',
      AdminChatTemplatesController.prototype['list'],
    ),
  ).toContain(AdminSessionGuard);
  for (const action of ['create', 'update', 'delete'] as const)
    expect(
      Reflect.getMetadata(
        '__guards__',
        AdminChatTemplatesController.prototype[action],
      ),
    ).toContain(AdminMutationGuard);
  expect(
    Reflect.getMetadata(
      '__guards__',
      ChatTemplatesController.prototype['list'],
    ),
  ).toContain(AuthenticatedSessionGuard);
  for (const action of ['preview', 'apply'] as const)
    expect(
      Reflect.getMetadata(
        '__guards__',
        ChatTemplatesController.prototype[action],
      ),
    ).toContain(AuthenticatedMutationGuard);
});
