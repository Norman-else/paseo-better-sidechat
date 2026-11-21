import assert from "node:assert/strict";
import test from "node:test";
import { parseHostAppearanceSettings } from "../shared/appearance";
import {
  clearThreadQueue,
  deriveQueuedMessageLabel,
  enqueueThreadMessage,
  prependThreadMessage,
  removeThreadMessageById,
  resolveActiveSendBehavior,
  resolveAlternateSendAction,
  resolveSubmitAction,
  type QueuedSidechatMessage,
} from "../shared/queue";

function makeQueued(id: string, text: string): QueuedSidechatMessage {
  return {
    id,
    text,
    attachments: [],
    quotedSelection: null,
    attachMainContext: false,
  };
}

test("parseHostAppearanceSettings + resolveActiveSendBehavior match Paseo queue & permission behavior", () => {
  const queuePrefs = parseHostAppearanceSettings({ sendBehavior: "queue" });
  assert.equal(queuePrefs.sendBehavior, "queue");
  assert.equal(resolveActiveSendBehavior(queuePrefs.sendBehavior, false), "queue");
  assert.equal(resolveActiveSendBehavior(queuePrefs.sendBehavior, true), "interrupt");

  const steerPrefs = parseHostAppearanceSettings({ sendBehavior: "steer" });
  assert.equal(resolveActiveSendBehavior(steerPrefs.sendBehavior, true), "steer");

  const interruptPrefs = parseHostAppearanceSettings({ sendBehavior: "interrupt" });
  assert.equal(resolveActiveSendBehavior(interruptPrefs.sendBehavior, false), "interrupt");
});

test("resolveSubmitAction & resolveAlternateSendAction match Paseo Send vs Queue semantics", () => {
  // Idle agent always sends directly regardless of queue/steer/interrupt setting
  assert.deepEqual(
    resolveSubmitAction({
      hasSendableContent: true,
      isAgentRunning: false,
      defaultSendBehavior: "queue",
      canQueue: true,
    }),
    { kind: "send" },
  );

  // Running agent in queue mode -> default queues, alternate (Cmd+Enter / long press) interrupts immediately
  assert.deepEqual(
    resolveSubmitAction({
      hasSendableContent: true,
      isAgentRunning: true,
      defaultSendBehavior: "queue",
      canQueue: true,
    }),
    { kind: "queue" },
  );
  assert.deepEqual(
    resolveSubmitAction({
      hasSendableContent: true,
      isAgentRunning: true,
      defaultSendBehavior: "queue",
      canQueue: true,
      alternate: true,
    }),
    { kind: "send", activeTurnBehavior: "interrupt" },
  );
  assert.equal(
    resolveAlternateSendAction({
      defaultSendBehavior: "queue",
      isAgentRunning: true,
      canQueue: true,
    }),
    "send",
  );

  // Running agent in steer mode -> default steers, alternate queues
  assert.deepEqual(
    resolveSubmitAction({
      hasSendableContent: true,
      isAgentRunning: true,
      defaultSendBehavior: "steer",
      canQueue: true,
    }),
    { kind: "send", activeTurnBehavior: "steer" },
  );
  assert.deepEqual(
    resolveSubmitAction({
      hasSendableContent: true,
      isAgentRunning: true,
      defaultSendBehavior: "steer",
      canQueue: true,
      alternate: true,
    }),
    { kind: "queue" },
  );
  assert.equal(
    resolveAlternateSendAction({
      defaultSendBehavior: "steer",
      isAgentRunning: true,
      canQueue: true,
    }),
    "queue",
  );
});

test("per-thread queue helpers enqueue, edit/remove, prepend rollback, and clear cleanly", () => {
  let map = new Map<string, QueuedSidechatMessage[]>();
  const m1 = makeQueued("m1", "First follow-up");
  const m2 = makeQueued("m2", "Second follow-up");

  map = enqueueThreadMessage(map, "thread-a", m1);
  map = enqueueThreadMessage(map, "thread-a", m2);
  map = enqueueThreadMessage(map, "thread-b", makeQueued("m3", "Other thread"));

  assert.equal(map.get("thread-a")?.length, 2);
  assert.equal(deriveQueuedMessageLabel(m1), "First follow-up");

  // Edit / remove first item
  const popped = removeThreadMessageById(map, "thread-a", "m1");
  map = popped.next;
  assert.equal(popped.removed?.id, "m1");
  assert.deepEqual(
    map.get("thread-a")?.map((x) => x.id),
    ["m2"],
  );

  // Rollback prepend restores item to head without duplicating
  map = prependThreadMessage(map, "thread-a", m1);
  map = prependThreadMessage(map, "thread-a", m1);
  assert.deepEqual(
    map.get("thread-a")?.map((x) => x.id),
    ["m1", "m2"],
  );

  map = clearThreadQueue(map, "thread-a");
  assert.equal(map.has("thread-a"), false);
  assert.equal(map.get("thread-b")?.length, 1);
});
