export type ProviderSupportLevel =
  'verified' | 'compatible' | 'experimental' | 'coming_soon';

export type ProviderAuthType = 'bearer' | 'google-api-key' | 'x-api-key';
export type ProviderModelResponseType = 'google' | 'openai';

export interface ProviderTemplate {
  authType?: ProviderAuthType;
  baseUrl?: string;
  canRegister: boolean;
  category: 'advanced' | 'featured' | 'template';
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
  supportLevel: ProviderSupportLevel;
}

const registrableTemplates: ProviderTemplate[] = [
  {
    authType: 'bearer',
    baseUrl: 'https://api.llmgateway.io/v1',
    canRegister: true,
    category: 'featured',
    credentialValidationPath: '/key',
    defaultFormat: 'openai',
    formats: {
      anthropic: '/messages',
      openai: '/chat/completions',
      responses: '/responses',
    },
    id: 'llm-gateway',
    modelListPath: '/models?exclude_deprecated=true',
    modelResponseType: 'openai',
    name: 'LLM Gateway',
    parameterProfile: 'openai',
    supportLevel: 'compatible',
  },
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
];

const futureTemplates: Array<
  Pick<ProviderTemplate, 'category' | 'id' | 'name' | 'supportLevel'> & {
    parameterProfile?: ProviderTemplate['parameterProfile'];
  }
> = [
  {
    category: 'advanced',
    id: 'gemini-express',
    name: 'Gemini Express Mode',
    parameterProfile: 'gemini',
    supportLevel: 'experimental',
  },
  {
    category: 'advanced',
    id: 'novelai',
    name: 'NovelAI',
    parameterProfile: 'novelai',
    supportLevel: 'coming_soon',
  },
  {
    category: 'advanced',
    id: 'vertex',
    name: 'Vertex AI',
    parameterProfile: 'routed',
    supportLevel: 'coming_soon',
  },
  {
    category: 'advanced',
    id: 'bedrock',
    name: 'AWS Bedrock',
    parameterProfile: 'routed',
    supportLevel: 'coming_soon',
  },
  {
    category: 'advanced',
    id: 'copilot',
    name: 'GitHub Copilot',
    parameterProfile: 'routed',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'openrouter',
    name: 'OpenRouter',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'nanogpt',
    name: 'NanoGPT',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'nanogpt-subscription',
    name: 'NanoGPT Subscription',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'cloudflare-ai-gateway',
    name: 'Cloudflare AI Gateway',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'z-ai',
    name: 'Z.ai',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'z-ai-coding',
    name: 'Z.ai Coding',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'fireworks-ai',
    name: 'Fireworks AI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'arliai',
    name: 'ArliAI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'opencode-go',
    name: 'OpenCode Go',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'ollama-cloud',
    name: 'Ollama Cloud',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'crofai',
    name: 'CrofAI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'synthetic',
    name: 'Synthetic',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'featherless',
    name: 'Featherless',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'neuralwatt-cloud',
    name: 'Neuralwatt Cloud',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'novita-ai',
    name: 'Novita AI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'novita-coding',
    name: 'Novita Coding',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'siliconflow',
    name: 'SiliconFlow',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'together-ai',
    name: 'Together AI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'deepseek',
    name: 'DeepSeek',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'digitalocean',
    name: 'DigitalOcean',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'heroku-us',
    name: 'Heroku US',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'heroku-eu',
    name: 'Heroku EU',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'xiaomi-mimo-token-plan',
    name: 'Xiaomi MiMo Token Plan',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'lightning-ai',
    name: 'Lightning AI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'venice-ai',
    name: 'Venice AI',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'cerebras',
    name: 'Cerebras',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'ai-novelist',
    name: 'AI Novelist',
    supportLevel: 'coming_soon',
  },
  {
    category: 'template',
    id: 'wellspring',
    name: 'Wellspring',
    supportLevel: 'coming_soon',
  },
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
  [
    ...registrableTemplates,
    ...futureTemplates.map((template) => ({
      ...template,
      canRegister: false,
      parameterProfile: template.parameterProfile ?? ('openai' as const),
    })),
  ].sort(compareProviderTemplates),
);

export function providerTemplateById(id: string): ProviderTemplate | undefined {
  return providerCatalog.find((template) => template.id === id);
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
        new URL(template.baseUrl).protocol !== 'https:'
      ) {
        issues.push(
          `Registrable provider requires HTTPS base URL: ${template.id}`,
        );
      }
      if (
        !template.authType ||
        !template.modelListPath ||
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
