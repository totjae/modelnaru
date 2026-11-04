export interface TemplateSettings {
  systemPrompt?: string;
  historyMessageLimit?: number;
  contextTokenLimit?: number;
  requestTraceLimit?: number;
  responseTimeoutSeconds?: number;
  webSearchEnabled?: boolean;
  generationParameters?: Record<string, unknown>;
  resetParameters?: string[];
}
export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  providerModelId: string | null;
  modelUnavailable?: boolean;
  settings: TemplateSettings;
  version: string;
}
