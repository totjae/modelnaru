import { createHash } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';
import { DatabaseService } from './database.service.js';
import { AccessRepository } from './access.repository.js';
import {
  ChatsRepository,
  type ChatPrincipal,
  type UpdateConversationInput,
} from './chats.repository.js';
import { providerTemplateById } from './provider-catalog.js';
import {
  normalizeProviderParameters,
  providerParameterPolicy,
  type ProviderGenerationParameters,
} from './provider-parameter-policy.js';
import { contextBudget } from './context-budget.js';

export type TemplateSettings = Omit<
  UpdateConversationInput,
  'title' | 'isPinned' | 'settingsRevision' | 'defaultProviderModelId'
> & { resetParameters?: string[] };
export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  providerModelId: string | null;
  settings: TemplateSettings;
  version: string;
}
export interface TemplateSelection {
  templateId: string;
  templateVersion: string;
  settingsRevision: string;
  providerModelId: string;
  previewToken?: string;
}
export function templateError(code: string, status = 400): never {
  throw new HttpException({ error: { code, message: code } }, status);
}
const columns =
  'id, name, description, is_enabled AS "isEnabled", provider_model_id AS "providerModelId", settings, version::text';

export function mergeTemplateSettings(
  current: TemplateSettings,
  template: TemplateSettings,
) {
  const {
    resetParameters = [],
    generationParameters = {},
    ...settings
  } = template;
  const parameters = {
    ...current.generationParameters,
    ...generationParameters,
  };
  for (const key of resetParameters)
    delete parameters[key as keyof ProviderGenerationParameters];
  return { ...current, ...settings, generationParameters: parameters };
}

@Injectable()
export class ChatTemplatesRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly chats: ChatsRepository,
    private readonly access: AccessRepository,
  ) {}

  async list() {
    const sql = this.database.getClient();
    return sql<
      ChatTemplate[]
    >`SELECT ${sql.unsafe(columns)} FROM chat_templates ORDER BY name,id`;
  }
  async save(
    id: string | undefined,
    value: Omit<ChatTemplate, 'id' | 'version'>,
    version: string | undefined,
    actor: string,
  ) {
    return this.database.getClient().begin(async (sql) => {
      const data = sql.json(value.settings as unknown as JSONValue);
      const rows = id
        ? await sql<
            ChatTemplate[]
          >`UPDATE chat_templates SET name=${value.name}, description=${value.description}, is_enabled=${value.isEnabled}, provider_model_id=${value.providerModelId}, settings=${data}, version=version+1, updated_at=now() WHERE id=${id} AND version=${version!}::bigint RETURNING ${sql.unsafe(columns)}`
        : await sql<
            ChatTemplate[]
          >`INSERT INTO chat_templates(name,description,is_enabled,provider_model_id,settings) VALUES(${value.name},${value.description},${value.isEnabled},${value.providerModelId},${data}) RETURNING ${sql.unsafe(columns)}`;
      if (!rows[0]) templateError('TEMPLATE_CONFLICT', 409);
      await sql`INSERT INTO audit_logs(actor_type,actor_id,action,target_type,after_data) VALUES('admin',${actor},'template.saved','chat_template',${sql.json({ id: rows[0].id, version: rows[0].version })})`;
      return rows[0];
    });
  }
  async delete(id: string, version: string, actor: string) {
    return this.database.getClient().begin(async (sql) => {
      const rows =
        await sql`DELETE FROM chat_templates WHERE id=${id} AND version=${version}::bigint RETURNING id`;
      if (!rows.length) templateError('TEMPLATE_CONFLICT', 409);
      await sql`INSERT INTO audit_logs(actor_type,actor_id,action,target_type,after_data) VALUES('admin',${actor},'template.deleted','chat_template',${sql.json({ id, version })})`;
    });
  }
  async preview(
    principal: ChatPrincipal,
    conversationId: string,
    input: TemplateSelection,
    apply = false,
  ) {
    return this.database.getClient().begin(async (sql) => {
      const [template] = await sql<
        ChatTemplate[]
      >`SELECT ${sql.unsafe(columns)} FROM chat_templates WHERE id=${input.templateId} AND is_enabled FOR SHARE`;
      if (!template) templateError('TEMPLATE_NOT_FOUND', 404);
      if (template.version !== input.templateVersion)
        templateError('TEMPLATE_CONFLICT', 409);
      const current = await this.chats.locked(
        sql,
        principal,
        conversationId,
        input.settingsRevision,
      );
      const active =
        await sql`SELECT id FROM chat_jobs WHERE conversation_id=${conversationId} AND status IN ('pending','streaming')`;
      if (active.length) templateError('CHAT_CONVERSATION_BUSY', 409);
      await this.access.assertModelAllowed(
        principal,
        input.providerModelId,
        sql,
      );
      const prepared = await this.prepare(
        sql,
        input.providerModelId,
        mergeTemplateSettings(
          {
            systemPrompt: current.systemPrompt,
            contextTokenLimit: current.contextTokenLimit,
            historyMessageLimit: current.historyMessageLimit,
            responseTimeoutSeconds: current.responseTimeoutSeconds,
            requestTraceLimit: current.requestTraceLimit,
            webSearchEnabled: current.webSearchEnabled,
            generationParameters: current.generationParameters,
          },
          template.settings,
        ),
      );
      const settings = {
        ...prepared.settings,
        defaultProviderModelId: input.providerModelId,
        settingsRevision: input.settingsRevision,
      };
      const previewToken = createHash('sha256')
        .update(
          JSON.stringify({
            principal,
            conversationId,
            templateVersion: template.version,
            templateId: template.id,
            settings,
            excluded: prepared.excluded,
          }),
        )
        .digest('hex');
      if (!apply)
        return { settings, excluded: prepared.excluded, previewToken };
      if (previewToken !== input.previewToken)
        templateError('TEMPLATE_PREVIEW_CHANGED', 409);
      return this.chats.update(principal, conversationId, settings, sql);
    });
  }
  private async prepare(
    sql: DatabaseTransaction,
    modelId: string,
    settings: TemplateSettings,
  ) {
    const [model] = await sql<
      {
        template_id: string;
        model_id: string;
        max_output_tokens: number | null;
        context_window: number | null;
        supports_web_search: boolean;
      }[]
    >`
      SELECT c.template_id,m.model_id,m.max_output_tokens,m.context_window,m.supports_web_search FROM provider_models m JOIN provider_connections c ON c.id=m.provider_connection_id WHERE m.id=${modelId}`;
    const provider = model && providerTemplateById(model.template_id);
    if (!provider) templateError('ACCESS_MODEL_FORBIDDEN', 404);
    const policy = providerParameterPolicy(provider, model.model_id);
    const accepted: ProviderGenerationParameters = {};
    const excluded: string[] = [];
    for (const [key, value] of Object.entries(
      (settings.generationParameters ?? {}) as Record<string, unknown>,
    )) {
      if (
        !policy.fields.some((f) => f.key === key) ||
        policy.disabledFields?.some((f) => f.key === key)
      ) {
        excluded.push(key);
        continue;
      }
      Object.assign(accepted, { [key]: value });
    }
    const parameters = normalizeProviderParameters(
      provider,
      model.model_id,
      accepted,
    );
    for (const key of Object.keys(accepted))
      if (!Object.hasOwn(parameters, key)) excluded.push(key);
    const budget = contextBudget(
      {
        maxOutputTokens: model.max_output_tokens,
        contextWindow: model.context_window,
      },
      settings.contextTokenLimit!,
      parameters.maxOutputTokens,
    );
    if (budget.input < 1) templateError('CHAT_PARAMETER_INVALID');
    if (settings.webSearchEnabled && !model.supports_web_search) {
      excluded.push('webSearchEnabled');
      settings = { ...settings, webSearchEnabled: false };
    }
    return {
      settings: { ...settings, generationParameters: parameters },
      excluded: excluded.sort(),
    };
  }
}
