import type { ChatProviderRuntime } from './chat-provider.service.js';

export function estimateInput(
  systemPrompt: string,
  messages: Array<{ content: string; role?: string }>,
): number {
  return (
    Buffer.byteLength(
      JSON.stringify({
        systemPrompt,
        messages: messages.map(({ content, role }) => ({
          role: role ?? 'user',
          content,
        })),
      }),
      'utf8',
    ) +
    messages.length * 64 +
    1_024
  );
}

export function contextBudget(
  runtime: Pick<
    ChatProviderRuntime,
    'contextWindow' | 'maxOutputTokens' | 'imageTokenEstimate'
  >,
  requestedWindow: number,
  requestedOutput?: number,
  imageCount = 0,
) {
  const window = Math.min(requestedWindow, runtime.contextWindow ?? 16_384);
  const output = Math.min(
    requestedOutput ?? 4_096,
    runtime.maxOutputTokens ?? 4_096,
    4_096,
  );
  if (imageCount && runtime.imageTokenEstimate == null)
    throw new Error('CHAT_IMAGE_BUDGET_UNKNOWN');
  const input =
    window -
    output -
    Math.max(1_024, Math.ceil(window * 0.1)) -
    imageCount * Math.max(1_024, runtime.imageTokenEstimate ?? 0);
  return { input, output, window };
}
