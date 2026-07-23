import type { ProviderTemplate } from './provider-catalog.js';

export type ProviderParameterKey =
  | 'frequencyPenalty'
  | 'maxOutputTokens'
  | 'outputEffort'
  | 'presencePenalty'
  | 'reasoningEffort'
  | 'seed'
  | 'stopSequences'
  | 'temperature'
  | 'thinkingBudget'
  | 'thinkingDisplay'
  | 'thinkingLevel'
  | 'topK'
  | 'topP'
  | 'verbosity';

export interface ProviderParameterField {
  key: ProviderParameterKey;
  maximum?: number;
  minimum?: number;
  options?: string[];
  step?: number;
  type: 'integer' | 'number' | 'select' | 'string-list';
}

export interface ProviderParameterPolicy {
  fields: ProviderParameterField[];
  profile: 'anthropic' | 'gemini' | 'novelai' | 'openai' | 'openai-reasoning';
}

export interface ProviderGenerationParameters {
  frequencyPenalty?: number;
  maxOutputTokens?: number;
  outputEffort?: string;
  presencePenalty?: number;
  reasoningEffort?: string;
  seed?: number;
  stopSequences?: string[];
  temperature?: number;
  thinkingBudget?: number;
  thinkingDisplay?: string;
  thinkingLevel?: string;
  topK?: number;
  topP?: number;
  verbosity?: string;
}

const maxOutput: ProviderParameterField = {
  key: 'maxOutputTokens',
  maximum: 131_072,
  minimum: 1,
  step: 1,
  type: 'integer',
};
const temperature = (maximum: number): ProviderParameterField => ({
  key: 'temperature',
  maximum,
  minimum: 0,
  step: 0.01,
  type: 'number',
});
const topP: ProviderParameterField = {
  key: 'topP',
  maximum: 1,
  minimum: 0,
  step: 0.01,
  type: 'number',
};
const topK: ProviderParameterField = {
  key: 'topK',
  maximum: 1_000,
  minimum: 0,
  step: 1,
  type: 'integer',
};
const frequencyPenalty: ProviderParameterField = {
  key: 'frequencyPenalty',
  maximum: 2,
  minimum: -2,
  step: 0.01,
  type: 'number',
};
const presencePenalty: ProviderParameterField = {
  key: 'presencePenalty',
  maximum: 2,
  minimum: -2,
  step: 0.01,
  type: 'number',
};
const seed: ProviderParameterField = {
  key: 'seed',
  maximum: 2_147_483_647,
  minimum: 0,
  step: 1,
  type: 'integer',
};
const stopSequences: ProviderParameterField = {
  key: 'stopSequences',
  type: 'string-list',
};

const policies: Record<
  ProviderParameterPolicy['profile'],
  ProviderParameterPolicy
> = {
  anthropic: {
    fields: [
      maxOutput,
      temperature(1),
      topP,
      topK,
      stopSequences,
      {
        key: 'thinkingBudget',
        maximum: 131_072,
        minimum: 0,
        step: 1,
        type: 'integer',
      },
      {
        key: 'thinkingDisplay',
        options: ['summarized', 'omitted'],
        type: 'select',
      },
      {
        key: 'outputEffort',
        options: ['low', 'medium', 'high', 'max'],
        type: 'select',
      },
    ],
    profile: 'anthropic',
  },
  gemini: {
    fields: [
      maxOutput,
      temperature(2),
      topP,
      topK,
      frequencyPenalty,
      presencePenalty,
      seed,
      stopSequences,
      {
        key: 'thinkingBudget',
        maximum: 131_072,
        minimum: 0,
        step: 1,
        type: 'integer',
      },
      {
        key: 'thinkingLevel',
        options: ['minimal', 'low', 'medium', 'high'],
        type: 'select',
      },
    ],
    profile: 'gemini',
  },
  novelai: {
    fields: [
      maxOutput,
      temperature(2),
      topP,
      topK,
      frequencyPenalty,
      presencePenalty,
      stopSequences,
      {
        key: 'thinkingBudget',
        maximum: 131_072,
        minimum: 0,
        step: 1,
        type: 'integer',
      },
    ],
    profile: 'novelai',
  },
  openai: {
    fields: [
      maxOutput,
      temperature(2),
      topP,
      frequencyPenalty,
      presencePenalty,
      seed,
      stopSequences,
    ],
    profile: 'openai',
  },
  'openai-reasoning': {
    fields: [
      maxOutput,
      {
        key: 'reasoningEffort',
        options: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
        type: 'select',
      },
      {
        key: 'verbosity',
        options: ['low', 'medium', 'high'],
        type: 'select',
      },
      seed,
      stopSequences,
    ],
    profile: 'openai-reasoning',
  },
};

function profileFor(
  template: ProviderTemplate,
  modelId: string,
): ProviderParameterPolicy['profile'] {
  const configured = template.parameterProfile;
  if (
    configured === 'anthropic' ||
    configured === 'gemini' ||
    configured === 'novelai'
  ) {
    return configured;
  }
  const normalized = modelId.toLowerCase();
  if (configured === 'routed') {
    if (/(?:claude|opus|sonnet|haiku|fable|mythos)/u.test(normalized)) {
      return 'anthropic';
    }
    if (normalized.includes('gemini')) return 'gemini';
  }
  if (/^(?:gpt-5|o[134](?:-|$))/u.test(normalized)) {
    return 'openai-reasoning';
  }
  return 'openai';
}

export function providerParameterPolicy(
  template: ProviderTemplate,
  modelId: string,
): ProviderParameterPolicy {
  const policy = policies[profileFor(template, modelId)];
  if (
    policy.profile === 'anthropic' &&
    usesAdaptiveAnthropicThinking(modelId)
  ) {
    return {
      ...policy,
      fields: policy.fields.filter(
        (field) => !['temperature', 'topK', 'topP'].includes(field.key),
      ),
    };
  }
  return policy;
}

export class ProviderParameterValidationError extends Error {}

function usesAdaptiveAnthropicThinking(modelId: string): boolean {
  return /(?:fable|mythos)-5|opus-(?:4[.-][7-9]|5)|sonnet-5/u.test(
    modelId.toLowerCase(),
  );
}

export function normalizeProviderParameters(
  template: ProviderTemplate,
  modelId: string,
  input: ProviderGenerationParameters,
): ProviderGenerationParameters {
  const policy = providerParameterPolicy(template, modelId);
  const fields = new Map(policy.fields.map((field) => [field.key, field]));
  const output: ProviderGenerationParameters = {};
  for (const [rawKey, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const key = rawKey as ProviderParameterKey;
    const field = fields.get(key);
    if (!field)
      throw new ProviderParameterValidationError(
        `Unsupported parameter: ${key}`,
      );
    if (field.type === 'number' || field.type === 'integer') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (field.type === 'integer' && !Number.isInteger(value)) ||
        (field.minimum !== undefined && value < field.minimum) ||
        (field.maximum !== undefined && value > field.maximum)
      ) {
        throw new ProviderParameterValidationError(`Invalid parameter: ${key}`);
      }
      Object.assign(output, { [key]: value });
    } else if (field.type === 'select') {
      if (typeof value !== 'string' || !field.options?.includes(value)) {
        throw new ProviderParameterValidationError(`Invalid parameter: ${key}`);
      }
      Object.assign(output, { [key]: value });
    } else {
      if (
        !Array.isArray(value) ||
        value.length > 16 ||
        value.some((item) => typeof item !== 'string' || item.length > 500)
      ) {
        throw new ProviderParameterValidationError(`Invalid parameter: ${key}`);
      }
      Object.assign(output, { [key]: value });
    }
  }
  if (
    policy.profile === 'anthropic' &&
    ((output.thinkingBudget ?? 0) > 0 || output.outputEffort)
  ) {
    delete output.temperature;
    delete output.topP;
    delete output.topK;
  }
  if (output.reasoningEffort) {
    delete output.temperature;
    delete output.topP;
  }
  return output;
}
