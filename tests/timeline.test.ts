import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOptimisticUserMessage,
  applyTimelineStreamEvent,
  createEmptyTimelineState,
  extractPromptOutline,
  fromTimelineSnapshot,
  projectTimelineRows,
  settleTimelineState,
} from "../shared/timeline";

test("streaming reasoning and assistant_message chunks concatenate and settle cleanly", () => {
  let state = appendOptimisticUserMessage(createEmptyTimelineState(), {
    text: "Why does this hook re-render?",
    clientMessageId: "c1",
    timestamp: "2026-11-21T01:00:00Z",
  });

  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 1,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:01Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "user_message", text: "Why does this hook re-render?", clientMessageId: "c1", messageId: "m1" },
    },
  }).state;
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].kind, "user_message");
  assert.equal(state.items[0].optimistic, false);

  // Stream two reasoning chunks
  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 2,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:02Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "reasoning", text: "Checking deps... " },
    },
  }).state;
  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 3,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:03Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "reasoning", text: "Found unstable object literal." },
    },
  }).state;

  assert.equal(state.items.length, 2);
  assert.equal(state.items[1].kind, "thought");
  assert.equal(state.items[1].text, "Checking deps... Found unstable object literal.");
  assert.equal(state.items[1].status, "loading");

  // Duplicate seq <= maxSeq is ignored
  const deduped = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 3,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:03Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "reasoning", text: "Found unstable object literal." },
    },
  }).state;
  assert.equal(deduped.items[1].kind === "thought" ? deduped.items[1].text : "", "Checking deps... Found unstable object literal.");

  // Assistant answer settles thought -> ready and concatenates deltas
  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 4,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:04Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "assistant_message", text: "Because `options` ", messageId: "am1" },
    },
  }).state;
  assert.equal(state.items[1].kind === "thought" ? state.items[1].status : "", "ready");

  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 5,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:05Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "assistant_message", text: "is recreated each render.", messageId: "am1" },
    },
  }).state;

  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 6,
    epoch: "e1",
    timestamp: "2026-11-21T01:00:06Z",
    event: { type: "turn_completed", provider: "claude", turnId: "t1" },
  }).state;

  assert.equal(state.isTurnActive, false);
  assert.equal(state.items[2].kind, "assistant_message");
  assert.equal(state.items[2].text, "Because `options` is recreated each render.");
  assert.equal(state.items[2].streaming, false);
});

test("projectTimelineRows adapts accurately to full, collapseToolCalls, collapseTurns, and autoExpandReasoning", () => {
  const snapshot = fromTimelineSnapshot({
    epoch: "e1",
    window: { minSeq: 0, maxSeq: 10, nextSeq: 11 },
    agent: { status: "idle", activeTurn: null },
    entries: [
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-21T01:00:00Z",
        seqStart: 1,
        seqEnd: 1,
        item: { type: "user_message", text: "Inspect auth flow" },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-21T01:00:01Z",
        seqStart: 2,
        seqEnd: 2,
        item: { type: "reasoning", text: "Let me read auth.ts and session.ts" },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-21T01:00:02Z",
        seqStart: 3,
        seqEnd: 3,
        item: {
          type: "tool_call",
          callId: "c1",
          name: "Read",
          status: "completed",
          error: null,
          detail: { type: "read", filePath: "src/auth.ts" },
        },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-21T01:00:03Z",
        seqStart: 4,
        seqEnd: 4,
        item: {
          type: "tool_call",
          callId: "c2",
          name: "Read",
          status: "completed",
          error: null,
          detail: { type: "read", filePath: "src/session.ts" },
        },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-21T01:00:04Z",
        seqStart: 5,
        seqEnd: 5,
        item: { type: "assistant_message", text: "Auth validates JWTs in `src/auth.ts`." },
      },
    ],
  });

  // 1. collapseTurns + autoExpandReasoning=false -> user_message, turn_summary, assistant_message
  const collapsedTurns = projectTimelineRows(snapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.deepEqual(
    collapsedTurns.map((r) => r.kind),
    ["user_message", "turn_summary", "assistant_message"],
  );
  if (collapsedTurns[1].kind === "turn_summary") {
    assert.equal(collapsedTurns[1].counts.thoughtCount, 1);
    assert.equal(collapsedTurns[1].counts.readFileCount, 2);
  }

  // 2. collapseTurns + autoExpandReasoning=true -> thought stays expanded above turn_summary!
  const collapsedTurnsExpandedThought = projectTimelineRows(snapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: true,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.deepEqual(
    collapsedTurnsExpandedThought.map((r) => r.kind),
    ["user_message", "thought", "turn_summary", "assistant_message"],
  );
  if (collapsedTurnsExpandedThought[1].kind === "thought") {
    assert.equal(collapsedTurnsExpandedThought[1].expanded, true);
  }

  // 3. collapseToolCalls + autoExpandReasoning=true -> thought ungrouped & expanded, 2 Read calls grouped!
  const groupedTools = projectTimelineRows(snapshot.items, {
    chatDisplay: "collapseToolCalls",
    autoExpandReasoning: true,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.deepEqual(
    groupedTools.map((r) => r.kind),
    ["user_message", "thought", "tool_group", "assistant_message"],
  );

  // 4. full + autoExpandReasoning=false -> every item shown, thought collapsed by default
  const fullRows = projectTimelineRows(snapshot.items, {
    chatDisplay: "full",
    autoExpandReasoning: false,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.deepEqual(
    fullRows.map((r) => r.kind),
    ["user_message", "thought", "tool_call", "tool_call", "assistant_message"],
  );
  if (fullRows[1].kind === "thought") {
    assert.equal(fullRows[1].expanded, false);
  }

  // Outline extraction
  const outline = extractPromptOutline(snapshot.items);
  assert.equal(outline.length, 1);
  assert.equal(outline[0].preview, "Inspect auth flow");
});

test("fromTimelineSnapshot converts Paseo parent->child agent_message tool_call into clean user_message without duplicating optimistic bubble", () => {
  const optimistic = appendOptimisticUserMessage(createEmptyTimelineState(), {
    text: "给我随便画个流程图我看下显示",
    clientMessageId: "c-init",
    timestamp: "2026-11-21T02:00:00Z",
  });
  const optimisticUser = optimistic.items[0];
  assert.equal(optimisticUser.kind, "user_message");

  const snapshot = fromTimelineSnapshot(
    {
      epoch: "e1",
      window: { minSeq: 0, maxSeq: 3, nextSeq: 4 },
      agent: { status: "idle", activeTurn: null },
      entries: [
        {
          provider: "claude",
          turnId: "t1",
          timestamp: "2026-11-21T02:00:01Z",
          seqStart: 1,
          seqEnd: 1,
          item: {
            type: "tool_call",
            callId: "msg-call-1",
            name: "agent_message",
            status: "completed",
            error: null,
            detail: { type: "plain_text", text: "给我随便画个流程图我看下显示" },
            agentMessage: {
              event: "message",
              sender: { id: "parent-1" },
              text: "<sidechat_context>\nMain session: finance\n</sidechat_context>\n\n给我随便画个流程图我看下显示",
            },
          },
        },
      ],
    },
    optimisticUser.kind === "user_message" ? [optimisticUser] : [],
  );

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].kind, "user_message");
  if (snapshot.items[0].kind === "user_message") {
    assert.equal(snapshot.items[0].body, "给我随便画个流程图我看下显示");
    assert.equal(snapshot.items[0].mainContext, "Main session: finance");
    assert.equal(snapshot.items[0].optimistic, undefined);
  }
});

test("projectTimelineRows keeps running tools inside a single stable tool_group without external row bounce, and preserves expanded state across turn completion", () => {
  const runningSnapshot = fromTimelineSnapshot({
    epoch: "e2",
    window: { minSeq: 0, maxSeq: 4, nextSeq: 5 },
    agent: { status: "running", activeTurn: { turnId: "t-live", startedAt: "2026-11-21T03:00:00Z" } },
    entries: [
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:00Z",
        seqStart: 1,
        seqEnd: 1,
        item: { type: "user_message", text: "Check git diff" },
      },
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:01Z",
        seqStart: 2,
        seqEnd: 2,
        item: {
          type: "tool_call",
          callId: "c1",
          name: "Read",
          status: "completed",
          error: null,
          detail: { type: "read", filePath: "package.json" },
        },
      },
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:02Z",
        seqStart: 3,
        seqEnd: 3,
        item: {
          type: "tool_call",
          callId: "c2",
          name: "Bash",
          status: "running",
          error: null,
          detail: { type: "shell", command: "git status" },
        },
      },
    ],
  });

  // 1. Collapsed (default): running c2 stays INSIDE the single `tool_group` row (never pops outside!)
  const liveCollapsedRows = projectTimelineRows(runningSnapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: true,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.deepEqual(
    liveCollapsedRows.map((r) => r.kind),
    ["user_message", "tool_group"],
  );
  const groupRow = liveCollapsedRows[1]!;
  assert.equal(groupRow.kind, "tool_group");
  if (groupRow.kind === "tool_group") {
    assert.equal(groupRow.isLoading, true);
    assert.equal(groupRow.items.length, 2);
    assert.match(groupRow.activeStepLabel ?? "", /Bash.*git status/);
  }

  // 2. Expanded while running: ALL items (including running c2) render nested INSIDE the group!
  const expandedSet = new Set([groupRow.id]);
  const liveExpandedRows = projectTimelineRows(runningSnapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: true,
    expandedGroupIds: expandedSet,
    toggledItemIds: new Set(),
  });
  assert.deepEqual(
    liveExpandedRows.map((r) => r.kind),
    ["user_message", "tool_group", "tool_call", "tool_call"],
  );
  if (liveExpandedRows[2]?.kind === "tool_call" && liveExpandedRows[3]?.kind === "tool_call") {
    assert.equal(liveExpandedRows[2].nested, true);
    assert.equal(liveExpandedRows[3].nested, true);
  }

  // 3. Turn finishes with an assistant message: the group ID stays identical so expansion state is preserved!
  const finishedSnapshot = fromTimelineSnapshot({
    epoch: "e2",
    window: { minSeq: 0, maxSeq: 5, nextSeq: 6 },
    agent: { status: "idle", activeTurn: null },
    entries: [
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:00Z",
        seqStart: 1,
        seqEnd: 1,
        item: { type: "user_message", text: "Check git diff" },
      },
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:01Z",
        seqStart: 2,
        seqEnd: 2,
        item: {
          type: "tool_call",
          callId: "c1",
          name: "Read",
          status: "completed",
          error: null,
          detail: { type: "read", filePath: "package.json" },
        },
      },
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:02Z",
        seqStart: 3,
        seqEnd: 3,
        item: {
          type: "tool_call",
          callId: "c2",
          name: "Bash",
          status: "completed",
          error: null,
          detail: { type: "shell", command: "git status" },
        },
      },
      {
        provider: "claude",
        turnId: "t-live",
        timestamp: "2026-11-21T03:00:04Z",
        seqStart: 4,
        seqEnd: 4,
        item: { type: "assistant_message", text: "Working tree is clean." },
      },
    ],
  });

  const finishedExpandedRows = projectTimelineRows(finishedSnapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: false,
    expandedGroupIds: expandedSet,
    toggledItemIds: new Set(),
  });
  assert.equal(finishedExpandedRows[1]?.id, groupRow.id);
  assert.deepEqual(
    finishedExpandedRows.map((r) => r.kind),
    ["user_message", "turn_summary", "tool_call", "tool_call", "assistant_message"],
  );
});

test("showActions never appears mid-turn or on intermediate assistant narration before subsequent tool calls", () => {
  const midTurnEntries = [
    {
      provider: "claude",
      turnId: "t-multi",
      timestamp: "2026-11-21T03:05:00Z",
      seqStart: 1,
      seqEnd: 1,
      item: { type: "user_message" as const, text: "再帮我看下有没有最新的需要我处理的 request" },
    },
    {
      provider: "claude",
      turnId: "t-multi",
      timestamp: "2026-11-21T03:05:01Z",
      seqStart: 2,
      seqEnd: 2,
      item: { type: "reasoning" as const, text: "Checking tools" },
    },
    {
      provider: "claude",
      turnId: "t-multi",
      timestamp: "2026-11-21T03:05:02Z",
      seqStart: 3,
      seqEnd: 3,
      item: {
        type: "tool_call" as const,
        callId: "c1",
        name: "ToolSearch",
        status: "completed" as const,
        error: null,
        detail: { type: "search" as const, query: "slack" },
      },
    },
    {
      provider: "claude",
      turnId: "t-multi",
      timestamp: "2026-11-21T03:05:03Z",
      seqStart: 4,
      seqEnd: 4,
      item: { type: "assistant_message" as const, text: "Need Slack tool. Search deferred tools." },
    },
    {
      provider: "claude",
      turnId: "t-multi",
      timestamp: "2026-11-21T03:05:04Z",
      seqStart: 5,
      seqEnd: 5,
      item: { type: "reasoning" as const, text: "Searching deferred MCP tools" },
    },
    {
      provider: "claude",
      turnId: "t-multi",
      timestamp: "2026-11-21T03:05:05Z",
      seqStart: 6,
      seqEnd: 6,
      item: {
        type: "tool_call" as const,
        callId: "c2",
        name: "ToolSearch",
        status: "completed" as const,
        error: null,
        detail: { type: "search" as const, query: "slack-personal" },
      },
    },
  ];

  // 1. Mid-turn (even if isTurnActive temporarily flickered false, subsequent thought/tool after assistant_message suppresses showActions!)
  const midTurnSnapshot = fromTimelineSnapshot({
    epoch: "e3",
    window: { minSeq: 0, maxSeq: 6, nextSeq: 7 },
    agent: { status: "running", activeTurn: { turnId: "t-multi", startedAt: "2026-11-21T03:05:00Z" } },
    entries: midTurnEntries,
  });

  const midTurnRows = projectTimelineRows(midTurnSnapshot.items, {
    chatDisplay: "collapseToolCalls",
    autoExpandReasoning: false,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const midTurnAssistantRows = midTurnRows.filter(
    (r): r is Extract<typeof r, { kind: "assistant_message" }> => r.kind === "assistant_message",
  );
  assert.equal(midTurnAssistantRows.length, 1);
  assert.equal(midTurnAssistantRows[0].showActions, false);

  // 2. After final conclusion arrives and turn completes: ONLY the final assistant message has showActions=true!
  const completedSnapshot = fromTimelineSnapshot({
    epoch: "e3",
    window: { minSeq: 0, maxSeq: 7, nextSeq: 8 },
    agent: { status: "idle", activeTurn: null },
    entries: [
      ...midTurnEntries,
      {
        provider: "claude",
        turnId: "t-multi",
        timestamp: "2026-11-21T03:05:08Z",
        seqStart: 7,
        seqEnd: 7,
        item: { type: "assistant_message" as const, text: "目前没有需要你处理的新请求。" },
      },
    ],
  });

  // In `collapseToolCalls`: intermediate narration has showActions=false, final answer has showActions=true
  const completedToolRows = projectTimelineRows(completedSnapshot.items, {
    chatDisplay: "collapseToolCalls",
    autoExpandReasoning: false,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const assistantRows = completedToolRows.filter(
    (r): r is Extract<typeof r, { kind: "assistant_message" }> => r.kind === "assistant_message",
  );
  assert.equal(assistantRows.length, 2);
  assert.equal(assistantRows[0].item.text, "Need Slack tool. Search deferred tools.");
  assert.equal(assistantRows[0].showActions, false);
  assert.equal(assistantRows[1].item.text, "目前没有需要你处理的新请求。");
  assert.equal(assistantRows[1].showActions, true);

  // While turn is still streaming the final message (`isTurnActive: true`), showActions is false on ALL messages
  const stillRunningRows = projectTimelineRows(completedSnapshot.items, {
    chatDisplay: "collapseToolCalls",
    autoExpandReasoning: false,
    isTurnActive: true,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  for (const r of stillRunningRows) {
    if (r.kind === "assistant_message") {
      assert.equal(r.showActions, false);
    }
  }
});

test("canceling or stopping an active turn settles running tool calls so collapsed groups stop showing Working", () => {
  let state = appendOptimisticUserMessage(createEmptyTimelineState(), {
    text: "Run full audit",
    clientMessageId: "c-stop",
    timestamp: "2026-11-28T13:00:00Z",
  });

  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 1,
    epoch: "e1",
    timestamp: "2026-11-28T13:00:01Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "reasoning", text: "Checking repository files" },
    },
  }).state;

  state = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 2,
    epoch: "e1",
    timestamp: "2026-11-28T13:00:02Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: {
        type: "tool_call",
        callId: "call-1",
        name: "Read",
        status: "running",
        error: null,
        detail: { type: "read", filePath: "shared/timeline.ts" },
      },
    },
  }).state;

  // While running, collapsed tool_group is loading ("Working · ...")
  const runningRows = projectTimelineRows(state.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: state.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const runningGroup = runningRows.find((r) => r.kind === "tool_group");
  assert.ok(runningGroup && runningGroup.kind === "tool_group");
  assert.equal(runningGroup.isLoading, true);

  // 1. Manual stop via settleTimelineState
  const stoppedState = settleTimelineState(state, "canceled");
  assert.equal(stoppedState.isTurnActive, false);
  const stoppedTool = stoppedState.items.find((i) => i.kind === "tool_call");
  assert.ok(stoppedTool && stoppedTool.kind === "tool_call");
  assert.equal(stoppedTool.status, "canceled");
  const stoppedRows = projectTimelineRows(stoppedState.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: stoppedState.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const stoppedGroup = stoppedRows.find((r) => r.kind === "tool_group");
  assert.ok(stoppedGroup && stoppedGroup.kind === "tool_group");
  assert.equal(stoppedGroup.isLoading, false);
  assert.equal(stoppedGroup.activeStepLabel, null);

  // 2. Stream turn_canceled event
  const canceledState = applyTimelineStreamEvent(state, {
    agentId: "a1",
    seq: 3,
    epoch: "e1",
    timestamp: "2026-11-28T13:00:03Z",
    event: { type: "turn_canceled", provider: "claude", turnId: "t1" },
  }).state;
  assert.equal(canceledState.isTurnActive, false);
  const canceledTool = canceledState.items.find((i) => i.kind === "tool_call");
  assert.ok(canceledTool && canceledTool.kind === "tool_call");
  assert.equal(canceledTool.status, "canceled");
  const canceledRows = projectTimelineRows(canceledState.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: canceledState.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const canceledGroup = canceledRows.find((r) => r.kind === "tool_group");
  assert.ok(canceledGroup && canceledGroup.kind === "tool_group");
  assert.equal(canceledGroup.isLoading, false);
});

test("fromTimelineSnapshot settles stale running tool calls when agent is idle or in a newer turn", () => {
  // Case A: Agent is idle after reload/stop, but persisted snapshot still has status: "running"
  const idleSnapshot = fromTimelineSnapshot({
    epoch: "e-stop",
    window: { minSeq: 0, maxSeq: 3, nextSeq: 4 },
    agent: { status: "idle", activeTurn: null },
    entries: [
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-28T13:10:00Z",
        seqStart: 1,
        seqEnd: 1,
        item: { type: "user_message", text: "Search codebase" },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-28T13:10:01Z",
        seqStart: 2,
        seqEnd: 2,
        item: { type: "reasoning", text: "Running grep" },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-28T13:10:02Z",
        seqStart: 3,
        seqEnd: 3,
        item: {
          type: "tool_call",
          callId: "grep-1",
          name: "Grep",
          status: "running",
          error: null,
          detail: { type: "search", query: "Working" },
        },
      },
    ],
  });

  const idleTool = idleSnapshot.items.find((i) => i.kind === "tool_call");
  assert.ok(idleTool && idleTool.kind === "tool_call");
  assert.equal(idleTool.status, "canceled");
  const idleRows = projectTimelineRows(idleSnapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: idleSnapshot.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const idleGroup = idleRows.find((r) => r.kind === "tool_group");
  assert.ok(idleGroup && idleGroup.kind === "tool_group");
  assert.equal(idleGroup.isLoading, false);

  // Case B: New turn t2 is running, while interrupted turn t1 still had a running tool_call
  const nextTurnSnapshot = fromTimelineSnapshot({
    epoch: "e-stop",
    window: { minSeq: 0, maxSeq: 6, nextSeq: 7 },
    agent: { status: "running", activeTurn: { turnId: "t2", startedAt: "2026-11-28T13:11:00Z" } },
    entries: [
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-28T13:10:00Z",
        seqStart: 1,
        seqEnd: 1,
        item: { type: "user_message", text: "First prompt (aborted)" },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-28T13:10:01Z",
        seqStart: 2,
        seqEnd: 2,
        item: { type: "reasoning", text: "Checking" },
      },
      {
        provider: "claude",
        turnId: "t1",
        timestamp: "2026-11-28T13:10:02Z",
        seqStart: 3,
        seqEnd: 3,
        item: {
          type: "tool_call",
          callId: "old-call",
          name: "Read",
          status: "running",
          error: null,
          detail: { type: "read", filePath: "old.ts" },
        },
      },
      {
        provider: "claude",
        turnId: "t2",
        timestamp: "2026-11-28T13:11:00Z",
        seqStart: 4,
        seqEnd: 4,
        item: { type: "user_message", text: "Second prompt (active)" },
      },
      {
        provider: "claude",
        turnId: "t2",
        timestamp: "2026-11-28T13:11:01Z",
        seqStart: 5,
        seqEnd: 5,
        item: { type: "reasoning", text: "Inspecting new file" },
      },
      {
        provider: "claude",
        turnId: "t2",
        timestamp: "2026-11-28T13:11:02Z",
        seqStart: 6,
        seqEnd: 6,
        item: {
          type: "tool_call",
          callId: "new-call",
          name: "Read",
          status: "running",
          error: null,
          detail: { type: "read", filePath: "new.ts" },
        },
      },
    ],
  });

  const tools = nextTurnSnapshot.items.filter((i) => i.kind === "tool_call");
  assert.equal(tools.length, 2);
  assert.equal(tools[0].status, "canceled");
  assert.equal(tools[1].status, "running");

  const nextTurnRows = projectTimelineRows(nextTurnSnapshot.items, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: nextTurnSnapshot.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  const groups = nextTurnRows.filter((r) => r.kind === "tool_group");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].isLoading, false);
  assert.equal(groups[1].isLoading, true);
});
