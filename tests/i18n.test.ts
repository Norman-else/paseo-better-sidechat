import assert from "node:assert/strict";
import test from "node:test";
import { messages } from "../client/messages";
import { formatTransferToMainPrompt } from "../shared/context";
import { allLocaleResources, formatWorkSummaryLabel } from "../shared/messages";

const PASEO_SUPPORTED_LANGUAGES = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "es",
  "fr",
  "pt-BR",
  "ru",
  "ar",
] as const;

test("defineTranslations validates all Paseo built-in languages and placeholders", () => {
  for (const lang of PASEO_SUPPORTED_LANGUAGES) {
    assert.ok(lang in messages.resources, `Missing Paseo language resource: ${lang}`);
    assert.ok(lang in allLocaleResources, `Missing locale table: ${lang}`);
  }
});

test("formatWorkSummaryLabel and formatTransferToMainPrompt localize across Paseo languages", () => {
  const counts = {
    thoughtCount: 1,
    readFileCount: 2,
    editedFileCount: 0,
    commandCount: 1,
    searchCount: 0,
    otherToolCount: 0,
  };

  assert.match(formatWorkSummaryLabel(counts, "zh-CN"), /思考 1 次 · 读取 2 个文件 · 执行 1 条命令/);
  assert.match(formatWorkSummaryLabel(counts, "ja"), /思考 1回 · 2 件のファイルを読込/);
  assert.match(formatWorkSummaryLabel(counts, "ko"), /사고 1회 · 파일 2개 읽음/);
  assert.match(formatWorkSummaryLabel(counts, "en"), /Thought 1x · Read 2 files · Ran 1 command/);

  const jaTransfer = formatTransferToMainPrompt({
    question: "なぜ再レンダリングされる？",
    answer: "参照が毎回変わるためです。",
    mode: "send",
    locale: "ja",
  });
  assert.match(jaTransfer, /サイドチャットの結論/);
});
