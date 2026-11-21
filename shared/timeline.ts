import type {
  AgentTaskItem,
  AgentTimelineItem,
  JsonValue,
  ToolCallDetail,
  ToolCallTimelineItem,
} from "@getpaseo/protocol/agent-types";
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";
import type { ChatDisplayMode } from "./appearance";
import { parseSidechatUserMessage } from "./context";

export type PaseoAgentTimelineEvent =
  | Extract<SessionOutboundMessage, { type: "agent_stream" }>["payload"]
  | {
      agentId: string;
      event: {
        type: "replacement";
        epoch: string;
      };
    }
  | {
      agentId: string;
      subscriptionId: string;
      event: {
        type: "subscription_restored";
      };
    }
  | {
      agentId: string;
      event: {
        type: "error";
        error: string;
      };
    };

export type SidechatUserItem = {
  kind: "user_message";
  id: string;
  text: string;
  body: string;
  mainContext: string | null;
  quotedSelection: string | null;
  messageId?: string;
  clientMessageId?: string;
  turnId?: string;
  timestamp: string;
  optimistic?: boolean;
};

export type SidechatAssistantItem = {
  kind: "assistant_message";
  id: string;
  text: string;
  messageId?: string;
  turnId?: string;
  timestamp: string;
  streaming: boolean;
};

export type SidechatThoughtItem = {
  kind: "thought";
  id: string;
  text: string;
  status: "loading" | "ready";
  turnId?: string;
  timestamp: string;
};

export type SidechatToolCallItem = {
  kind: "tool_call";
  id: string;
  callId: string;
  name: string;
  status: ToolCallTimelineItem["status"];
  error: unknown;
  detail: ToolCallDetail;
  metadata?: Record<string, unknown>;
  turnId?: string;
  timestamp: string;
};

export type SidechatTodoItem = {
  kind: "todo_list";
  id: string;
  items: AgentTaskItem[];
  turnId?: string;
  timestamp: string;
};

export type SidechatNotificationItem = {
  kind: "notification";
  id: string;
  level: "info" | "warning" | "error";
  sourceType?: "error" | "notification";
  message: string;
  turnId?: string;
  timestamp: string;
};

export type SidechatCompactionItem = {
  kind: "compaction";
  id: string;
  status: "loading" | "completed";
  trigger?: "auto" | "manual";
  preTokens?: number;
  turnId?: string;
  timestamp: string;
};

export type SidechatPluginItem = {
  kind: "plugin";
  id: string;
  pluginId: string;
  pluginItemId: string;
  itemKind: string;
  version: number;
  data: JsonValue;
  sourceId?: string;
  sourceKind?:
    | "user_message"
    | "assistant_message"
    | "thought"
    | "tool_call"
    | "todo_list"
    | "notification"
    | "compaction";
  sourceAssistantText?: string;
  sourceStreaming?: boolean;
  turnId?: string;
  timestamp: string;
};

export type SidechatItem =
  | SidechatUserItem
  | SidechatAssistantItem
  | SidechatThoughtItem
  | SidechatToolCallItem
  | SidechatTodoItem
  | SidechatNotificationItem
  | SidechatCompactionItem
  | SidechatPluginItem;

export interface TimelineState {
  epoch: string | null;
  maxSeq: number;
  items: SidechatItem[];
  isTurnActive: boolean;
  activeTurnId: string | null;
}

export interface WorkSummaryCounts {
  thoughtCount: number;
  readFileCount: number;
  editedFileCount: number;
  commandCount: number;
  searchCount: number;
  otherToolCount: number;
}

export type ProjectedRow =
  | { kind: "user_message"; id: string; item: SidechatUserItem; promptIndex: number }
  | {
      kind: "assistant_message";
      id: string;
      item: SidechatAssistantItem;
      questionText: string | null;
      showActions: boolean;
    }
  | { kind: "thought"; id: string; item: SidechatThoughtItem; expanded: boolean; nested?: boolean }
  | { kind: "tool_call"; id: string; item: SidechatToolCallItem; expanded: boolean; nested?: boolean }
  | {
      kind: "tool_group";
      id: string;
      items: Array<SidechatThoughtItem | SidechatToolCallItem>;
      counts: WorkSummaryCounts;
      isLoading: boolean;
      expanded: boolean;
    }
  | {
      kind: "turn_summary";
      id: string;
      hostId: string;
      items: Array<
        SidechatThoughtItem | SidechatToolCallItem | SidechatAssistantItem | SidechatPluginItem
      >;
      counts: WorkSummaryCounts;
      isLoading: boolean;
      expanded: boolean;
    }
  | {
      kind: "plugin";
      id: string;
      item: SidechatPluginItem;
      questionText: string | null;
      showActions: boolean;
      actionText: string | null;
    }
  | { kind: "todo_list"; id: string; item: SidechatTodoItem }
  | { kind: "notification"; id: string; item: SidechatNotificationItem }
  | { kind: "compaction"; id: string; item: SidechatCompactionItem };

export interface PromptOutlineEntry {
  id: string;
  promptIndex: number;
  preview: string;
  timestamp: string;
}

export function createEmptyTimelineState(): TimelineState {
  return {
    epoch: null,
    maxSeq: -1,
    items: [],
    isTurnActive: false,
    activeTurnId: null,
  };
}

function toolKey(turnId: string | undefined, callId: string): string {
  return turnId ? `turn:${encodeURIComponent(turnId)}/${encodeURIComponent(callId)}` : callId;
}

function makeUserItem(
  id: string,
  text: string,
  meta: {
    messageId?: string;
    clientMessageId?: string;
    turnId?: string;
    timestamp: string;
    optimistic?: boolean;
  },
): SidechatUserItem {
  const parsed = parseSidechatUserMessage(text);
  return {
    kind: "user_message",
    id,
    text,
    body: parsed.body,
    mainContext: parsed.mainContext,
    quotedSelection: parsed.quotedSelection,
    messageId: meta.messageId,
    clientMessageId: meta.clientMessageId,
    turnId: meta.turnId,
    timestamp: meta.timestamp,
    optimistic: meta.optimistic,
  };
}

function settleThoughtsAndStreaming(items: SidechatItem[], settleStreaming = false): SidechatItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.kind === "thought" && item.status !== "ready") {
      changed = true;
      return { ...item, status: "ready" as const };
    }
    if (settleStreaming && item.kind === "assistant_message" && item.streaming) {
      changed = true;
      return { ...item, streaming: false };
    }
    return item;
  });
  return changed ? next : items;
}

function mergeToolStatus(
  prev: ToolCallTimelineItem["status"],
  next: ToolCallTimelineItem["status"],
): ToolCallTimelineItem["status"] {
  if (prev === "failed" || next === "failed") return "failed";
  if (prev === "canceled") return "canceled";
  if (next === "canceled") return prev === "completed" ? "completed" : "canceled";
  if (prev === "completed" || next === "completed") return "completed";
  return "running";
}

function mergeToolDetail(prev: ToolCallDetail, next: ToolCallDetail): ToolCallDetail {
  if (prev.type === "unknown" && next.type !== "unknown") return next;
  if (next.type === "unknown" && prev.type !== "unknown") return prev;
  if (prev.type === "unknown" && next.type === "unknown") {
    return {
      type: "unknown",
      input: next.input ?? prev.input,
      output: next.output ?? prev.output,
    };
  }
  if (prev.type === next.type) {
    return { ...prev, ...next } as ToolCallDetail;
  }
  return next;
}

export interface SnapshotInput {
  epoch: string;
  window: { minSeq: number; maxSeq: number; nextSeq: number };
  agent?: {
    status: string;
    activeTurn?: { turnId: string; startedAt: string | null } | null;
  } | null;
  entries: ReadonlyArray<{
    provider: string;
    item: AgentTimelineItem;
    turnId?: string;
    timestamp: string;
    seqStart: number;
    seqEnd: number;
  }>;
}

export function fromTimelineSnapshot(
  snapshot: SnapshotInput,
  previousOptimistic: ReadonlyArray<SidechatUserItem> = [],
): TimelineState {
  const isTurnActive =
    snapshot.agent?.status === "running" || Boolean(snapshot.agent?.activeTurn?.turnId);
  const activeTurnId = snapshot.agent?.activeTurn?.turnId ?? null;
  const items: SidechatItem[] = [];
  const seenClientIds = new Set<string>();
  const seenUserBodies = new Set<string>();

  snapshot.entries.forEach((entry, index) => {
    const isLast = index === snapshot.entries.length - 1;
    const { item, turnId, timestamp, seqStart } = entry;
    const baseId = `seq:${snapshot.epoch}:${seqStart}:${index}`;

    switch (item.type) {
      case "user_message": {
        if (item.clientMessageId) seenClientIds.add(item.clientMessageId);
        const userItem = makeUserItem(item.messageId ? `msg:${item.messageId}` : baseId, item.text, {
          messageId: item.messageId,
          clientMessageId: item.clientMessageId,
          turnId,
          timestamp,
        });
        seenUserBodies.add(userItem.body);
        items.push(userItem);
        break;
      }
      case "assistant_message": {
        items.push({
          kind: "assistant_message",
          id: item.messageId ? `assistant:${item.messageId}:${seqStart}` : baseId,
          text: item.text,
          messageId: item.messageId,
          turnId,
          timestamp,
          streaming: isLast && isTurnActive,
        });
        break;
      }
      case "reasoning": {
        if (!item.text.trim()) break;
        items.push({
          kind: "thought",
          id: `thought:${seqStart}`,
          text: item.text,
          status: isLast && isTurnActive ? "loading" : "ready",
          turnId,
          timestamp,
        });
        break;
      }
      case "tool_call": {
        const normalized = item.name.trim().replace(/[.\s-]+/g, "_").toLowerCase();
        // Paseo records parent->child initial prompts as `tool_call` with `agentMessage`.
        if (item.agentMessage || normalized === "agent_message" || normalized === "heartbeat") {
          if (item.agentMessage?.event === "message" && item.agentMessage.text.trim()) {
            const userItem = makeUserItem(`agent_msg:${item.callId}`, item.agentMessage.text, {
              turnId,
              timestamp,
            });
            if (!seenUserBodies.has(userItem.body)) {
              seenUserBodies.add(userItem.body);
              items.push(userItem);
            }
          }
          break;
        }
        if (
          entry.provider === "claude" &&
          (normalized === "taskcreate" || normalized === "taskupdate" || normalized === "tasklist")
        ) {
          break;
        }
        items.push({
          kind: "tool_call",
          id: `tool:${toolKey(turnId, item.callId)}`,
          callId: item.callId,
          name: item.name,
          status: item.status,
          error: item.error,
          detail: item.detail,
          metadata: item.metadata,
          turnId,
          timestamp,
        });
        break;
      }
      case "todo": {
        items.push({
          kind: "todo_list",
          id: `todo:${seqStart}`,
          items: item.items,
          turnId,
          timestamp,
        });
        break;
      }
      case "error": {
        items.push({
          kind: "notification",
          id: `err:${seqStart}`,
          level: "error",
          sourceType: "error",
          message: item.message || "Unknown error",
          turnId,
          timestamp,
        });
        break;
      }
      case "notification": {
        items.push({
          kind: "notification",
          id: `note:${seqStart}`,
          level: item.level,
          sourceType: "notification",
          message: item.message,
          turnId,
          timestamp,
        });
        break;
      }
      case "compaction": {
        items.push({
          kind: "compaction",
          id: `compact:${seqStart}`,
          status: item.status,
          trigger: item.trigger,
          preTokens: item.preTokens,
          turnId,
          timestamp,
        });
        break;
      }
      case "plugin": {
        const identity = `plugin:${item.pluginId}:${item.id}`;
        const pluginItem: SidechatPluginItem = {
          kind: "plugin",
          id: identity,
          pluginId: item.pluginId,
          pluginItemId: item.id,
          itemKind: item.kind,
          version: item.version,
          data: item.data,
          turnId,
          timestamp,
        };
        const existingIdx = items.findIndex((i) => i.kind === "plugin" && i.id === identity);
        if (existingIdx >= 0) {
          items[existingIdx] = pluginItem;
        } else {
          items.push(pluginItem);
        }
        break;
      }
    }
  });

  // Preserve any in-flight optimistic user messages not yet echoed in the snapshot.
  for (const pending of previousOptimistic) {
    if (pending.clientMessageId && seenClientIds.has(pending.clientMessageId)) continue;
    if (seenUserBodies.has(pending.body)) continue;
    items.push(pending);
  }

  return {
    epoch: snapshot.epoch,
    maxSeq: snapshot.window.maxSeq,
    items,
    isTurnActive,
    activeTurnId,
  };
}

export function appendOptimisticUserMessage(
  state: TimelineState,
  input: { text: string; clientMessageId: string; timestamp?: string },
): TimelineState {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const userItem = makeUserItem(`optimistic:${input.clientMessageId}`, input.text, {
    clientMessageId: input.clientMessageId,
    timestamp,
    optimistic: true,
  });
  return {
    ...state,
    isTurnActive: true,
    items: [...settleThoughtsAndStreaming(state.items, true), userItem],
  };
}

export interface StreamUpdateOutcome {
  state: TimelineState;
  needsRefetch: boolean;
}

export function applyTimelineStreamEvent(
  state: TimelineState,
  envelope: PaseoAgentTimelineEvent,
): StreamUpdateOutcome {
  const inner = envelope.event;
  if (inner.type === "replacement" || inner.type === "subscription_restored") {
    return { state, needsRefetch: true };
  }
  if (inner.type === "error") {
    return {
      state: {
        ...state,
        isTurnActive: false,
        items: settleThoughtsAndStreaming(state.items, true),
      },
      needsRefetch: true,
    };
  }

  const stream = envelope as Extract<PaseoAgentTimelineEvent, { timestamp: string }>;
  const seq = stream.seq;
  const epoch = stream.epoch;
  if (epoch && state.epoch && epoch !== state.epoch) {
    return { state, needsRefetch: true };
  }
  if (seq !== undefined && state.maxSeq >= 0 && seq <= state.maxSeq) {
    return { state, needsRefetch: false };
  }

  const nextMaxSeq = seq !== undefined ? Math.max(state.maxSeq, seq) : state.maxSeq;
  const nextEpoch = epoch ?? state.epoch;
  const timestamp = stream.timestamp || new Date().toISOString();
  const event = stream.event;

  switch (event.type) {
    case "turn_started": {
      return {
        state: {
          ...state,
          epoch: nextEpoch,
          maxSeq: nextMaxSeq,
          isTurnActive: true,
          activeTurnId: event.turnId ?? state.activeTurnId,
          items: settleThoughtsAndStreaming(state.items, true),
        },
        needsRefetch: false,
      };
    }
    case "turn_completed":
    case "turn_canceled": {
      return {
        state: {
          ...state,
          epoch: nextEpoch,
          maxSeq: nextMaxSeq,
          isTurnActive: false,
          activeTurnId: null,
          items: settleThoughtsAndStreaming(state.items, true),
        },
        needsRefetch: false,
      };
    }
    case "turn_failed": {
      const settled = settleThoughtsAndStreaming(state.items, true);
      const errItem: SidechatNotificationItem = {
        kind: "notification",
        id: `turn_err:${seq ?? Date.now()}`,
        level: "error",
        message: event.error || "Turn failed",
        turnId: event.turnId,
        timestamp,
      };
      return {
        state: {
          ...state,
          epoch: nextEpoch,
          maxSeq: nextMaxSeq,
          isTurnActive: false,
          activeTurnId: null,
          items: [...settled, errItem],
        },
        needsRefetch: false,
      };
    }
    case "timeline": {
      const turnId = event.turnId ?? state.activeTurnId ?? undefined;
      const item = event.item;

      if (item.type === "reasoning") {
        if (!item.text) {
          return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
        }
        const prev = state.items.at(-1);
        if (prev && prev.kind === "thought" && prev.turnId === turnId) {
          const updated: SidechatThoughtItem = {
            ...prev,
            text: `${prev.text}${item.text}`,
            status: "loading",
            timestamp,
          };
          return {
            state: {
              ...state,
              epoch: nextEpoch,
              maxSeq: nextMaxSeq,
              isTurnActive: true,
              items: [...state.items.slice(0, -1), updated],
            },
            needsRefetch: false,
          };
        }
        if (!item.text.trim()) {
          return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
        }
        const created: SidechatThoughtItem = {
          kind: "thought",
          id: `thought:${seq ?? Date.now()}`,
          text: item.text,
          status: "loading",
          turnId,
          timestamp,
        };
        return {
          state: {
            ...state,
            epoch: nextEpoch,
            maxSeq: nextMaxSeq,
            isTurnActive: true,
            items: [...settleThoughtsAndStreaming(state.items, true), created],
          },
          needsRefetch: false,
        };
      }

      if (item.type === "assistant_message") {
        if (!item.text) {
          return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
        }
        const baseItems = settleThoughtsAndStreaming(state.items, false);
        const last = baseItems.at(-1);
        if (
          last &&
          last.kind === "assistant_message" &&
          last.turnId === turnId &&
          (!item.messageId || !last.messageId || item.messageId === last.messageId)
        ) {
          const merged: SidechatAssistantItem = {
            ...last,
            text: `${last.text}${item.text}`,
            messageId: item.messageId ?? last.messageId,
            timestamp,
            streaming: true,
          };
          return {
            state: {
              ...state,
              epoch: nextEpoch,
              maxSeq: nextMaxSeq,
              isTurnActive: true,
              items: [...baseItems.slice(0, -1), merged],
            },
            needsRefetch: false,
          };
        }
        if (!item.text.trim()) {
          return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
        }
        const created: SidechatAssistantItem = {
          kind: "assistant_message",
          id: item.messageId ? `assistant:${item.messageId}:${seq ?? Date.now()}` : `assistant:${seq ?? Date.now()}`,
          text: item.text,
          messageId: item.messageId,
          turnId,
          timestamp,
          streaming: true,
        };
        return {
          state: {
            ...state,
            epoch: nextEpoch,
            maxSeq: nextMaxSeq,
            isTurnActive: true,
            items: [...settleThoughtsAndStreaming(baseItems, true), created],
          },
          needsRefetch: false,
        };
      }

      if (item.type === "tool_call") {
        const normalized = item.name.trim().replace(/[.\s-]+/g, "_").toLowerCase();
        if (item.agentMessage || normalized === "agent_message" || normalized === "heartbeat") {
          if (item.agentMessage?.event === "message" && item.agentMessage.text.trim()) {
            const baseItems = settleThoughtsAndStreaming(state.items, true);
            const confirmed = makeUserItem(`agent_msg:${item.callId}`, item.agentMessage.text, {
              turnId,
              timestamp,
              optimistic: false,
            });
            const optimisticIdx = baseItems.findIndex(
              (entry) =>
                entry.kind === "user_message" &&
                (Boolean(entry.optimistic) || entry.id === confirmed.id) &&
                entry.body === confirmed.body,
            );
            if (optimisticIdx >= 0) {
              const nextItems = [...baseItems];
              nextItems[optimisticIdx] = confirmed;
              return {
                state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: nextItems },
                needsRefetch: false,
              };
            }
            const alreadyExists = baseItems.some(
              (entry) => entry.kind === "user_message" && entry.body === confirmed.body && entry.turnId === turnId,
            );
            if (!alreadyExists) {
              return {
                state: {
                  ...state,
                  epoch: nextEpoch,
                  maxSeq: nextMaxSeq,
                  items: [...baseItems, confirmed],
                },
                needsRefetch: false,
              };
            }
          }
          return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
        }
        if (
          event.provider === "claude" &&
          (normalized === "taskcreate" || normalized === "taskupdate" || normalized === "tasklist")
        ) {
          return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
        }
        const baseItems = settleThoughtsAndStreaming(state.items, true);
        const id = `tool:${toolKey(turnId, item.callId)}`;
        const existingIndex = baseItems.findIndex((entry) => entry.kind === "tool_call" && entry.id === id);
        if (existingIndex >= 0) {
          const prevTool = baseItems[existingIndex] as SidechatToolCallItem;
          const nextStatus = mergeToolStatus(prevTool.status, item.status);
          const updated: SidechatToolCallItem = {
            ...prevTool,
            status: nextStatus,
            error: nextStatus === "failed" ? item.error ?? prevTool.error : null,
            detail: mergeToolDetail(prevTool.detail, item.detail),
            metadata: item.metadata ? { ...prevTool.metadata, ...item.metadata } : prevTool.metadata,
            timestamp,
          };
          const nextItems = [...baseItems];
          nextItems[existingIndex] = updated;
          return {
            state: {
              ...state,
              epoch: nextEpoch,
              maxSeq: nextMaxSeq,
              isTurnActive: state.isTurnActive || nextStatus === "running",
              items: nextItems,
            },
            needsRefetch: false,
          };
        }
        const created: SidechatToolCallItem = {
          kind: "tool_call",
          id,
          callId: item.callId,
          name: item.name,
          status: item.status,
          error: item.status === "failed" ? item.error : null,
          detail: item.detail,
          metadata: item.metadata,
          turnId,
          timestamp,
        };
        return {
          state: {
            ...state,
            epoch: nextEpoch,
            maxSeq: nextMaxSeq,
            isTurnActive: state.isTurnActive || item.status === "running",
            items: [...baseItems, created],
          },
          needsRefetch: false,
        };
      }

      if (item.type === "user_message") {
        const baseItems = settleThoughtsAndStreaming(state.items, true);
        if (item.clientMessageId) {
          const matchIdx = baseItems.findIndex(
            (entry) => entry.kind === "user_message" && entry.clientMessageId === item.clientMessageId,
          );
          if (matchIdx >= 0) {
            const confirmed = makeUserItem(
              item.messageId ? `msg:${item.messageId}` : baseItems[matchIdx].id,
              item.text,
              {
                messageId: item.messageId,
                clientMessageId: item.clientMessageId,
                turnId,
                timestamp,
                optimistic: false,
              },
            );
            const nextItems = [...baseItems];
            nextItems[matchIdx] = confirmed;
            return {
              state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: nextItems },
              needsRefetch: false,
            };
          }
        }
        const created = makeUserItem(
          item.messageId ? `msg:${item.messageId}` : `user:${seq ?? Date.now()}`,
          item.text,
          {
            messageId: item.messageId,
            clientMessageId: item.clientMessageId,
            turnId,
            timestamp,
          },
        );
        return {
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: [...baseItems, created] },
          needsRefetch: false,
        };
      }

      if (item.type === "todo") {
        const baseItems = settleThoughtsAndStreaming(state.items, false);
        const last = baseItems.at(-1);
        const todoItem: SidechatTodoItem = {
          kind: "todo_list",
          id: last?.kind === "todo_list" ? last.id : `todo:${seq ?? Date.now()}`,
          items: item.items,
          turnId,
          timestamp,
        };
        const nextItems =
          last?.kind === "todo_list" ? [...baseItems.slice(0, -1), todoItem] : [...baseItems, todoItem];
        return {
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: nextItems },
          needsRefetch: false,
        };
      }

      if (item.type === "error" || item.type === "notification") {
        const baseItems = settleThoughtsAndStreaming(state.items, false);
        const note: SidechatNotificationItem = {
          kind: "notification",
          id: `note:${seq ?? Date.now()}`,
          level: item.type === "error" ? "error" : item.level,
          sourceType: item.type,
          message: item.message || "Unknown notice",
          turnId,
          timestamp,
        };
        return {
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: [...baseItems, note] },
          needsRefetch: false,
        };
      }

      if (item.type === "compaction") {
        const baseItems = settleThoughtsAndStreaming(state.items, false);
        const last = baseItems.at(-1);
        const compactItem: SidechatCompactionItem = {
          kind: "compaction",
          id: last?.kind === "compaction" ? last.id : `compact:${seq ?? Date.now()}`,
          status: item.status,
          trigger: item.trigger,
          preTokens: item.preTokens,
          turnId,
          timestamp,
        };
        const nextItems =
          last?.kind === "compaction"
            ? [...baseItems.slice(0, -1), compactItem]
            : [...baseItems, compactItem];
        return {
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: nextItems },
          needsRefetch: false,
        };
      }

      if (item.type === "plugin") {
        const baseItems = settleThoughtsAndStreaming(state.items, false);
        const identity = `plugin:${item.pluginId}:${item.id}`;
        const pluginItem: SidechatPluginItem = {
          kind: "plugin",
          id: identity,
          pluginId: item.pluginId,
          pluginItemId: item.id,
          itemKind: item.kind,
          version: item.version,
          data: item.data,
          turnId,
          timestamp,
        };
        const existingIdx = baseItems.findIndex((i) => i.kind === "plugin" && i.id === identity);
        const nextItems =
          existingIdx >= 0
            ? baseItems.map((entry, idx) => (idx === existingIdx ? pluginItem : entry))
            : [...baseItems, pluginItem];
        return {
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: nextItems },
          needsRefetch: false,
        };
      }

      return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
    }
    default: {
      return { state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq }, needsRefetch: false };
    }
  }
}

export function summarizeWorkItems(
  items: ReadonlyArray<SidechatThoughtItem | SidechatToolCallItem>,
): WorkSummaryCounts {
  const editedFiles = new Set<string>();
  const readFiles = new Set<string>();
  let thoughtCount = 0;
  let commandCount = 0;
  let searchCount = 0;
  let otherToolCount = 0;

  for (const item of items) {
    if (item.kind === "thought") {
      thoughtCount += 1;
      continue;
    }
    const { detail, name } = item;
    const lower = name.trim().toLowerCase();
    if (detail.type === "edit" || detail.type === "write") {
      editedFiles.add(detail.filePath || name);
    } else if (detail.type === "read") {
      readFiles.add(detail.filePath || name);
    } else if (detail.type === "shell") {
      commandCount += 1;
    } else if (detail.type === "search" || /(?:^|[_.:/])(?:web_search|grep|glob|search)$/.test(lower)) {
      searchCount += 1;
    } else {
      otherToolCount += 1;
    }
  }

  return {
    thoughtCount,
    readFileCount: readFiles.size,
    editedFileCount: editedFiles.size,
    commandCount,
    searchCount,
    otherToolCount,
  };
}

export function hasWorkCounts(counts: WorkSummaryCounts): boolean {
  return (
    counts.thoughtCount > 0 ||
    counts.readFileCount > 0 ||
    counts.editedFileCount > 0 ||
    counts.commandCount > 0 ||
    counts.searchCount > 0 ||
    counts.otherToolCount > 0
  );
}

function isGroupableWorkItem(
  item: SidechatItem,
  autoExpandReasoning: boolean,
): item is SidechatThoughtItem | SidechatToolCallItem {
  if (item.kind === "thought") return !autoExpandReasoning;
  if (item.kind !== "tool_call") return false;
  return item.detail.type !== "plan" && item.name.trim().toLowerCase() !== "speak";
}

function isItemLoading(item: SidechatThoughtItem | SidechatToolCallItem): boolean {
  if (item.kind === "thought") return item.status !== "ready";
  return item.status === "running";
}

export interface TimelineProjectionOptions {
  chatDisplay: ChatDisplayMode;
  autoExpandReasoning: boolean;
  isTurnActive: boolean;
  expandedGroupIds: ReadonlySet<string>;
  toggledItemIds: ReadonlySet<string>;
}

function resolveThoughtExpanded(
  item: SidechatThoughtItem,
  autoExpandReasoning: boolean,
  toggledItemIds: ReadonlySet<string>,
): boolean {
  const defaultExpanded = autoExpandReasoning || item.status === "loading";
  return toggledItemIds.has(item.id) ? !defaultExpanded : defaultExpanded;
}

export interface TimelineTransformerLike {
  readonly id: string;
  readonly query: {
    readonly itemType: AgentTimelineItem["type"];
  };
  transform(input: {
    item: AgentTimelineItem;
    phase: "streaming" | "complete";
  }): { items: ReadonlyArray<{ type: "plugin"; id?: string; kind: string; version: number; data: JsonValue }> } | undefined;
}

export interface TimelinePluginTransformSource {
  readonly id: string;
  readonly timelineTransformers: ReadonlyArray<TimelineTransformerLike>;
}

const VALID_PLUGIN_ITEM_KIND = /^[a-z][a-z0-9-]*$/;

function isJsonCompatibleValue(value: unknown, seen: Set<object>): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  if (!Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Reflect.ownKeys(value).some((k) => typeof k !== "string")) return false;
  }
  seen.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  const ok = entries.every((entry) => isJsonCompatibleValue(entry, seen));
  seen.delete(value);
  return ok;
}

function deepCloneAndFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepCloneAndFreeze(item))) as unknown as T;
  }
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    clone[k] = deepCloneAndFreeze(v);
  }
  return Object.freeze(clone) as T;
}

function validatePluginTransformResult(
  raw: unknown,
): Array<{ type: "plugin"; id?: string; kind: string; version: number; data: JsonValue }> {
  if (!raw || typeof raw !== "object") {
    throw new Error("transform must return an object containing items");
  }
  const items = Reflect.get(raw, "items");
  if (!Array.isArray(items)) {
    throw new Error("transform result items must be an array");
  }
  const validated: Array<{ type: "plugin"; id?: string; kind: string; version: number; data: JsonValue }> = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object" || Reflect.get(entry, "type") !== "plugin") {
      throw new Error('transformed timeline items must have type "plugin"');
    }
    const kind = Reflect.get(entry, "kind");
    const id = Reflect.get(entry, "id");
    const version = Reflect.get(entry, "version");
    const data = Reflect.get(entry, "data");
    if (typeof kind !== "string" || !VALID_PLUGIN_ITEM_KIND.test(kind)) {
      throw new Error(`invalid transformed timeline item kind: ${String(kind)}`);
    }
    if (id !== undefined && (typeof id !== "string" || id.length === 0)) {
      throw new Error(`invalid transformed timeline item id: ${String(id)}`);
    }
    if (!Number.isInteger(version) || Number(version) < 1) {
      throw new Error(`invalid transformed timeline item version: ${String(version)}`);
    }
    if (!isJsonCompatibleValue(data, new Set())) {
      throw new Error(`transformed timeline item ${kind} data must be JSON-compatible`);
    }
    validated.push({
      type: "plugin",
      ...(id !== undefined ? { id } : {}),
      kind,
      version: Number(version),
      data: JSON.parse(JSON.stringify(data)) as JsonValue,
    });
  }
  return validated;
}

function toProtocolTimelineItem(item: SidechatItem): AgentTimelineItem | null {
  switch (item.kind) {
    case "user_message":
      return {
        type: "user_message",
        text: item.body,
        ...(item.messageId ? { messageId: item.messageId } : {}),
        ...(item.clientMessageId ? { clientMessageId: item.clientMessageId } : {}),
      };
    case "assistant_message":
      return {
        type: "assistant_message",
        text: item.text,
        ...(item.messageId ? { messageId: item.messageId } : {}),
      };
    case "thought":
      return {
        type: "reasoning",
        text: item.text,
      };
    case "tool_call": {
      const base = {
        type: "tool_call" as const,
        callId: item.callId,
        name: item.name,
        detail: item.detail,
        ...(item.metadata ? { metadata: item.metadata } : {}),
      };
      if (item.status === "failed") {
        return { ...base, status: "failed", error: item.error };
      }
      return { ...base, status: item.status, error: null };
    }
    case "todo_list":
      return {
        type: "todo",
        items: item.items,
      };
    case "notification":
      return item.sourceType === "error"
        ? { type: "error", message: item.message }
        : { type: "notification", level: item.level, message: item.message };
    case "compaction":
      return {
        type: "compaction",
        status: item.status,
        ...(item.trigger ? { trigger: item.trigger } : {}),
        ...(item.preTokens !== undefined ? { preTokens: item.preTokens } : {}),
      };
    case "plugin":
      return null;
  }
}

function resolveItemTransformPhase(item: SidechatItem): "streaming" | "complete" {
  if (item.kind === "assistant_message" && item.streaming) return "streaming";
  if (item.kind === "thought" && item.status === "loading") return "streaming";
  if (item.kind === "tool_call" && item.status === "running") return "streaming";
  if (item.kind === "compaction" && item.status === "loading") return "streaming";
  return "complete";
}

const pluginTransformCache = new WeakMap<
  ReadonlyArray<TimelinePluginTransformSource>,
  WeakMap<SidechatItem, Partial<Record<"streaming" | "complete", SidechatItem[]>>>
>();

/**
 * Runs Paseo's exact `transformTimelineItem` + `projectPluginTimelineItems` pipeline
 * (`MOD 5507` + `MOD 5452`) across all installed Paseo timeline transformer plugins
 * (e.g. `Gen-UI` and any future Paseo plugins).
 */
export function applyTimelinePluginsToItems(
  items: ReadonlyArray<SidechatItem>,
  plugins: ReadonlyArray<TimelinePluginTransformSource>,
): SidechatItem[] {
  if (plugins.length === 0 || !plugins.some((p) => p.timelineTransformers.length > 0)) {
    return items as SidechatItem[];
  }

  let itemCache = pluginTransformCache.get(plugins);
  if (!itemCache) {
    itemCache = new WeakMap();
    pluginTransformCache.set(plugins, itemCache);
  }

  let anyChanged = false;
  const result: SidechatItem[] = [];

  for (const sourceItem of items) {
    if (sourceItem.kind === "plugin") {
      result.push(sourceItem);
      continue;
    }

    const phase = resolveItemTransformPhase(sourceItem);
    const cachedByPhase = itemCache.get(sourceItem);
    const cachedOutput = cachedByPhase?.[phase];
    if (cachedOutput) {
      if (cachedOutput.length !== 1 || cachedOutput[0] !== sourceItem) {
        anyChanged = true;
      }
      result.push(...cachedOutput);
      continue;
    }

    const protocolItem = toProtocolTimelineItem(sourceItem);
    if (!protocolItem) {
      result.push(sourceItem);
      continue;
    }

    let transformedItems: SidechatItem[] | null = null;
    const frozenInput = deepCloneAndFreeze(protocolItem);

    outer: for (const plugin of plugins) {
      for (const transformer of plugin.timelineTransformers) {
        if (transformer.query.itemType !== protocolItem.type) continue;
        try {
          const rawOut = transformer.transform({ item: frozenInput, phase });
          if (rawOut === undefined) continue;
          const validated = validatePluginTransformResult(rawOut);
          transformedItems = validated.map((outItem, index): SidechatPluginItem => {
            const pluginItemId = outItem.id ?? `${sourceItem.id}/${index}`;
            return {
              kind: "plugin",
              id: `${plugin.id}/${pluginItemId}`,
              pluginId: plugin.id,
              pluginItemId,
              itemKind: outItem.kind,
              version: outItem.version,
              data: outItem.data,
              sourceId: sourceItem.id,
              sourceKind: sourceItem.kind,
              ...(sourceItem.kind === "assistant_message"
                ? {
                    sourceAssistantText: sourceItem.text,
                    sourceStreaming: sourceItem.streaming,
                  }
                : {}),
              turnId: sourceItem.turnId,
              timestamp: sourceItem.timestamp,
            };
          });
          break outer;
        } catch (err) {
          console.warn(
            `[BetterSidechat] External timeline transformer failed: ${plugin.id}/${transformer.id}`,
            err,
          );
        }
      }
    }

    const finalOutput = transformedItems ?? [sourceItem];
    itemCache.set(sourceItem, { ...cachedByPhase, [phase]: finalOutput });
    if (finalOutput.length !== 1 || finalOutput[0] !== sourceItem) {
      anyChanged = true;
    }
    result.push(...finalOutput);
  }

  return anyChanged ? result : (items as SidechatItem[]);
}

function projectSingleWorkOrAssistant(
  item: SidechatThoughtItem | SidechatToolCallItem | SidechatAssistantItem | SidechatPluginItem,
  options: TimelineProjectionOptions,
  questionText: string | null,
  finalActionableAssistantId: string | null,
  nested = false,
): ProjectedRow {
  if (item.kind === "thought") {
    return {
      kind: "thought",
      id: item.id,
      item,
      expanded: resolveThoughtExpanded(item, options.autoExpandReasoning, options.toggledItemIds),
      nested,
    };
  }
  if (item.kind === "tool_call") {
    return {
      kind: "tool_call",
      id: item.id,
      item,
      expanded: options.toggledItemIds.has(item.id),
      nested,
    };
  }
  if (item.kind === "plugin") {
    const actionText = item.sourceAssistantText?.trim() ? item.sourceAssistantText : null;
    return {
      kind: "plugin",
      id: item.id,
      item,
      questionText,
      showActions:
        !nested &&
        !item.sourceStreaming &&
        Boolean(actionText) &&
        item.id === finalActionableAssistantId,
      actionText,
    };
  }
  return {
    kind: "assistant_message",
    id: item.id,
    item,
    questionText,
    showActions:
      !nested && !item.streaming && Boolean(item.text.trim()) && item.id === finalActionableAssistantId,
  };
}

function isAssistantResponseItem(entry: SidechatItem): boolean {
  if (entry.kind === "assistant_message") return true;
  if (entry.kind === "plugin" && entry.sourceKind === "assistant_message") return true;
  return false;
}

/**
 * Resolves the single final assistant response item of a completed turn that should display
 * the Turn Footer action bar (`Copy` / `Insert to main` / `Send to main`).
 * Works seamlessly for both raw `assistant_message` and `Gen-UI`/plugin-transformed items!
 */
function resolveFinalActionableAssistantId(
  segmentBody: ReadonlyArray<SidechatItem>,
  isSegmentRunning: boolean,
): string | null {
  if (isSegmentRunning) return null;

  let lastAssistantIdx = -1;
  for (let i = segmentBody.length - 1; i >= 0; i -= 1) {
    const entry = segmentBody[i];
    if (entry.kind === "assistant_message" && entry.text.trim().length > 0) {
      lastAssistantIdx = i;
      break;
    }
    if (
      entry.kind === "plugin" &&
      entry.sourceKind === "assistant_message" &&
      Boolean(entry.sourceAssistantText?.trim())
    ) {
      lastAssistantIdx = i;
      break;
    }
  }
  if (lastAssistantIdx < 0) return null;

  // If the model started thinking or invoking tools *after* this assistant message,
  // it was mid-turn narration rather than a completed turn conclusion.
  for (let j = lastAssistantIdx + 1; j < segmentBody.length; j += 1) {
    const after = segmentBody[j];
    if (
      after.kind === "thought" ||
      after.kind === "tool_call" ||
      after.kind === "compaction" ||
      (after.kind === "plugin" && after.sourceKind === "tool_call")
    ) {
      return null;
    }
  }

  return segmentBody[lastAssistantIdx].id;
}

/**
 * Projects Sidechat timeline items into display rows with 100% fidelity to Paseo's
 * `chatDisplay` ("full" | "collapseToolCalls" | "collapseTurns") and `autoExpandReasoning`.
 */
export function projectTimelineRows(
  items: ReadonlyArray<SidechatItem>,
  options: TimelineProjectionOptions,
): ProjectedRow[] {
  const rows: ProjectedRow[] = [];
  let promptCounter = 0;

  // Partition into turns anchored at each `user_message`.
  interface TurnSegment {
    userItem: SidechatUserItem | null;
    body: SidechatItem[];
  }
  const segments: TurnSegment[] = [];
  let current: TurnSegment = { userItem: null, body: [] };

  for (const item of items) {
    if (item.kind === "user_message") {
      if (current.userItem || current.body.length > 0) {
        segments.push(current);
      }
      current = { userItem: item, body: [] };
    } else {
      current.body.push(item);
    }
  }
  if (current.userItem || current.body.length > 0) {
    segments.push(current);
  }

  const pushWithToolGrouping = (
    segmentBody: ReadonlyArray<SidechatItem>,
    questionText: string | null,
    finalActionableAssistantId: string | null,
    groupToolCalls: boolean,
    keepLiveActiveVisible = false,
  ) => {
    let run: Array<SidechatThoughtItem | SidechatToolCallItem> = [];
    const lastSegmentItem = segmentBody.at(-1) ?? null;
    const flushRun = () => {
      if (run.length === 0) return;
      if (!groupToolCalls) {
        for (const entry of run) {
          rows.push(
            projectSingleWorkOrAssistant(
              entry,
              options,
              questionText,
              finalActionableAssistantId,
              false,
            ),
          );
        }
        run = [];
        return;
      }

      // While a turn is actively running, keep any trailing running/latest step visible in place
      // so the user always sees real-time progress (which file is being read, live thought, etc.).
      const liveTrailing: Array<SidechatThoughtItem | SidechatToolCallItem> = [];
      if (keepLiveActiveVisible) {
        while (
          run.length > 0 &&
          (isItemLoading(run[run.length - 1]) || run[run.length - 1] === lastSegmentItem)
        ) {
          liveTrailing.unshift(run.pop()!);
          if (liveTrailing.length >= 2) break;
        }
      }

      if (run.length === 1) {
        rows.push(
          projectSingleWorkOrAssistant(
            run[0],
            options,
            questionText,
            finalActionableAssistantId,
            false,
          ),
        );
      } else if (run.length > 1) {
        const groupId = `group:${run[0].id}`;
        const expanded = options.expandedGroupIds.has(groupId);
        rows.push({
          kind: "tool_group",
          id: groupId,
          items: run,
          counts: summarizeWorkItems(run),
          isLoading: run.some(isItemLoading),
          expanded,
        });
        if (expanded) {
          for (const entry of run) {
            rows.push(
              projectSingleWorkOrAssistant(
                entry,
                options,
                questionText,
                finalActionableAssistantId,
                true,
              ),
            );
          }
        }
      }

      for (const liveEntry of liveTrailing) {
        rows.push(
          projectSingleWorkOrAssistant(
            liveEntry,
            options,
            questionText,
            finalActionableAssistantId,
            false,
          ),
        );
      }
      run = [];
    };

    for (const item of segmentBody) {
      if (groupToolCalls && isGroupableWorkItem(item, options.autoExpandReasoning)) {
        run.push(item);
        continue;
      }
      flushRun();
      if (
        item.kind === "thought" ||
        item.kind === "tool_call" ||
        item.kind === "assistant_message" ||
        item.kind === "plugin"
      ) {
        rows.push(
          projectSingleWorkOrAssistant(
            item,
            options,
            questionText,
            finalActionableAssistantId,
            false,
          ),
        );
      } else if (item.kind === "todo_list") {
        rows.push({ kind: "todo_list", id: item.id, item });
      } else if (item.kind === "notification") {
        rows.push({ kind: "notification", id: item.id, item });
      } else if (item.kind === "compaction") {
        rows.push({ kind: "compaction", id: item.id, item });
      }
    }
    flushRun();
  };

  segments.forEach((segment, segIndex) => {
    const isLatestSegment = segIndex === segments.length - 1;
    const questionText = segment.userItem?.body ?? null;

    if (segment.userItem) {
      promptCounter += 1;
      rows.push({
        kind: "user_message",
        id: segment.userItem.id,
        item: segment.userItem,
        promptIndex: promptCounter,
      });
    }

    const hasRunningStepInSegment = segment.body.some(
      (entry) =>
        (entry.kind === "thought" && entry.status !== "ready") ||
        (entry.kind === "tool_call" && entry.status === "running") ||
        (entry.kind === "assistant_message" && entry.streaming) ||
        (entry.kind === "plugin" && Boolean(entry.sourceStreaming)) ||
        (entry.kind === "compaction" && entry.status === "loading"),
    );
    const isTurnOpen = (isLatestSegment && options.isTurnActive) || hasRunningStepInSegment;
    const finalActionableAssistantId = resolveFinalActionableAssistantId(
      segment.body,
      isTurnOpen,
    );

    if (options.chatDisplay !== "collapseTurns") {
      pushWithToolGrouping(
        segment.body,
        questionText,
        finalActionableAssistantId,
        options.chatDisplay === "collapseToolCalls",
        isTurnOpen,
      );
      return;
    }

    let lastAssistantIdx = -1;
    for (let i = segment.body.length - 1; i >= 0; i -= 1) {
      if (isAssistantResponseItem(segment.body[i])) {
        lastAssistantIdx = i;
        break;
      }
    }

    // When a timeline transformer (like Gen-UI) splits the final `assistant_message` into multiple
    // `plugin` items sharing `sourceId`, keep ALL items from that final message together in `tail`!
    let tailStartIdx = lastAssistantIdx;
    if (tailStartIdx > 0) {
      const anchor = segment.body[tailStartIdx];
      if (anchor.kind === "plugin" && anchor.sourceId) {
        while (tailStartIdx > 0) {
          const prev = segment.body[tailStartIdx - 1];
          if (prev.kind === "plugin" && prev.sourceId === anchor.sourceId) {
            tailStartIdx -= 1;
          } else {
            break;
          }
        }
      }
    }

    if (isTurnOpen || tailStartIdx <= 0) {
      pushWithToolGrouping(
        segment.body,
        questionText,
        finalActionableAssistantId,
        true,
        isTurnOpen,
      );
      return;
    }

    const prefix = segment.body.slice(0, tailStartIdx);
    const tail = segment.body.slice(tailStartIdx);
    const workItems = prefix.filter(
      (entry): entry is SidechatThoughtItem | SidechatToolCallItem =>
        entry.kind === "thought" || entry.kind === "tool_call",
    );
    const counts = summarizeWorkItems(workItems);

    if (!hasWorkCounts(counts)) {
      pushWithToolGrouping(segment.body, questionText, finalActionableAssistantId, true);
      return;
    }

    const hostId = segment.userItem?.id ?? prefix[0].id;
    const summaryId = `turn-summary:${hostId}`;
    const expanded = options.expandedGroupIds.has(summaryId);
    const foldableItems = prefix.filter(
      (
        entry,
      ): entry is
        | SidechatThoughtItem
        | SidechatToolCallItem
        | SidechatAssistantItem
        | SidechatPluginItem =>
        entry.kind === "thought" ||
        entry.kind === "tool_call" ||
        entry.kind === "assistant_message" ||
        entry.kind === "plugin",
    );

    if (options.autoExpandReasoning && !expanded) {
      const standaloneThoughts = prefix.filter(
        (entry): entry is SidechatThoughtItem => entry.kind === "thought",
      );
      const nonThoughtWork = prefix.filter(
        (entry): entry is SidechatToolCallItem => entry.kind === "tool_call",
      );
      for (const thought of standaloneThoughts) {
        rows.push(
          projectSingleWorkOrAssistant(
            thought,
            options,
            questionText,
            finalActionableAssistantId,
            false,
          ),
        );
      }
      if (nonThoughtWork.length > 0) {
        const toolOnlyCounts = summarizeWorkItems(nonThoughtWork);
        rows.push({
          kind: "turn_summary",
          id: summaryId,
          hostId,
          items: foldableItems,
          counts: toolOnlyCounts,
          isLoading: false,
          expanded: false,
        });
      }
    } else {
      rows.push({
        kind: "turn_summary",
        id: summaryId,
        hostId,
        items: foldableItems,
        counts,
        isLoading: false,
        expanded,
      });
      if (expanded) {
        for (const entry of prefix) {
          if (
            entry.kind === "thought" ||
            entry.kind === "tool_call" ||
            entry.kind === "assistant_message" ||
            entry.kind === "plugin"
          ) {
            rows.push(
              projectSingleWorkOrAssistant(
                entry,
                options,
                questionText,
                finalActionableAssistantId,
                true,
              ),
            );
          } else if (entry.kind === "todo_list") {
            rows.push({ kind: "todo_list", id: entry.id, item: entry });
          } else if (entry.kind === "notification") {
            rows.push({ kind: "notification", id: entry.id, item: entry });
          } else if (entry.kind === "compaction") {
            rows.push({ kind: "compaction", id: entry.id, item: entry });
          }
        }
      }
    }

    if (!expanded) {
      for (const entry of prefix) {
        if (entry.kind === "notification" && entry.level === "error") {
          rows.push({ kind: "notification", id: entry.id, item: entry });
        }
      }
    }

    pushWithToolGrouping(tail, questionText, finalActionableAssistantId, true);
  });

  return rows;
}

export function extractPromptOutline(items: ReadonlyArray<SidechatItem>): PromptOutlineEntry[] {
  const outline: PromptOutlineEntry[] = [];
  let index = 0;
  for (const item of items) {
    if (item.kind !== "user_message") continue;
    index += 1;
    const singleLine = item.body.replace(/\s+/g, " ").trim();
    outline.push({
      id: item.id,
      promptIndex: index,
      preview: singleLine.length <= 56 ? singleLine : `${singleLine.slice(0, 55).trimEnd()}…`,
      timestamp: item.timestamp,
    });
  }
  return outline;
}

export interface ToolDisplaySummary {
  icon: string;
  title: string;
  subtitle: string | null;
  codePreview: string | null;
  outputPreview: string | null;
  errorText: string | null;
}

function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 3) return parts.join("/");
  return `…/${parts.slice(-3).join("/")}`;
}

function formatUnknownBlock(value: unknown, maxLen = 1200): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen)}…`;
  }
  try {
    const json = JSON.stringify(value, null, 2);
    if (!json || json === "{}" || json === "null") return null;
    return json.length <= maxLen ? json : `${json.slice(0, maxLen)}…`;
  } catch {
    return String(value);
  }
}

export function describeSidechatToolCall(item: SidechatToolCallItem): ToolDisplaySummary {
  const errorText =
    item.status === "failed" && item.error
      ? typeof item.error === "string"
        ? item.error
        : item.error && typeof item.error === "object" && "message" in item.error
          ? String((item.error as { message?: unknown }).message ?? "Failed")
          : formatUnknownBlock(item.error, 400)
      : null;

  const { detail } = item;
  switch (detail.type) {
    case "read": {
      const range =
        detail.offset !== undefined
          ? `:${detail.offset}${detail.limit ? `-${detail.offset + detail.limit}` : ""}`
          : "";
      return {
        icon: "Eye",
        title: "Read",
        subtitle: `${shortPath(detail.filePath)}${range}`,
        codePreview: detail.filePath,
        outputPreview: detail.content ? formatUnknownBlock(detail.content, 1000) : null,
        errorText,
      };
    }
    case "edit":
    case "write": {
      return {
        icon: "Pencil",
        title: detail.type === "edit" ? "Edit" : "Write",
        subtitle: shortPath(detail.filePath),
        codePreview:
          detail.type === "edit"
            ? detail.unifiedDiff
              ? formatUnknownBlock(detail.unifiedDiff, 1200)
              : detail.filePath
            : detail.filePath,
        outputPreview: detail.type === "write" ? formatUnknownBlock(detail.content, 800) : null,
        errorText,
      };
    }
    case "shell": {
      const exitSuffix =
        detail.exitCode !== undefined && detail.exitCode !== null && detail.exitCode !== 0
          ? ` (exit ${detail.exitCode})`
          : "";
      return {
        icon: "SquareTerminal",
        title: `Bash${exitSuffix}`,
        subtitle: detail.command.replace(/\s+/g, " ").slice(0, 80),
        codePreview: detail.command,
        outputPreview: detail.output ? formatUnknownBlock(detail.output, 1200) : null,
        errorText,
      };
    }
    case "search": {
      const countInfo =
        detail.numMatches !== undefined
          ? `${detail.numMatches} matches`
          : detail.numFiles !== undefined
            ? `${detail.numFiles} files`
            : detail.filePaths?.length
              ? `${detail.filePaths.length} files`
              : null;
      return {
        icon: detail.toolName === "web_search" ? "Globe" : "Search",
        title:
          detail.toolName === "glob"
            ? "Glob"
            : detail.toolName === "grep"
              ? "Grep"
              : detail.toolName === "web_search"
                ? "WebSearch"
                : "Search",
        subtitle: [detail.query, countInfo].filter(Boolean).join(" · "),
        codePreview: detail.query,
        outputPreview:
          detail.content
            ? formatUnknownBlock(detail.content, 1000)
            : detail.filePaths?.length
              ? detail.filePaths.slice(0, 20).join("\n")
              : detail.webResults?.length
                ? detail.webResults.map((r) => `${r.title} (${r.url})`).join("\n")
                : null,
        errorText,
      };
    }
    case "fetch": {
      return {
        icon: "Globe",
        title: "Fetch",
        subtitle: detail.url,
        codePreview: detail.url,
        outputPreview: detail.result ? formatUnknownBlock(detail.result, 1000) : null,
        errorText,
      };
    }
    case "sub_agent": {
      return {
        icon: "Bot",
        title: detail.subAgentType || "Subagent",
        subtitle: detail.description ?? null,
        codePreview: null,
        outputPreview: detail.log ? formatUnknownBlock(detail.log, 1000) : null,
        errorText,
      };
    }
    case "plain_text": {
      return {
        icon: "Sparkles",
        title: detail.label || item.name,
        subtitle: detail.text ? detail.text.replace(/\s+/g, " ").slice(0, 72) : null,
        codePreview: null,
        outputPreview: detail.text ? formatUnknownBlock(detail.text, 1000) : null,
        errorText,
      };
    }
    case "plan": {
      return {
        icon: "ListChecks",
        title: "Plan",
        subtitle: detail.text.replace(/\s+/g, " ").slice(0, 72),
        codePreview: null,
        outputPreview: formatUnknownBlock(detail.text, 1500),
        errorText,
      };
    }
    default: {
      return {
        icon: "Wrench",
        title: item.name,
        subtitle: null,
        codePreview: formatUnknownBlock(detail.type === "unknown" ? detail.input : null, 800),
        outputPreview: formatUnknownBlock(detail.type === "unknown" ? detail.output : null, 1000),
        errorText,
      };
    }
  }
}
