export interface ChatBranchReference {
  forkedFromMessageId: string | null;
  id: string;
  parentBranchId: string | null;
}

export interface ChatBranchMessageReference {
  id: string;
  sequenceNumber: number;
}

export interface RegenerationMessageReference {
  id: string;
  role: string;
  status: string;
}

export class ChatBranchStateError extends Error {}

export function isLatestRegenerationTarget(
  messages: RegenerationMessageReference[],
  targetId: string,
): boolean {
  const target = messages.at(-1);
  return (
    target?.id === targetId &&
    target.role === 'assistant' &&
    target.status !== 'pending' &&
    target.status !== 'streaming'
  );
}

export function composeBranchMessages<
  TMessage extends ChatBranchMessageReference,
>(
  branchId: string,
  branches: ChatBranchReference[],
  messagesByBranch: ReadonlyMap<string, TMessage[]>,
): TMessage[] {
  const branchesById = new Map(branches.map((branch) => [branch.id, branch]));
  const memo = new Map<string, TMessage[]>();
  const visiting = new Set<string>();

  const compose = (currentBranchId: string): TMessage[] => {
    const cached = memo.get(currentBranchId);
    if (cached) return cached;
    if (visiting.has(currentBranchId)) throw new ChatBranchStateError();
    const branch = branchesById.get(currentBranchId);
    if (!branch) throw new ChatBranchStateError();

    visiting.add(currentBranchId);
    const own = [...(messagesByBranch.get(currentBranchId) ?? [])].sort(
      (left, right) => left.sequenceNumber - right.sequenceNumber,
    );
    let result = own;
    if (branch.parentBranchId) {
      if (!branch.forkedFromMessageId) throw new ChatBranchStateError();
      const parent = compose(branch.parentBranchId);
      const forkIndex = parent.findIndex(
        (message) => message.id === branch.forkedFromMessageId,
      );
      if (forkIndex < 0) throw new ChatBranchStateError();
      result = [...parent.slice(0, forkIndex), ...own];
    }
    visiting.delete(currentBranchId);
    memo.set(currentBranchId, result);
    return result;
  };

  return compose(branchId);
}
