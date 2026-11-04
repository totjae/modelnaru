import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import {
  AdminMutationGuard,
  AdminSessionGuard,
  AuthenticatedMutationGuard,
  AuthenticatedSessionGuard,
  type AdminRequest,
  type AuthenticatedRequest,
} from './auth.guard.js';
import {
  AccessRepository,
  AccessModelNotAllowedError,
} from './access.repository.js';
import {
  ConversationNotFoundError,
  ConversationSettingsConflictError,
} from './chats.repository.js';
import { parseUpdate } from './chats.controller.js';
import {
  ChatTemplatesRepository,
  templateError,
  type ChatTemplate,
  type TemplateSelection,
  type TemplateSettings,
} from './chat-templates.js';
import { providerCatalog } from './provider-catalog.js';
import {
  ProviderParameterValidationError,
  type ProviderParameterField,
  providerParameterPolicy,
} from './provider-parameter-policy.js';
import { RequestTraceService } from './request-trace.service.js';
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    v,
  );
const revision = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[1-9]\d{0,18}$/.test(v) &&
  BigInt(v) <= 9223372036854775807n;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : templateError('TEMPLATE_INPUT_INVALID');
const keys = [
  'systemPrompt',
  'historyMessageLimit',
  'contextTokenLimit',
  'requestTraceLimit',
  'responseTimeoutSeconds',
  'webSearchEnabled',
  'generationParameters',
];
export function templateParameterFields(): ProviderParameterField[] {
  const fields = new Map<string, ProviderParameterField>();
  for (const template of providerCatalog) {
    for (const field of providerParameterPolicy(
      template,
      template.defaultFormat === 'gemini'
        ? 'gemini-test'
        : template.defaultFormat === 'anthropic'
          ? 'claude-test'
          : 'gpt-5-mini',
    ).fields) {
      const previous = fields.get(field.key);
      fields.set(
        field.key,
        previous
          ? {
              ...field,
              ...(field.minimum !== undefined && previous.minimum !== undefined
                ? { minimum: Math.min(field.minimum, previous.minimum) }
                : {}),
              ...(field.maximum !== undefined && previous.maximum !== undefined
                ? { maximum: Math.max(field.maximum, previous.maximum) }
                : {}),
              ...(field.options
                ? {
                    options: [
                      ...new Set([
                        ...(previous.options ?? []),
                        ...field.options,
                      ]),
                    ],
                  }
                : {}),
            }
          : field,
      );
    }
  }
  return [...fields.values()];
}
export function parseTemplate(
  body: unknown,
): Omit<ChatTemplate, 'id' | 'version'> {
  const raw = record(body),
    settings = record(raw.settings);
  if (
    Object.keys(raw).some(
      (k) =>
        ![
          'name',
          'description',
          'isEnabled',
          'providerModelId',
          'settings',
          'version',
        ].includes(k),
    ) ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    raw.name.trim().length > 100 ||
    typeof raw.description !== 'string' ||
    raw.description.length > 1000 ||
    typeof raw.isEnabled !== 'boolean' ||
    (raw.providerModelId !== null && !uuid(raw.providerModelId)) ||
    Object.keys(settings).some(
      (k) => !keys.includes(k) && k !== 'resetParameters',
    )
  )
    templateError('TEMPLATE_INPUT_INVALID');
  const { resetParameters, ...values } = settings;
  const parsed = parseUpdate({ ...values, settingsRevision: '1' });
  if (Object.keys(values).length && !parsed)
    templateError('TEMPLATE_INPUT_INVALID');
  const fields = templateParameterFields();
  for (const [key, value] of Object.entries(
    parsed?.generationParameters ?? {},
  )) {
    const field = fields.find((f) => f.key === key);
    if (field?.type === 'select' && !field.options?.includes(String(value)))
      templateError('TEMPLATE_INPUT_INVALID');
  }
  const allowed = new Set(fields.map((f) => f.key as string));
  if (
    resetParameters !== undefined &&
    (!Array.isArray(resetParameters) ||
      resetParameters.length > allowed.size ||
      resetParameters.some((k) => typeof k !== 'string' || !allowed.has(k)))
  )
    templateError('TEMPLATE_INPUT_INVALID');
  const output: TemplateSettings = { ...parsed };
  delete (output as { settingsRevision?: string }).settingsRevision;
  if (resetParameters !== undefined)
    output.resetParameters = resetParameters as string[];
  if (
    output.resetParameters?.some((k) =>
      Object.hasOwn(output.generationParameters ?? {}, k),
    )
  )
    templateError('TEMPLATE_INPUT_INVALID');
  return {
    name: raw.name.trim(),
    description: raw.description,
    isEnabled: raw.isEnabled,
    providerModelId: raw.providerModelId,
    settings: output,
  };
}
type Response = { setHeader(name: string, value: string): void };
function mapError(error: unknown): never {
  if (error instanceof ConversationSettingsConflictError)
    throw new HttpException(
      {
        error: {
          code: 'CHAT_SETTINGS_CONFLICT',
          conversation: error.conversation,
        },
      },
      409,
    );
  if (error instanceof ConversationNotFoundError)
    templateError('CHAT_NOT_FOUND', 404);
  if (error instanceof AccessModelNotAllowedError)
    templateError('ACCESS_MODEL_FORBIDDEN', 404);
  if (
    error instanceof ProviderParameterValidationError ||
    (error instanceof Error && error.message === 'CHAT_PARAMETER_INVALID')
  )
    templateError('CHAT_PARAMETER_INVALID');
  throw error;
}
@Controller('admin/chat-templates')
export class AdminChatTemplatesController {
  constructor(private readonly templates: ChatTemplatesRepository) {}
  @Get()
  @UseGuards(AdminSessionGuard)
  async list(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return {
      templates: await this.templates.list(),
      parameterFields: templateParameterFields(),
    };
  }
  @Post()
  @UseGuards(AdminMutationGuard)
  create(@Body() body: unknown, @Req() req: AdminRequest) {
    return this.templates.save(
      undefined,
      parseTemplate(body),
      undefined,
      req.adminSession!.row.accountKey,
    );
  }
  @Put(':id')
  @UseGuards(AdminMutationGuard)
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    const version = record(body).version;
    if (!uuid(id) || !revision(version))
      templateError('TEMPLATE_INPUT_INVALID');
    return this.templates.save(
      id,
      parseTemplate(body),
      version,
      req.adminSession!.row.accountKey,
    );
  }
  @Delete(':id')
  @UseGuards(AdminMutationGuard)
  async delete(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    const raw = record(body);
    if (!uuid(id) || !revision(raw.version) || Object.keys(raw).length !== 1)
      templateError('TEMPLATE_INPUT_INVALID');
    await this.templates.delete(
      id,
      raw.version,
      req.adminSession!.row.accountKey,
    );
    return { deleted: true };
  }
}
@Controller()
export class ChatTemplatesController {
  constructor(
    private readonly templates: ChatTemplatesRepository,
    private readonly access: AccessRepository,
    private readonly traces: RequestTraceService,
  ) {}
  @Get('chat-templates')
  @UseGuards(AuthenticatedSessionGuard)
  async list(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.authenticatedSession!.principal;
    if (principal.type === 'admin')
      templateError('ACCESS_MODEL_FORBIDDEN', 403);
    const allowed = new Set(
      (await this.access.allowedModels(principal)).map((m) => m.id),
    );
    return {
      templates: (await this.templates.list())
        .filter((t) => t.isEnabled)
        .map((t) => ({
          ...t,
          providerModelId:
            t.providerModelId && allowed.has(t.providerModelId)
              ? t.providerModelId
              : null,
          modelUnavailable:
            !!t.providerModelId && !allowed.has(t.providerModelId),
        })),
    };
  }
  private async run(
    id: string,
    body: unknown,
    req: AuthenticatedRequest,
    apply: boolean,
  ) {
    const input = record(body),
      principal = req.authenticatedSession!.principal;
    if (principal.type === 'admin')
      templateError('ACCESS_MODEL_FORBIDDEN', 403);
    if (
      !uuid(id) ||
      !uuid(input.templateId) ||
      !uuid(input.providerModelId) ||
      !revision(input.templateVersion) ||
      !revision(input.settingsRevision) ||
      Object.keys(input).some(
        (k) =>
          ![
            'templateId',
            'providerModelId',
            'templateVersion',
            'settingsRevision',
            ...(apply ? ['previewToken'] : []),
          ].includes(k),
      ) ||
      (apply &&
        (typeof input.previewToken !== 'string' ||
          !/^[a-f0-9]{64}$/.test(input.previewToken)))
    )
      templateError('TEMPLATE_INPUT_INVALID');
    try {
      const result = await this.templates.preview(
        principal,
        id,
        input as unknown as TemplateSelection,
        apply,
      );
      if (apply && 'requestTraceLimit' in result)
        this.traces.applyConversationLimit(
          req.authenticatedSession!.row.id,
          id,
          result.requestTraceLimit,
        );
      return result;
    } catch (error) {
      mapError(error);
    }
  }
  @Post('conversations/:id/template-preview')
  @UseGuards(AuthenticatedMutationGuard)
  preview(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.run(id, body, req, false);
  }
  @Post('conversations/:id/template-apply')
  @UseGuards(AuthenticatedMutationGuard)
  apply(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.run(id, body, req, true);
  }
}
