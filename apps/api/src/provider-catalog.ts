export type ProviderSupportLevel =
  'verified' | 'compatible' | 'experimental' | 'coming_soon';

export type ProviderAuthType =
  'bearer' | 'bearer-optional' | 'google-api-key' | 'none' | 'x-api-key';
export type ProviderModelResponseType = 'generic' | 'google' | 'openai';

export interface ProviderConfigurationField {
  key: string;
  label: string;
  maximumLength: number;
  minimumLength: number;
  placeholder?: string;
}

export interface ProviderTemplate {
  authType?: ProviderAuthType;
  baseUrl?: string;
  canRegister: boolean;
  category: 'advanced' | 'featured' | 'template';
  configurationFields?: ProviderConfigurationField[];
  credentialValidationPath?: string;
  defaultFormat?: 'anthropic' | 'gemini' | 'openai' | 'responses';
  formats?: Partial<
    Record<'anthropic' | 'gemini' | 'openai' | 'responses', string>
  >;
  id: string;
  modelListPath?: string;
  modelResponseType?: ProviderModelResponseType;
  name: string;
  parameterProfile: 'anthropic' | 'gemini' | 'novelai' | 'openai' | 'routed';
  staticModels?: readonly string[];
  supportLevel: ProviderSupportLevel;
}

type RegistryTemplateInput = {
  authType?: 'bearer' | 'bearer-optional' | 'none';
  baseUrl: string;
  configurationFields?: ProviderConfigurationField[];
  credentialValidationPath?: string;
  id: string;
  modelListPath?: string;
  name: string;
  openaiPath: string;
  staticModels?: readonly string[];
};

function registryTemplate(input: RegistryTemplateInput): ProviderTemplate {
  return {
    authType: input.authType ?? 'bearer',
    baseUrl: input.baseUrl,
    canRegister: true,
    category: 'template',
    ...(input.configurationFields
      ? { configurationFields: input.configurationFields }
      : {}),
    ...(input.credentialValidationPath
      ? { credentialValidationPath: input.credentialValidationPath }
      : {}),
    defaultFormat: 'openai',
    formats: { openai: input.openaiPath },
    id: input.id,
    ...(input.modelListPath ? { modelListPath: input.modelListPath } : {}),
    modelResponseType: 'generic',
    name: input.name,
    parameterProfile: 'openai',
    ...(input.staticModels ? { staticModels: input.staticModels } : {}),
    supportLevel: 'compatible',
  };
}

const builtInTemplates: ProviderTemplate[] = [
  {
    authType: 'bearer',
    baseUrl: 'https://api.openai.com/v1',
    canRegister: true,
    category: 'featured',
    defaultFormat: 'openai',
    formats: {
      openai: '/chat/completions',
      responses: '/responses',
    },
    id: 'openai',
    modelListPath: '/models',
    modelResponseType: 'openai',
    name: 'OpenAI',
    parameterProfile: 'openai',
    supportLevel: 'compatible',
  },
  {
    authType: 'x-api-key',
    baseUrl: 'https://api.anthropic.com/v1',
    canRegister: true,
    category: 'featured',
    defaultFormat: 'anthropic',
    formats: { anthropic: '/messages' },
    id: 'anthropic',
    modelListPath: '/models',
    modelResponseType: 'openai',
    name: 'Anthropic',
    parameterProfile: 'anthropic',
    supportLevel: 'compatible',
  },
  {
    authType: 'google-api-key',
    baseUrl: 'https://generativelanguage.googleapis.com',
    canRegister: true,
    category: 'featured',
    defaultFormat: 'gemini',
    formats: {
      gemini: '/v1beta/models/{model}:generateContent',
    },
    id: 'google',
    modelListPath: '/v1beta/models',
    modelResponseType: 'google',
    name: 'Google AI Studio',
    parameterProfile: 'gemini',
    supportLevel: 'compatible',
  },
  {
    canRegister: false,
    category: 'advanced',
    id: 'gemini-express',
    name: 'Gemini Express Mode',
    parameterProfile: 'gemini',
    supportLevel: 'experimental',
  },
  {
    canRegister: false,
    category: 'advanced',
    id: 'novelai',
    name: 'NovelAI',
    parameterProfile: 'novelai',
    supportLevel: 'coming_soon',
  },
  {
    canRegister: false,
    category: 'advanced',
    id: 'vertex',
    name: 'Vertex AI',
    parameterProfile: 'routed',
    supportLevel: 'coming_soon',
  },
  {
    canRegister: false,
    category: 'advanced',
    id: 'bedrock',
    name: 'AWS Bedrock',
    parameterProfile: 'routed',
    supportLevel: 'coming_soon',
  },
  {
    canRegister: false,
    category: 'advanced',
    id: 'copilot',
    name: 'GitHub Copilot',
    parameterProfile: 'routed',
    supportLevel: 'coming_soon',
  },
];

const registryTemplates: ProviderTemplate[] = [
  registryTemplate({
    baseUrl: 'https://openrouter.ai/api',
    id: 'openrouter',
    modelListPath: '/v1/models',
    name: 'OpenRouter',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    authType: 'bearer-optional',
    baseUrl: 'https://nano-gpt.com/api',
    id: 'nano-gpt',
    modelListPath: '/v1/models?detailed=true',
    name: 'NanoGPT',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    authType: 'bearer-optional',
    baseUrl: 'https://nano-gpt.com/api/subscription/v1',
    id: 'nano-gpt-subscription',
    modelListPath: '/models?detailed=true',
    name: 'NanoGPT Subscription',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://ai-gateway.vercel.sh',
    id: 'vercel-ai',
    modelListPath: '/v1/models',
    name: 'Vercel AI Gateway',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai',
    configurationFields: [
      {
        key: 'accountId',
        label: 'Cloudflare Account ID',
        maximumLength: 64,
        minimumLength: 1,
        placeholder: 'Cloudflare 계정 ID',
      },
    ],
    id: 'cloudflare-ai-gateway',
    name: 'Cloudflare AI Gateway',
    openaiPath: '/v1/chat/completions',
    staticModels: [
      'openai/gpt-5.5',
      'openai/gpt-5.4',
      'openai/gpt-5.4-mini',
      'anthropic/claude-fable-5',
      'anthropic/claude-opus-4.8',
      'anthropic/claude-opus-4.7',
      'anthropic/claude-opus-4.6',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-haiku-4.5',
      'google/gemini-3.1-pro',
      'google/gemini-3.5-flash',
      'google/gemini-3-flash',
      'google/gemini-3.1-flash-lite',
      'minimax/m2.7',
      '@cf/moonshotai/kimi-k2.6',
      '@cf/google/gemma-4-26b-a4b-it',
      '@cf/zai-org/glm-4.7-flash',
    ],
  }),
  registryTemplate({
    baseUrl: 'https://api.z.ai/api/paas/v4',
    id: 'z-ai',
    name: 'Z.ai',
    openaiPath: '/chat/completions',
    staticModels: [
      'glm-5.2',
      'glm-5.1',
      'glm-5',
      'glm-5-turbo',
      'glm-4.7',
      'glm-4.7-flash',
      'glm-4.7-flashx',
      'glm-4.6',
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5-x',
      'glm-4.5-airx',
      'glm-4.5-flash',
    ],
  }),
  registryTemplate({
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    id: 'z-ai-coding',
    name: 'Z.ai GLM Coding Plan',
    openaiPath: '/chat/completions',
    staticModels: [
      'glm-5.2',
      'glm-5.1',
      'glm-5-turbo',
      'glm-4.7',
      'glm-4.5-air',
    ],
  }),
  registryTemplate({
    baseUrl: 'https://api.fireworks.ai/inference',
    id: 'fireworks',
    modelListPath: '/v1/models',
    name: 'Fireworks AI',
    openaiPath: '/v1/chat/completions',
    staticModels: ['accounts/fireworks/routers/kimi-k2p5-turbo'],
  }),
  registryTemplate({
    baseUrl: 'https://api.arliai.com',
    id: 'arliai',
    modelListPath: '/model/all',
    name: 'ArliAI',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    authType: 'bearer-optional',
    baseUrl: 'https://opencode.ai/zen/go',
    id: 'opencode-go',
    modelListPath: '/v1/models',
    name: 'OpenCode Go',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://ollama.com',
    id: 'ollama-cloud',
    modelListPath: '/v1/models',
    name: 'Ollama Cloud',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://crof.ai',
    id: 'crof-ai',
    modelListPath: '/v1/models',
    name: 'CrofAI',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.synthetic.new',
    id: 'synthetic',
    modelListPath: '/v1/models',
    name: 'Synthetic',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.featherless.ai/v1',
    id: 'featherless',
    modelListPath: '/models',
    name: 'Featherless',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    authType: 'bearer-optional',
    baseUrl: 'https://api.neuralwatt.com/v1',
    id: 'neuralwatt',
    modelListPath: '/models',
    name: 'Neuralwatt Cloud',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.novita.ai/openai',
    id: 'novita',
    modelListPath: '/v1/models',
    name: 'Novita AI',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.novita.ai/openai',
    id: 'novita-coding',
    name: 'Novita Coding',
    openaiPath: '/v1/chat/completions',
    staticModels: [
      'glm-5',
      'kimi-k2.5',
      'glm-4.7',
      'minimax-m2.1',
      'deepseek-v3.2',
      'minimax-m2.5',
      'qwen3.5-397b-a17b',
    ],
  }),
  registryTemplate({
    baseUrl: 'https://api.siliconflow.com/v1',
    id: 'siliconflow',
    modelListPath: '/models?sub_type=chat',
    name: 'SiliconFlow',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.together.xyz/v1',
    id: 'together',
    modelListPath: '/models',
    name: 'Together AI',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.deepseek.com',
    id: 'deepseek',
    modelListPath: '/models',
    name: 'DeepSeek',
    openaiPath: '/chat/completions',
    staticModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  }),
  registryTemplate({
    baseUrl: 'https://inference.do-ai.run',
    id: 'digitalocean',
    modelListPath: '/v1/models',
    name: 'DigitalOcean',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://us.inference.heroku.com',
    id: 'heroku-us',
    name: 'Heroku (US)',
    openaiPath: '/v1/chat/completions',
    staticModels: [
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-4-5-haiku',
      'kimi-k2-5',
      'glm-4-7',
      'glm-4-7-flash',
    ],
  }),
  registryTemplate({
    baseUrl: 'https://eu.inference.heroku.com',
    id: 'heroku-eu',
    name: 'Heroku (EU)',
    openaiPath: '/v1/chat/completions',
    staticModels: [
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-4-5-haiku',
      'kimi-k2-5',
      'glm-4-7',
      'glm-4-7-flash',
    ],
  }),
  registryTemplate({
    baseUrl: 'https://api.xiaomimimo.com',
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    openaiPath: '/v1/chat/completions',
    staticModels: ['mimo-v2.5-pro', 'mimo-v2.5'],
  }),
  registryTemplate({
    baseUrl: 'https://token-plan-sgp.xiaomimimo.com',
    id: 'xiaomi-mimo-token-plan-sgp',
    name: 'MiMo Token Plan (Singapore)',
    openaiPath: '/v1/chat/completions',
    staticModels: ['mimo-v2.5-pro', 'mimo-v2.5'],
  }),
  registryTemplate({
    baseUrl: 'https://token-plan-ams.xiaomimimo.com',
    id: 'xiaomi-mimo-token-plan-ams',
    name: 'MiMo Token Plan (Europe)',
    openaiPath: '/v1/chat/completions',
    staticModels: ['mimo-v2.5-pro', 'mimo-v2.5'],
  }),
  registryTemplate({
    authType: 'bearer-optional',
    baseUrl: 'https://lightning.ai',
    id: 'lightning-ai',
    modelListPath: '/api/v1/models',
    name: 'Lightning AI',
    openaiPath: '/api/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.venice.ai/api/v1',
    id: 'venice-ai',
    modelListPath: '/models?type=text',
    name: 'Venice AI',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.llmgateway.io/v1',
    credentialValidationPath: '/key',
    id: 'llm-gateway',
    modelListPath: '/models?exclude_deprecated=true',
    name: 'LLM Gateway',
    openaiPath: '/chat/completions',
  }),
  registryTemplate({
    authType: 'bearer-optional',
    baseUrl: 'https://api.cerebras.ai',
    id: 'cerebras',
    modelListPath: '/public/v1/models?format=openrouter',
    name: 'Cerebras',
    openaiPath: '/v1/chat/completions',
  }),
  registryTemplate({
    baseUrl: 'https://api.tringpt.com/v1',
    id: 'ai-novelist',
    name: 'AI Novelist',
    openaiPath: '/chat/completions',
    staticModels: ['spiko_ultra'],
  }),
  registryTemplate({
    baseUrl: 'https://wellspring.encrypt.gay/v1',
    id: 'wellspring',
    modelListPath: '/models',
    name: 'Wellspring',
    openaiPath: '/chat/completions',
  }),
];

const featuredOrder = new Map([
  ['openai', 0],
  ['anthropic', 1],
  ['google', 2],
  ['vertex', 3],
]);

export function compareProviderTemplates(
  left: ProviderTemplate,
  right: ProviderTemplate,
): number {
  const leftPriority = featuredOrder.get(left.id);
  const rightPriority = featuredOrder.get(right.id);
  if (leftPriority !== undefined || rightPriority !== undefined) {
    return (
      (leftPriority ?? Number.MAX_SAFE_INTEGER) -
      (rightPriority ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return (
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
    left.id.localeCompare(right.id, 'en')
  );
}

export const providerCatalog: readonly ProviderTemplate[] = Object.freeze(
  [...builtInTemplates, ...registryTemplates].sort(compareProviderTemplates),
);

export function providerTemplateById(id: string): ProviderTemplate | undefined {
  return providerCatalog.find((template) => template.id === id);
}

export function resolveProviderBaseUrl(
  template: ProviderTemplate,
  configuration: Record<string, string>,
): string | undefined {
  if (!template.baseUrl) return undefined;
  let resolved = template.baseUrl;
  for (const field of template.configurationFields ?? []) {
    const value = configuration[field.key]?.trim();
    if (
      !value ||
      value.length < field.minimumLength ||
      value.length > field.maximumLength ||
      !/^[A-Za-z0-9_-]+$/u.test(value)
    ) {
      return undefined;
    }
    resolved = resolved.replaceAll(`{${field.key}}`, value);
  }
  return resolved.includes('{') ? undefined : resolved;
}

export function providerBaseUrlMatchesTemplate(
  template: ProviderTemplate,
  baseUrl: string,
): boolean {
  if (!template.baseUrl) return false;
  const escaped = template.baseUrl
    .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    .replace(/\\\{[A-Za-z0-9_-]+\\\}/gu, '[A-Za-z0-9_-]+');
  return new RegExp(`^${escaped}$`, 'u').test(baseUrl);
}

export function validateProviderCatalog(
  catalog: readonly ProviderTemplate[] = providerCatalog,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const template of catalog) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/u.test(template.id)) {
      issues.push(`Invalid provider template id: ${template.id}`);
    }
    if (ids.has(template.id))
      issues.push(`Duplicate provider id: ${template.id}`);
    ids.add(template.id);
    if (template.canRegister) {
      if (
        !template.baseUrl ||
        new URL(template.baseUrl.replace(/\{[^}]+\}/gu, 'placeholder'))
          .protocol !== 'https:'
      ) {
        issues.push(
          `Registrable provider requires HTTPS base URL: ${template.id}`,
        );
      }
      if (
        !template.authType ||
        (!template.modelListPath && !template.staticModels?.length) ||
        !template.modelResponseType
      ) {
        issues.push(
          `Registrable provider is missing model discovery fields: ${template.id}`,
        );
      }
    }
  }
  return issues;
}
