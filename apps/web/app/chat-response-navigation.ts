interface ResponseMessageReference {
  branchId: string | null;
  id: string;
  parentMessageId: string | null;
  role: string;
}

interface ResponseBranchReference {
  id: string;
  isSelectable: boolean;
  messages: ResponseMessageReference[];
}

export interface ResponseAlternative {
  branchId: string;
  messageId: string;
}

export function responseAlternatives(
  branches: ResponseBranchReference[],
  latestMessage: ResponseMessageReference | undefined,
  includeUnselectable = false,
): ResponseAlternative[] {
  if (
    !latestMessage ||
    latestMessage.role !== 'assistant' ||
    !latestMessage.parentMessageId
  ) {
    return [];
  }

  return branches.flatMap((branch) => {
    if (!includeUnselectable && !branch.isSelectable) return [];
    const response = branch.messages.find(
      (message) =>
        message.branchId === branch.id &&
        message.role === 'assistant' &&
        message.parentMessageId === latestMessage.parentMessageId,
    );
    return response ? [{ branchId: branch.id, messageId: response.id }] : [];
  });
}

// Replace only sibling answers to the exact question; preserve other turns and pagination.
export function displayResponse<T extends ResponseMessageReference>(
  messages: T[],
  response: T,
): T[] {
  if (response.role !== 'assistant' || !response.parentMessageId)
    return messages;
  const index = messages.findIndex(
    (m) =>
      m.role === 'assistant' && m.parentMessageId === response.parentMessageId,
  );
  if (index < 0) return messages;
  return messages.flatMap((m, i) =>
    i === index
      ? [response]
      : m.role === 'assistant' && m.parentMessageId === response.parentMessageId
        ? []
        : [m],
  );
}
