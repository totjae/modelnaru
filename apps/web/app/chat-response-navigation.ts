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
): ResponseAlternative[] {
  if (
    !latestMessage ||
    latestMessage.role !== 'assistant' ||
    !latestMessage.parentMessageId
  ) {
    return [];
  }

  return branches.flatMap((branch) => {
    if (!branch.isSelectable) return [];
    const response = branch.messages.find(
      (message) =>
        message.branchId === branch.id &&
        message.role === 'assistant' &&
        message.parentMessageId === latestMessage.parentMessageId,
    );
    return response ? [{ branchId: branch.id, messageId: response.id }] : [];
  });
}
