import type { SendBehaviorMode } from "./appearance";
import type { SidechatComposerAttachment } from "./attachments";

export interface QueuedSidechatMessage {
  id: string;
  text: string;
  attachments: SidechatComposerAttachment[];
  quotedSelection: string | null;
  attachMainContext: boolean;
}

export type SubmitResolution =
  | { kind: "noop" }
  | { kind: "queue" }
  | { kind: "send"; activeTurnBehavior?: "steer" | "interrupt" };

/**
 * Matches Paseo's `resolveActiveSendBehavior`: when a sidechat agent is waiting on a
 * pending permission response, queuing would stall behind the prompt, so fall back to `"interrupt"`.
 */
export function resolveActiveSendBehavior(
  sendBehavior: SendBehaviorMode,
  hasPendingPermissions: boolean,
): SendBehaviorMode {
  return sendBehavior === "queue" && hasPendingPermissions ? "interrupt" : sendBehavior;
}

export function resolveAlternateSendAction(input: {
  defaultSendBehavior: SendBehaviorMode;
  isAgentRunning: boolean;
  canQueue: boolean;
}): "send" | "queue" | null {
  if (!input.isAgentRunning || !input.canQueue) return null;
  return input.defaultSendBehavior === "queue" ? "send" : "queue";
}

export function resolveSubmitAction(input: {
  hasSendableContent: boolean;
  isAgentRunning: boolean;
  defaultSendBehavior: SendBehaviorMode;
  canQueue: boolean;
  alternate?: boolean;
}): SubmitResolution {
  if (!input.hasSendableContent) {
    return { kind: "noop" };
  }
  if (!input.isAgentRunning) {
    return { kind: "send" };
  }
  if (input.alternate && input.canQueue) {
    if (input.defaultSendBehavior === "queue") {
      return { kind: "send", activeTurnBehavior: "interrupt" };
    }
    return { kind: "queue" };
  }
  if (input.defaultSendBehavior === "queue" && input.canQueue) {
    return { kind: "queue" };
  }
  return {
    kind: "send",
    activeTurnBehavior: input.defaultSendBehavior === "steer" ? "steer" : "interrupt",
  };
}

export function deriveQueuedMessageLabel(item: Pick<QueuedSidechatMessage, "text" | "attachments" | "quotedSelection">): string {
  const cleanText = item.text.trim();
  if (cleanText) {
    if (item.attachments.length > 0) {
      return `${cleanText} (+${item.attachments.length})`;
    }
    return cleanText;
  }
  if (item.attachments.length > 0) {
    return item.attachments
      .map((a) =>
        a.kind === "image"
          ? a.fileName || "image"
          : a.kind === "file"
            ? a.attachment.fileName
            : a.kind === "forge"
              ? `#${a.item.number} ${a.item.title}`
              : a.item.title,
      )
      .join(", ");
  }
  if (item.quotedSelection?.trim()) {
    return item.quotedSelection.trim();
  }
  return "";
}

export function enqueueThreadMessage(
  map: Map<string, QueuedSidechatMessage[]>,
  agentId: string,
  item: QueuedSidechatMessage,
): Map<string, QueuedSidechatMessage[]> {
  const next = new Map(map);
  next.set(agentId, [...(next.get(agentId) ?? []), item]);
  return next;
}

export function removeThreadMessageById(
  map: Map<string, QueuedSidechatMessage[]>,
  agentId: string,
  messageId: string,
): { next: Map<string, QueuedSidechatMessage[]>; removed: QueuedSidechatMessage | null } {
  const current = map.get(agentId) ?? [];
  const target = current.find((m) => m.id === messageId) ?? null;
  if (!target) {
    return { next: map, removed: null };
  }
  const next = new Map(map);
  const remaining = current.filter((m) => m.id !== messageId);
  if (remaining.length === 0) {
    next.delete(agentId);
  } else {
    next.set(agentId, remaining);
  }
  return { next, removed: target };
}

export function prependThreadMessage(
  map: Map<string, QueuedSidechatMessage[]>,
  agentId: string,
  item: QueuedSidechatMessage,
): Map<string, QueuedSidechatMessage[]> {
  const next = new Map(map);
  const current = next.get(agentId) ?? [];
  if (current.some((m) => m.id === item.id)) {
    return next;
  }
  next.set(agentId, [item, ...current]);
  return next;
}

export function clearThreadQueue(
  map: Map<string, QueuedSidechatMessage[]>,
  agentId: string,
): Map<string, QueuedSidechatMessage[]> {
  if (!map.has(agentId)) return map;
  const next = new Map(map);
  next.delete(agentId);
  return next;
}
