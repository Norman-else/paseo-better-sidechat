export type SidechatHandoffIntent =
  | { kind: "prompt"; id: string; text: string; createdAt: number }
  | { kind: "new_thread"; id: string; createdAt: number };

export type SidechatHandoffInput =
  | { kind: "prompt"; text: string }
  | { kind: "new_thread" };

const queueByTarget = new Map<string, SidechatHandoffIntent[]>();
const listeners = new Set<() => void>();

function targetKey(workspaceId: string, agentId?: string | null): string {
  return agentId ? `${workspaceId}::${agentId}` : `${workspaceId}::*`;
}

export function enqueueSidechatHandoff(
  target: { workspaceId: string; agentId?: string | null },
  intent: SidechatHandoffInput,
): void {
  const key = targetKey(target.workspaceId, target.agentId);
  const entry: SidechatHandoffIntent = {
    ...intent,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  } as SidechatHandoffIntent;
  const list = queueByTarget.get(key) ?? [];
  list.push(entry);
  queueByTarget.set(key, list);
  for (const listener of listeners) {
    listener();
  }
}

export function consumeSidechatHandoff(target: {
  workspaceId: string;
  agentId?: string | null;
}): SidechatHandoffIntent | null {
  const keys = target.agentId
    ? [targetKey(target.workspaceId, target.agentId), targetKey(target.workspaceId, null)]
    : [targetKey(target.workspaceId, null)];
  const now = Date.now();

  for (const key of keys) {
    const list = queueByTarget.get(key);
    if (!list || list.length === 0) continue;
    while (list.length > 0) {
      const next = list.shift()!;
      if (now - next.createdAt <= 60_000) {
        if (list.length === 0) queueByTarget.delete(key);
        return next;
      }
    }
    queueByTarget.delete(key);
  }
  return null;
}

export function subscribeSidechatHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const pillPrefListeners = new Set<(enabled: boolean) => void>();

export function notifyComposerPillPreference(enabled: boolean): void {
  for (const listener of pillPrefListeners) {
    listener(enabled);
  }
}

export function subscribeComposerPillPreference(
  listener: (enabled: boolean) => void,
): () => void {
  pillPrefListeners.add(listener);
  return () => {
    pillPrefListeners.delete(listener);
  };
}
