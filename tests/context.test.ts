import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMainContextDigest,
  composeSidechatPrompt,
  deriveThreadTitle,
  formatTransferToMainPrompt,
  parseSidechatUserMessage,
} from "../shared/context";

test("composeSidechatPrompt and parseSidechatUserMessage round-trip cleanly", () => {
  const composed = composeSidechatPrompt({
    text: "Is there a race condition in this retry loop?",
    mainContext: "Main session: Refactor retry (claude/claude-sonnet-4-5)",
    quotedSelection: "while (attempts < 3) { await retry(); }",
  });

  const parsed = parseSidechatUserMessage(composed);
  assert.equal(parsed.body, "Is there a race condition in this retry loop?");
  assert.equal(parsed.mainContext, "Main session: Refactor retry (claude/claude-sonnet-4-5)");
  assert.equal(parsed.quotedSelection, "while (attempts < 3) { await retry(); }");
});

test("buildMainContextDigest summarizes recent turns and touched files", () => {
  const digest = buildMainContextDigest({
    agentId: "main-1",
    title: "Implement Sidechat",
    provider: "claude",
    model: "claude-sonnet-4-5",
    cwd: "/repo",
    status: "running",
    maxTurns: 4,
    entries: [
      {
        item: { type: "user_message", text: "Add sidechat support" },
      },
      {
        item: {
          type: "tool_call",
          callId: "tc1",
          name: "Edit",
          status: "completed",
          error: null,
          detail: { type: "edit", filePath: "client/sidechat-panel.tsx" },
        },
      },
      {
        item: { type: "assistant_message", text: "Updated the panel layout." },
      },
    ],
  });

  assert.equal(digest.turnCount, 1);
  assert.deepEqual(digest.touchedFiles, ["client/sidechat-panel.tsx"]);
  assert.match(digest.digest, /Implement Sidechat/);
  assert.match(digest.digest, /client\/sidechat-panel\.tsx/);
});

test("formatTransferToMainPrompt localizes Chinese and English handoffs", () => {
  const zhPrompt = formatTransferToMainPrompt({
    question: "为什么这里会死锁？",
    answer: "因为持锁顺序相反。",
    mode: "send",
    locale: "zh-CN",
  });
  assert.match(zhPrompt, /来自侧边聊天/);
  assert.match(zhPrompt, /因为持锁顺序相反/);

  assert.equal(deriveThreadTitle("   Explain   how   Paseo   plugins   work   "), "Explain how Paseo plugins work");
});
