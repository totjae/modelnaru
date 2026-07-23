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
  preferredModelId: string | null,
): string {
  const allowedModelIds = new Set(allowedModels.map((model) => model.id));
  if (preferredModelId && allowedModelIds.has(preferredModelId)) {
    return preferredModelId;
  }
  const lastModelId = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        message.providerModelId !== null &&
        allowedModelIds.has(message.providerModelId),
    )?.providerModelId;

  if (lastModelId) return lastModelId;
  return allowedModels[0]?.id ?? '';
}
