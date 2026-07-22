interface AllowedModelReference {
  id: string;
}

interface MessageModelReference {
  providerModelId: string | null;
  role: string;
}

export function selectConversationModel(
  messages: MessageModelReference[],
  allowedModels: AllowedModelReference[],
  currentModelId: string,
): string {
  const allowedModelIds = new Set(allowedModels.map((model) => model.id));
  const lastModelId = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        message.providerModelId !== null &&
        allowedModelIds.has(message.providerModelId),
    )?.providerModelId;

  if (lastModelId) return lastModelId;
  if (allowedModelIds.has(currentModelId)) return currentModelId;
  return allowedModels[0]?.id ?? '';
}
