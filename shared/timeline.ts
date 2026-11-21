import type { PaseoAgentTimelineEvent } from "@getpaseo/client";
import type {
  AgentTaskItem,
  AgentTimelineItem,
  ToolCallDetail,
  ToolCallTimelineItem,
} from "@getpaseo/protocol/agent-types";
import type { ChatDisplayMode } from "./appearance";
import { parseSidechatUserMessage } from "./context";

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

export type SidechatItem =
  | SidechatUserItem
  | SidechatAssistantItem
  | SidechatThoughtItem
  | SidechatToolCallItem
  | SidechatTodoItem
  | SidechatNotificationItem
  | SidechatCompactionItem;

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
      items: Array<SidechatThoughtItem | SidechatToolCallItem | SidechatAssistantItem>;
      counts: WorkSummaryCounts;
      isLoading: boolean;
      expanded: boolean;
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

  snapshot.entries.forEach((entry, index) => {
    const isLast = index === snapshot.entries.length - 1;
    const { item, turnId, timestamp, seqStart } = entry;
    const baseId = `seq:${snapshot.epoch}:${seqStart}:${index}`;

    switch (item.type) {
      case "user_message": {
        if (item.clientMessageId) seenClientIds.add(item.clientMessageId);
        items.push(
          makeUserItem(item.messageId ? `msg:${item.messageId}` : baseId, item.text, {
            messageId: item.messageId,
            clientMessageId: item.clientMessageId,
            turnId,
            timestamp,
          }),
        );
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
    }
  });

  // Preserve any in-flight optimistic user messages not yet echoed in the snapshot.
  for (const pending of previousOptimistic) {
    if (pending.clientMessageId && seenClientIds.has(pending.clientMessageId)) continue;
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
            state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: nextItems },
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
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: [...baseItems, created] },
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
          message: item.message || "Unknown notice",
          turnId,
          timestamp,
        };
        return {
          state: { ...state, epoch: nextEpoch, maxSeq: nextMaxSeq, items: [...baseItems, note] },
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

function projectSingleWorkOrAssistant(
  item: SidechatThoughtItem | SidechatToolCallItem | SidechatAssistantItem,
  options: TimelineProjectionOptions,
  questionText: string | null,
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
  return {
    kind: "assistant_message",
    id: item.id,
    item,
    questionText,
  };
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
    groupToolCalls: boolean,
  ) => {
    let run: Array<SidechatThoughtItem | SidechatToolCallItem> = [];
    const flushRun = () => {
      if (run.length === 0) return;
      if (!groupToolCalls || run.length === 1) {
        for (const entry of run) {
          rows.push(projectSingleWorkOrAssistant(entry, options, questionText, false));
        }
      } else {
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
            rows.push(projectSingleWorkOrAssistant(entry, options, questionText, true));
          }
        }
      }
      run = [];
    };

    for (const item of segmentBody) {
      if (groupToolCalls && isGroupableWorkItem(item, options.autoExpandReasoning)) {
        run.push(item);
        continue;
      }
      flushRun();
      if (item.kind === "thought" || item.kind === "tool_call" || item.kind === "assistant_message") {
        rows.push(projectSingleWorkOrAssistant(item, options, questionText, false));
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

    if (options.chatDisplay !== "collapseTurns") {
      pushWithToolGrouping(
        segment.body,
        questionText,
        options.chatDisplay === "collapseToolCalls",
      );
      return;
    }

    // `collapseTurns`: Mirror Paseo's turn folding:
    // While the latest turn is actively running, keep intermediate work grouped with `collapseToolCalls`
    // so live progress is visible; once the turn finishes (and has a final assistant_message), fold all
    // pre-answer intermediate steps into a single `turn_summary` row!
    const isTurnOpen = isLatestSegment && options.isTurnActive;
    let lastAssistantIdx = -1;
    for (let i = segment.body.length - 1; i >= 0; i -= 1) {
      if (segment.body[i].kind === "assistant_message") {
        lastAssistantIdx = i;
        break;
      }
    }

    if (isTurnOpen || lastAssistantIdx <= 0) {
      pushWithToolGrouping(segment.body, questionText, true);
      return;
    }

    const prefix = segment.body.slice(0, lastAssistantIdx);
    const tail = segment.body.slice(lastAssistantIdx);
    const workItems = prefix.filter(
      (entry): entry is SidechatThoughtItem | SidechatToolCallItem =>
        entry.kind === "thought" || entry.kind === "tool_call",
    );
    const counts = summarizeWorkItems(workItems);

    if (!hasWorkCounts(counts)) {
      pushWithToolGrouping(segment.body, questionText, true);
      return;
    }

    // If `autoExpandReasoning` is enabled in Paseo Settings, thoughts stay visible above/inside
    // unless folded; however in Paseo's `collapseTurns`, `turn_summary` summarizes the whole turn's
    // pre-final steps while still honoring `autoExpandReasoning` when the turn is expanded!
    const hostId = segment.userItem?.id ?? prefix[0].id;
    const summaryId = `turn-summary:${hostId}`;
    const expanded = options.expandedGroupIds.has(summaryId);
    const foldableItems = prefix.filter(
      (entry): entry is SidechatThoughtItem | SidechatToolCallItem | SidechatAssistantItem =>
        entry.kind === "thought" || entry.kind === "tool_call" || entry.kind === "assistant_message",
    );

    // If user enabled `autoExpandReasoning`, surface thoughts expanded above the folded tool summary
    // when `!expanded`, or show everything in order when `expanded`!
    if (options.autoExpandReasoning && !expanded) {
      const standaloneThoughts = prefix.filter(
        (entry): entry is SidechatThoughtItem => entry.kind === "thought",
      );
      const nonThoughtWork = prefix.filter(
        (entry): entry is SidechatToolCallItem => entry.kind === "tool_call",
      );
      for (const thought of standaloneThoughts) {
        rows.push(projectSingleWorkOrAssistant(thought, options, questionText, false));
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
          if (entry.kind === "thought" || entry.kind === "tool_call" || entry.kind === "assistant_message") {
            rows.push(projectSingleWorkOrAssistant(entry, options, questionText, true));
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

    // Always keep any error/notification/compaction from prefix visible even when collapsed.
    if (!expanded) {
      for (const entry of prefix) {
        if (entry.kind === "notification" && entry.level === "error") {
          rows.push({ kind: "notification", id: entry.id, item: entry });
        }
      }
    }

    pushWithToolGrouping(tail, questionText, true);
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
