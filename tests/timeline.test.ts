import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOptimisticUserMessage,
  applyTimelineStreamEvent,
  createEmptyTimelineState,
  extractPromptOutline,
  fromTimelineSnapshot,
  projectTimelineRows,
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
