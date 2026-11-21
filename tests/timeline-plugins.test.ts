import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  applyTimelinePluginsToItems,
  applyTimelineStreamEvent,
  createEmptyTimelineState,
  fromTimelineSnapshot,
  projectTimelineRows,
} from "../shared/timeline";
import { collectTimelinePluginContributions } from "../shared/timeline-plugin-loader";

test("collectTimelinePluginContributions evaluates Gen-UI style clientBundle, captures transformers/renderers, and no-ops sidebar views", async () => {
  let cleanedUp = false;

  const mockGenUiBundle = `(function(require) {
    const module = { exports: {} };
    const { z } = require("zod");
    module.exports.default = function contribute(client) {
      // Host UI registrations must safely no-op without duplicating in Paseo
      client.addSidebarView({
        id: "gen-ui-gallery",
        title: "Gen-UI Gallery",
        icon: "LayoutGrid",
        Component: function Gallery() { return null; },
      });

      client.addTimelineTransformer({
        id: "gen-ui-assistant",
        query: { itemType: "assistant_message" },
        transform({ item, phase }) {
          if (!item.text.includes("Card(")) return undefined;
          const parts = item.text.split(/(\\x60{3}[\\s\\S]*?Card\\([\\s\\S]*?\\x60{3})/);
          const items = [];
          parts.forEach((seg, idx) => {
            if (!seg.trim()) return;
            if (seg.includes("Card(")) {
              items.push({
                type: "plugin",
                id: "seg-" + idx,
                kind: "gen-ui-card",
                version: 1,
                data: { dsl: seg, streaming: phase === "streaming" },
              });
            } else {
              items.push({
                type: "plugin",
                id: "seg-" + idx,
                kind: "gen-ui-prose",
                version: 1,
                data: { markdown: seg },
              });
            }
          });
          return { items };
        },
      });

      client.addTimelineRenderer({
        kind: "gen-ui-card",
        version: 1,
        schema: z.object({ dsl: z.string(), streaming: z.boolean() }),
        Component: function GenUiCardView() { return null; },
      });

      client.addTimelineRenderer({
        kind: "gen-ui-prose",
        version: 1,
        schema: z.object({ markdown: z.string() }),
        Component: function GenUiProseView() { return null; },
      });

      return function cleanup() {
        return "cleaned";
      };
    };
    return module.exports;
  })`;

  const evaluated = collectTimelinePluginContributions({
    pluginId: "paseo-gen-ui",
    bundleHash: "hash-v1",
    bundleCode: mockGenUiBundle,
    evaluateFactory: (_id, code) => {
      const fn = (0, globalThis.eval)(code) as (req: (s: string) => unknown) => unknown;
      return fn;
    },
    requireModule: (specifier) => {
      if (specifier === "zod") return { z };
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });

  assert.equal(evaluated.id, "paseo-gen-ui");
  assert.equal(evaluated.timelineTransformers.length, 1);
  assert.equal(evaluated.timelineRenderers.length, 2);

  const rawText = [
    "最近的逻辑是两层分工：",
    "```genui\nCard(\"工具调用的判定逻辑\", [\n  Diagram(\"flowchart TD\"),\n])\n```",
    "为什么这样分：\n- 开放权限只放一处。",
  ].join("\n\n");

  const snapshot = fromTimelineSnapshot({
    epoch: "ep-1",
    window: { minSeq: 0, maxSeq: 4, nextSeq: 5 },
    agent: { status: "idle", activeTurn: null },
    entries: [
      {
        provider: "claude",
        item: { type: "user_message", text: "解释一下最近的逻辑", messageId: "u1" },
        turnId: "t1",
        timestamp: "2026-11-21T05:50:00.000Z",
        seqStart: 1,
        seqEnd: 1,
      },
      {
        provider: "claude",
        item: { type: "reasoning", text: "Checking registry and config center..." },
        turnId: "t1",
        timestamp: "2026-11-21T05:50:01.000Z",
        seqStart: 2,
        seqEnd: 2,
      },
      {
        provider: "claude",
        item: {
          type: "tool_call",
          callId: "c1",
          name: "Bash",
          status: "completed",
          error: null,
          detail: { type: "shell", command: "git log -n 3" },
        },
        turnId: "t1",
        timestamp: "2026-11-21T05:50:02.000Z",
        seqStart: 3,
        seqEnd: 3,
      },
      {
        provider: "claude",
        item: { type: "assistant_message", text: rawText, messageId: "a1" },
        turnId: "t1",
        timestamp: "2026-11-21T05:50:05.000Z",
        seqStart: 4,
        seqEnd: 4,
      },
    ],
  });

  const transformed = applyTimelinePluginsToItems(snapshot.items, [evaluated]);
  const projected = projectTimelineRows(transformed, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: false,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });

  // Expected rows: user_message, turn_summary (1 thought + 1 command), and ALL 3 Gen-UI plugin rows in tail!
  assert.deepEqual(
    projected.map((r) => r.kind),
    ["user_message", "turn_summary", "plugin", "plugin", "plugin"],
  );

  const pluginRows = projected.filter((r) => r.kind === "plugin");
  assert.equal(pluginRows[0]?.item.itemKind, "gen-ui-prose");
  assert.equal(pluginRows[0]?.showActions, false);

  assert.equal(pluginRows[1]?.item.itemKind, "gen-ui-card");
  assert.equal(pluginRows[1]?.showActions, false);

  assert.equal(pluginRows[2]?.item.itemKind, "gen-ui-prose");
  assert.equal(pluginRows[2]?.showActions, true);
  assert.equal(pluginRows[2]?.actionText, rawText);

  await evaluated.cleanup();
  cleanedUp = true;
  assert.equal(cleanedUp, true);
  assert.equal(evaluated.timelineTransformers.length, 0);
  assert.equal(evaluated.timelineRenderers.length, 0);
});

test("streaming assistant_message passes phase='streaming' and suppresses action bar until turn completes", () => {
  const seenPhases: string[] = [];
  const mockPlugin = {
    id: "future-chart-plugin",
    timelineTransformers: [
      {
        id: "chart-transform",
        query: { itemType: "assistant_message" as const },
        transform({ item, phase }: { item: { type: string; text?: string }; phase: "streaming" | "complete" }) {
          seenPhases.push(phase);
          return {
            items: [
              {
                type: "plugin" as const,
                id: "chart-0",
                kind: "chart-block",
                version: 1,
                data: { raw: item.text ?? "", live: phase === "streaming" },
              },
            ],
          };
        },
      },
    ],
  };

  let state = createEmptyTimelineState();
  state = applyTimelineStreamEvent(state, {
    agentId: "ag-1",
    seq: 1,
    epoch: "ep-1",
    timestamp: "2026-11-21T06:00:00.000Z",
    event: { type: "turn_started", provider: "claude", turnId: "t1" },
  }).state;

  state = applyTimelineStreamEvent(state, {
    agentId: "ag-1",
    seq: 2,
    epoch: "ep-1",
    timestamp: "2026-11-21T06:00:01.000Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: { type: "assistant_message", text: "Chart([1, 2, 3])", messageId: "m1" },
    },
  }).state;

  const liveTransformed = applyTimelinePluginsToItems(state.items, [mockPlugin]);
  const liveRows = projectTimelineRows(liveTransformed, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: state.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.equal(liveRows[0]?.kind, "plugin");
  if (liveRows[0]?.kind === "plugin") {
    assert.equal(liveRows[0].showActions, false);
    assert.deepEqual(liveRows[0].item.data, { raw: "Chart([1, 2, 3])", live: true });
  }

  state = applyTimelineStreamEvent(state, {
    agentId: "ag-1",
    seq: 3,
    epoch: "ep-1",
    timestamp: "2026-11-21T06:00:02.000Z",
    event: { type: "turn_completed", provider: "claude", turnId: "t1" },
  }).state;

  const doneTransformed = applyTimelinePluginsToItems(state.items, [mockPlugin]);
  const doneRows = projectTimelineRows(doneTransformed, {
    chatDisplay: "collapseTurns",
    autoExpandReasoning: false,
    isTurnActive: state.isTurnActive,
    expandedGroupIds: new Set(),
    toggledItemIds: new Set(),
  });
  assert.equal(doneRows[0]?.kind, "plugin");
  if (doneRows[0]?.kind === "plugin") {
    assert.equal(doneRows[0].showActions, true);
    assert.equal(doneRows[0].actionText, "Chart([1, 2, 3])");
    assert.deepEqual(doneRows[0].item.data, { raw: "Chart([1, 2, 3])", live: false });
  }
  assert.deepEqual(seenPhases, ["streaming", "complete"]);
});

test("server-emitted plugin timeline items upsert cleanly by pluginId + id and faulty transformers fall back safely", () => {
  let state = createEmptyTimelineState();
  state = applyTimelineStreamEvent(state, {
    agentId: "ag-1",
    seq: 1,
    epoch: "ep-1",
    timestamp: "2026-11-21T06:01:00.000Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: {
        type: "plugin",
        pluginId: "deploy-preview",
        id: "card-1",
        kind: "preview-card",
        version: 1,
        data: { status: "building" },
      },
    },
  }).state;

  state = applyTimelineStreamEvent(state, {
    agentId: "ag-1",
    seq: 2,
    epoch: "ep-1",
    timestamp: "2026-11-21T06:01:05.000Z",
    event: {
      type: "timeline",
      provider: "claude",
      turnId: "t1",
      item: {
        type: "plugin",
        pluginId: "deploy-preview",
        id: "card-1",
        kind: "preview-card",
        version: 1,
        data: { status: "ready", url: "https://preview.example.com" },
      },
    },
  }).state;

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.kind, "plugin");
  if (state.items[0]?.kind === "plugin") {
    assert.deepEqual(state.items[0].data, {
      status: "ready",
      url: "https://preview.example.com",
    });
  }

  // Verify a throwing transformer never breaks timeline rendering
  const brokenPlugin = {
    id: "broken-plugin",
    timelineTransformers: [
      {
        id: "crash",
        query: { itemType: "assistant_message" as const },
        transform(): never {
          throw new Error("boom");
        },
      },
    ],
  };

  const snap = fromTimelineSnapshot({
    epoch: "ep-2",
    window: { minSeq: 1, maxSeq: 1, nextSeq: 2 },
    agent: { status: "idle", activeTurn: null },
    entries: [
      {
        provider: "claude",
        item: { type: "assistant_message", text: "Safe fallback markdown", messageId: "m2" },
        turnId: "t2",
        timestamp: "2026-11-21T06:02:00.000Z",
        seqStart: 1,
        seqEnd: 1,
      },
    ],
  });

  const out = applyTimelinePluginsToItems(snap.items, [brokenPlugin]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.kind, "assistant_message");
});
