import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiStarterGenerationPrompt,
  buildContextualStarterPrompts,
  computeMainStarterFingerprint,
  detectConversationLanguage,
  parseAiStarterResponse,
  type TimelineEntryLike,
} from "../shared/starters";

test("detectConversationLanguage detects Chinese conversation even with heavy English code and English Paseo UI locale", () => {
  const entries: TimelineEntryLike[] = [
    {
      item: {
        type: "user_message",
        id: "u1",
        text: "帮我看看 PSOS-6432 合并后的情况",
      },
    },
    {
      item: {
        type: "assistant_message",
        id: "a1",
        text: [
          "PSOS-6432 已经合并到 `origin/master`，环境变量 `CHAT_DELETED_CONVERSATION_RETENTION_DAYS` 默认是 30 天。",
          "```ts",
          "export const CHAT_DELETED_CONVERSATION_RETENTION_DAYS = Number(process.env.CHAT_DELETED_CONVERSATION_RETENTION_DAYS ?? 30);",
          "export function cleanupDeletedConversations(repo: ConversationRepository) { return repo.purgeExpired(); }",
          "```",
        ].join("\n"),
      },
    },
  ];

  const detected = detectConversationLanguage(entries, "en");
  assert.equal(detected.lang, "zh");
  assert.equal(detected.languageTag, "zh-CN");
});

test("detectConversationLanguage respects fallbackLocale when main session has no messages", () => {
  assert.deepEqual(detectConversationLanguage([], "en"), {
    lang: "en",
    languageTag: "en",
  });
  assert.deepEqual(detectConversationLanguage([], "zh-CN"), {
    lang: "zh",
    languageTag: "zh-CN",
  });
  assert.deepEqual(detectConversationLanguage([], "ja"), {
    lang: "ja",
    languageTag: "ja",
  });
});

test("buildContextualStarterPrompts generates 4 concrete Chinese follow-up questions from a realistic main session", () => {
  const entries: TimelineEntryLike[] = [
    {
      item: {
        type: "user_message",
        id: "u1",
        text: "同步一下进度",
      },
    },
    {
      item: {
        type: "assistant_message",
        id: "a1",
        text: [
          "PSOS-6432 (P2 后续 4 项) 合并了，PR #87 的 commit `23ee658` 在 `origin/master` 上，Jira 改成了 Done。",
          "清理已删除的会话：customer worker 每小时跑一次清理，保留期由 `CHAT_DELETED_CONVERSATION_RETENTION_DAYS` 控制，默认 30 天。契约 `chat/contracts/` 没改。",
          "我转给 PSOS-6431 的提示：",
          "- worker 因会话已删除而取消 run 时，没有改审批记录，这部分归它判断。",
          "- 三处可能冲突的文件位置。",
          "当前进度：epic 里 28 张 ticket，20 张 Done，在跑的只有 PSOS-6431。它刚才是 idle，很可能在等你回答“整条消息都做安全分类，还是把消息上限降到 2000 字”，请去它的 session 看一下。",
        ].join("\n"),
      },
    },
  ];

  // Even when Paseo's UI locale is English ("en"), follow-up starters match the Chinese main chat!
  const starters = buildContextualStarterPrompts({
    title: "Customer AI Chat Tickets Arrangement",
    status: "idle",
    entries,
    fallbackLocale: "en",
  });

  assert.equal(starters.length, 4);
  // 1. Captures the open design dilemma
  assert.ok(
    starters.some((s) => s.prompt.includes("整条消息都做安全分类，还是把消息上限降到 2000 字")),
    `Expected open dilemma starter, got: ${JSON.stringify(starters)}`,
  );
  // 2. Captures the numeric gap (28 - 20 = 8 remaining tickets!)
  assert.ok(
    starters.some((s) => s.title.includes("8") && s.title.includes("ticket")),
    `Expected remaining 8 tickets follow-up, got: ${JSON.stringify(starters)}`,
  );
  // 3. Captures unverified/conflict hint or PSOS ticket relationship
  assert.ok(
    starters.some(
      (s) =>
        s.title.includes("可能冲突") ||
        s.title.includes("PSOS-6431") ||
        s.title.includes("PSOS-6432"),
    ),
  );
});

test("buildContextualStarterPrompts generates concrete English follow-ups from errors and touched files", () => {
  const entries: TimelineEntryLike[] = [
    {
      item: {
        type: "user_message",
        id: "u1",
        text: "Run the payment webhook integration tests and fix any auth failure.",
      },
    },
    {
      item: {
        type: "tool_call",
        id: "tc1",
        name: "Edit",
        status: "completed",
        detail: {
          type: "edit",
          filePath: "src/webhooks/stripe-signature.ts",
        },
      },
    },
    {
      item: {
        type: "error",
        id: "err1",
        message: "WebhookSignatureMismatchError: timestamp tolerance exceeded 300s",
      },
    },
    {
      item: {
        type: "assistant_message",
        id: "a1",
        text: 'Updated `STRIPE_WEBHOOK_TOLERANCE_SEC` handling in `src/webhooks/stripe-signature.ts`. Let me know whether to reject replayed timestamps strictly or allow a clock-skew grace window.',
      },
    },
  ];

  const starters = buildContextualStarterPrompts({
    title: "Stripe Webhook Fix",
    status: "idle",
    entries,
    fallbackLocale: "en",
  });

  assert.equal(starters.length, 4);
  assert.ok(starters.some((s) => s.prompt.includes("reject replayed timestamps strictly or allow")));
  assert.ok(starters.some((s) => s.prompt.includes("WebhookSignatureMismatchError")));
});

test("parseAiStarterResponse parses raw JSON and fenced JSON blocks and normalizes icons", () => {
  const fenced = [
    "```json",
    JSON.stringify({
      starters: [
        {
          icon: "GitCompareArrows",
          title: "全量安全分类 vs 限 2000 字怎么选？",
          prompt: "对比全量安全分类与限制 2000 字在延迟、成本与用户体验上的优劣。",
        },
        {
          icon: "ListChecks",
          title: "另外还没做的 8 张 ticket 是什么？",
          prompt: "查一下 epic 里除了已完成 20 张之外，剩下 8 张未完成 ticket 的内容。",
        },
        {
          icon: "UnknownCustomIcon",
          title: "取消 run 不改审批记录会有副作用吗？",
          prompt: "核实 worker 因会话已删除而取消 run 时不改审批记录是否会导致状态不一致。",
        },
        {
          icon: "Workflow",
          title: "那三处可能冲突的文件具体在哪？",
          prompt: "列出 PSOS-6432 与 PSOS-6431 之间可能冲突的三处文件位置及原因。",
        },
      ],
    }),
    "```",
  ].join("\n");

  const parsed = parseAiStarterResponse(fenced);
  assert.ok(parsed);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].icon, "GitCompareArrows");
  assert.equal(parsed[1].title, "另外还没做的 8 张 ticket 是什么？");
  // Unknown icon safely falls back to a valid Lucide starter icon
  assert.equal(parsed[2].icon, "ShieldAlert");
  assert.equal(parseAiStarterResponse("not json at all"), null);
});

test("computeMainStarterFingerprint stays stable across streaming tokens while running and updates once settled", () => {
  const baseUser = {
    item: { type: "user_message" as const, id: "u1", text: "分析当前架构" },
  };
  const streamStep1: TimelineEntryLike[] = [
    baseUser,
    {
      item: {
        type: "assistant_message",
        id: "a1",
        text: "这是一段超过六十个字符的开头内容，用来测试流式输出过程中指纹不会因为尾部新增字符而频繁抖动变化……第一部分内容已经稳定输出完毕，后面还在继续追加流式文本 AAAA",
      },
    },
  ];
  const streamStep2: TimelineEntryLike[] = [
    baseUser,
    {
      item: {
        type: "assistant_message",
        id: "a1",
        text: "这是一段超过六十个字符的开头内容，用来测试流式输出过程中指纹不会因为尾部新增字符而频繁抖动变化……第一部分内容已经稳定输出完毕，后面还在继续追加流式文本 BBBBBBBBBBBB",
      },
    },
  ];

  const runningFp1 = computeMainStarterFingerprint("agent-1", "running", streamStep1);
  const runningFp2 = computeMainStarterFingerprint("agent-1", "running", streamStep2);
  assert.equal(runningFp1, runningFp2);

  const idleFp1 = computeMainStarterFingerprint("agent-1", "idle", streamStep1);
  const idleFp2 = computeMainStarterFingerprint("agent-1", "idle", streamStep2);
  assert.notEqual(idleFp1, idleFp2);

  const prompt = buildAiStarterGenerationPrompt({
    digest: "Main session: Test",
    languageTag: "zh-CN",
  });
  assert.ok(prompt.includes("Simplified Chinese"));
});
