import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { z } from "zod";
import { resolveLocaleTable } from "./messages";

export const STARTER_ICON_NAMES = [
  "HelpCircle",
  "GitCompareArrows",
  "ListChecks",
  "ShieldAlert",
  "Workflow",
  "BookOpen",
  "Bug",
  "Search",
  "Sparkles",
] as const;

export type StarterIconName = (typeof STARTER_ICON_NAMES)[number];

export const starterPromptItemSchema = z.object({
  id: z.string().min(1),
  icon: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
});

export type StarterPromptItem = z.infer<typeof starterPromptItemSchema>;

export type DetectedConversationLang = "zh" | "ja" | "ko" | "en" | "other";

export interface TimelineEntryLike {
  item: AgentTimelineItem;
  turnId?: string;
  timestamp?: string;
}

const VALID_ICON_SET = new Set<string>(STARTER_ICON_NAMES);

function normalizeIcon(icon: string | undefined, fallback: StarterIconName): StarterIconName {
  if (icon && VALID_ICON_SET.has(icon)) {
    return icon as StarterIconName;
  }
  return fallback;
}

function stripInjectedAndCode(raw: string): string {
  return raw
    .replace(/<sidechat_context>[\s\S]*?<\/sidechat_context>\s*/g, " ")
    .replace(/<quoted_selection>[\s\S]*?<\/quoted_selection>\s*/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

function stripInjectedOnly(raw: string): string {
  return raw
    .replace(/<sidechat_context>[\s\S]*?<\/sidechat_context>\s*/g, "")
    .replace(/<quoted_selection>[\s\S]*?<\/quoted_selection>\s*/g, "")
    .trim();
}

function compactText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return filePath;
  if (parts.length >= 2 && filePath.endsWith("/")) {
    return `${parts.slice(-2).join("/")}/`;
  }
  return parts.at(-1) ?? filePath;
}

/**
 * Detects the dominant natural language of the main conversation (ignoring code blocks,
 * inline backticked identifiers, and URLs so English code inside a Chinese/Japanese/Korean
 * conversation never skews the result). Falls back to `fallbackLocale` when empty.
 */
export function detectConversationLanguage(
  entries: ReadonlyArray<TimelineEntryLike>,
  fallbackLocale = "en",
): { lang: DetectedConversationLang; languageTag: string } {
  const proseChunks: string[] = [];
  for (let i = entries.length - 1; i >= 0 && proseChunks.length < 16; i--) {
    const item = entries[i]?.item;
    if (!item) continue;
    if (item.type === "user_message" || item.type === "assistant_message") {
      const stripped = stripInjectedAndCode(item.text).trim();
      if (stripped) proseChunks.push(stripped);
    }
  }

  const sample = proseChunks.join("\n");
  if (sample.length >= 4) {
    let han = 0;
    let kana = 0;
    let hangul = 0;
    let latin = 0;
    let cyrillic = 0;
    let arabic = 0;

    for (const ch of sample) {
      const code = ch.codePointAt(0) ?? 0;
      if (
        (code >= 0x3040 && code <= 0x309f) ||
        (code >= 0x30a0 && code <= 0x30ff)
      ) {
        kana++;
      } else if (code >= 0xac00 && code <= 0xd7af) {
        hangul++;
      } else if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf)
      ) {
        han++;
      } else if (
        (code >= 0x0041 && code <= 0x005a) ||
        (code >= 0x0061 && code <= 0x007a)
      ) {
        latin++;
      } else if (code >= 0x0400 && code <= 0x04ff) {
        cyrillic++;
      } else if (code >= 0x0600 && code <= 0x06ff) {
        arabic++;
      }
    }

    if (kana >= 4 && kana * 3 >= han) {
      return { lang: "ja", languageTag: "ja" };
    }
    if (hangul >= 6) {
      return { lang: "ko", languageTag: "ko" };
    }
    if (han >= 6 && han * 3 >= latin) {
      return { lang: "zh", languageTag: "zh-CN" };
    }
    if (cyrillic >= 12 && cyrillic > latin) {
      return { lang: "other", languageTag: "ru" };
    }
    if (arabic >= 12 && arabic > latin) {
      return { lang: "other", languageTag: "ar" };
    }
    if (latin >= 16 && han < 4) {
      return { lang: "en", languageTag: "en" };
    }
  }

  const lower = (fallbackLocale || "en").toLowerCase();
  if (lower.startsWith("zh")) return { lang: "zh", languageTag: "zh-CN" };
  if (lower.startsWith("ja")) return { lang: "ja", languageTag: "ja" };
  if (lower.startsWith("ko")) return { lang: "ko", languageTag: "ko" };
  if (lower.startsWith("en")) return { lang: "en", languageTag: "en" };
  return { lang: "other", languageTag: fallbackLocale || "en" };
}

export function buildDefaultStarterPrompts(locale: string): StarterPromptItem[] {
  const table = resolveLocaleTable(locale);
  return [
    {
      id: "default-explain",
      icon: "BookOpen",
      title: table.starterExplainTitle,
      prompt: table.starterExplainPrompt,
    },
    {
      id: "default-edge",
      icon: "ShieldAlert",
      title: table.starterEdgeCasesTitle,
      prompt: table.starterEdgeCasesPrompt,
    },
    {
      id: "default-compare",
      icon: "GitCompareArrows",
      title: table.starterCompareTitle,
      prompt: table.starterComparePrompt,
    },
    {
      id: "default-trace",
      icon: "Workflow",
      title: table.starterTraceTitle,
      prompt: table.starterTracePrompt,
    },
  ];
}

interface ExtractedSignals {
  hasConversation: boolean;
  openDilemma: string | null;
  remainingCountGap: { total: number; done: number; remaining: number; unit: string } | null;
  pendingTodos: string[];
  unresolvedHint: string | null;
  latestError: string | null;
  issueRefs: string[];
  prRefs: string[];
  touchedFiles: string[];
  codeSymbols: string[];
  latestAssistantSummary: string;
  latestUserQuestion: string;
}

function extractConversationSignals(
  entries: ReadonlyArray<TimelineEntryLike>,
  title?: string | null,
): ExtractedSignals {
  let hasConversation = false;
  const assistantMessages: string[] = [];
  const userMessages: string[] = [];
  const touchedFiles: string[] = [];
  const seenFiles = new Set<string>();
  const pendingTodos: string[] = [];
  let latestError: string | null = null;

  const addFile = (path: string | undefined) => {
    const clean = path?.trim();
    if (!clean || seenFiles.has(clean)) return;
    seenFiles.add(clean);
    if (touchedFiles.length < 8) touchedFiles.push(clean);
  };

  for (const entry of entries) {
    const { item } = entry;
    if (item.type === "user_message") {
      const text = stripInjectedOnly(item.text);
      if (text) {
        hasConversation = true;
        userMessages.push(text);
      }
    } else if (item.type === "assistant_message") {
      const text = item.text.trim();
      if (text) {
        hasConversation = true;
        assistantMessages.push(text);
      }
    } else if (item.type === "tool_call") {
      const detail = item.detail;
      if (detail.type === "edit" || detail.type === "write" || detail.type === "read") {
        addFile(detail.filePath);
      }
      if (item.status === "failed" && item.error) {
        const msg =
          typeof item.error === "string"
            ? item.error
            : typeof item.error === "object" && "message" in item.error
              ? String((item.error as { message?: unknown }).message ?? "")
              : "";
        if (msg.trim()) latestError = compactText(msg, 120);
      }
    } else if (item.type === "error" && item.message.trim()) {
      latestError = compactText(item.message, 120);
    } else if (item.type === "todo" && Array.isArray(item.items)) {
      pendingTodos.length = 0;
      for (const todo of item.items) {
        if (!todo.completed && todo.text.trim() && pendingTodos.length < 4) {
          pendingTodos.push(compactText(todo.text, 60));
        }
      }
    }
  }

  const recentAssistantText = assistantMessages.slice(-3).join("\n");
  const recentCombined = [title ?? "", ...userMessages.slice(-2), ...assistantMessages.slice(-3)]
    .filter(Boolean)
    .join("\n");

  // 1. Open dilemma / choice ("“A还是B”", "「A还是B」", "whether to A or B", trailing question)
  let openDilemma: string | null = null;
  const zhQuotedChoice =
    /[“「『"]([^”」』"\n]{4,48}?还是[^”」』"\n]{2,48}?)[”」』"]/.exec(recentAssistantText) ??
    /(?:等你回答|待确认|需要确认|取决于|选择)[：:\s]*([^\n。；;]{6,60}?还是[^\n。？?；;]{2,40})/.exec(
      recentAssistantText,
    );
  if (zhQuotedChoice?.[1]) {
    openDilemma = compactText(zhQuotedChoice[1], 56);
  } else {
    const enChoice =
      /\bwhether to ([^.!?\n]{8,80}\bor\b[^.!?\n]{3,60})/i.exec(recentAssistantText) ??
      /[""]([^""\n]{8,80}\bor\b[^""\n]{4,60})[""]/.exec(recentAssistantText);
    if (enChoice?.[1]) {
      openDilemma = compactText(enChoice[1], 68);
    } else {
      const lines = (assistantMessages.at(-1) ?? "")
        .split(/\n+/)
        .map((l) => l.replace(/^[-*>\d.)\s]+/, "").trim())
        .filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if ((line.endsWith("？") || line.endsWith("?")) && line.length >= 6 && line.length <= 72) {
          openDilemma = line;
          break;
        }
      }
    }
  }

  // 2. Numeric progress gap ("28 张 ticket，20 张 Done" / "28 tickets, 20 Done")
  let remainingCountGap: ExtractedSignals["remainingCountGap"] = null;
  const zhGapMatch =
    /(\d+)\s*(?:张|个|项|条)\s*([A-Za-z\u4e00-\u9fa5]{1,12})[，,\s]+(\d+)\s*(?:张|个|项|条)?\s*(?:已?(?:完成|做完|合并)|Done)/i.exec(
      recentAssistantText,
    );
  if (zhGapMatch) {
    const total = Number(zhGapMatch[1]);
    const done = Number(zhGapMatch[3]);
    if (total > done && total - done <= 100) {
      remainingCountGap = {
        total,
        done,
        remaining: total - done,
        unit: zhGapMatch[2] || "项",
      };
    }
  } else {
    const enGapMatch =
      /(\d+)\s+(tickets?|tasks?|items?|issues?)[,\s]+(\d+)\s+(?:done|completed|finished|merged)/i.exec(
        recentAssistantText,
      );
    if (enGapMatch) {
      const total = Number(enGapMatch[1]);
      const done = Number(enGapMatch[3]);
      if (total > done && total - done <= 100) {
        remainingCountGap = {
          total,
          done,
          remaining: total - done,
          unit: enGapMatch[2],
        };
      }
    }
  }

  // 3. Unverified / conflict / follow-up hint lines in latest assistant message
  let unresolvedHint: string | null = null;
  const hintRegex =
    /(?:还没核实|尚未核实|待确认|可能冲突|三处可能冲突|需要注意|潜在风险|not yet verified|unverified|potential conflict|needs confirmation)[^\n。；]{0,48}/i;
  const hintMatch = hintRegex.exec(recentAssistantText);
  if (hintMatch?.[0]) {
    unresolvedHint = compactText(hintMatch[0], 54);
  }

  // 4. Issue / Jira keys (e.g. PSOS-6431, ENG-123) & PR refs (PR #87, #87)
  const issueRefs: string[] = [];
  const seenIssues = new Set<string>();
  for (const m of recentCombined.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g)) {
    const key = m[1];
    if (
      key.startsWith("UTF-") ||
      key.startsWith("SHA-") ||
      key.startsWith("ISO-") ||
      key.startsWith("CVE-") ||
      seenIssues.has(key)
    ) {
      continue;
    }
    seenIssues.add(key);
    if (issueRefs.length < 4) issueRefs.push(key);
  }

  const prRefs: string[] = [];
  const seenPrs = new Set<string>();
  for (const m of recentCombined.matchAll(/\b(?:PR|MR)\s*#(\d{1,6})\b/gi)) {
    const label = `PR #${m[1]}`;
    if (!seenPrs.has(label) && prRefs.length < 3) {
      seenPrs.add(label);
      prRefs.push(label);
    }
  }

  // 5. Backticked code symbols / config names / paths from recent assistant messages
  const codeSymbols: string[] = [];
  const seenSymbols = new Set<string>();
  for (const m of recentAssistantText.matchAll(/`([^`\n]{3,48})`/g)) {
    const sym = m[1].trim();
    if (
      !sym ||
      sym.includes(" ") ||
      /^(true|false|null|undefined|master|main|origin\/master|origin\/main|done|idle)$/i.test(sym)
    ) {
      continue;
    }
    if (sym.includes("/") && /\.[a-z0-9]{1,5}$/i.test(sym)) {
      addFile(sym);
      continue;
    }
    if (sym.endsWith("/") && sym.length >= 4) {
      addFile(sym);
      continue;
    }
    if (!seenSymbols.has(sym) && codeSymbols.length < 5) {
      seenSymbols.add(sym);
      codeSymbols.push(sym);
    }
  }

  return {
    hasConversation,
    openDilemma,
    remainingCountGap,
    pendingTodos,
    unresolvedHint,
    latestError,
    issueRefs,
    prRefs,
    touchedFiles,
    codeSymbols,
    latestAssistantSummary: compactText(
      stripInjectedAndCode(assistantMessages.at(-1) ?? ""),
      110,
    ),
    latestUserQuestion: compactText(stripInjectedAndCode(userMessages.at(-1) ?? ""), 80),
  };
}

/**
 * Tier 1 (`< 2ms`): Deterministically extracts 4 natural follow-up questions grounded in the
 * main agent's actual conversation, open dilemmas, tickets/PRs, touched files, and symbols.
 */
export function buildContextualStarterPrompts(input: {
  title?: string | null;
  status?: string | null;
  entries: ReadonlyArray<TimelineEntryLike>;
  fallbackLocale?: string;
}): StarterPromptItem[] {
  const signals = extractConversationSignals(input.entries, input.title);
  if (!signals.hasConversation) {
    return buildDefaultStarterPrompts(input.fallbackLocale ?? "en");
  }

  const { lang, languageTag } = detectConversationLanguage(
    input.entries,
    input.fallbackLocale ?? "en",
  );

  const candidates: StarterPromptItem[] = [];
  const pushUnique = (icon: StarterIconName, title: string, prompt: string) => {
    const cleanTitle = compactText(title, lang === "zh" || lang === "ja" || lang === "ko" ? 26 : 54);
    const cleanPrompt = prompt.trim();
    if (!cleanTitle || !cleanPrompt) return;
    if (candidates.some((c) => c.title === cleanTitle)) return;
    candidates.push({
      id: `ctx-${candidates.length + 1}`,
      icon,
      title: cleanTitle,
      prompt: cleanPrompt,
    });
  };

  const primaryFile = signals.touchedFiles[0] ? baseName(signals.touchedFiles[0]) : null;
  const secondaryFile = signals.touchedFiles[1] ? baseName(signals.touchedFiles[1]) : null;
  const primarySym = signals.codeSymbols[0] ?? null;
  const primaryIssue = signals.issueRefs[0] ?? null;
  const secondaryIssue = signals.issueRefs[1] ?? null;
  const primaryPr = signals.prRefs[0] ?? null;

  if (lang === "zh") {
    if (signals.openDilemma) {
      const shortDilemma = compactText(signals.openDilemma.replace(/[？?]$/, ""), 18);
      pushUnique(
        "GitCompareArrows",
        `${shortDilemma}，怎么选更合适？`,
        `主会话里提到了「${signals.openDilemma}」，请结合当前代码和业务场景对比各方案的优缺点、边界风险与实现成本，给我一个明确建议。`,
      );
    }

    if (signals.remainingCountGap) {
      const { remaining, unit, total, done } = signals.remainingCountGap;
      pushUnique(
        "ListChecks",
        `另外还没做的 ${remaining} 个 ${unit} 是做什么的？`,
        `主会话提到一共 ${total} 个 ${unit}、已完成 ${done} 个。请帮我查清楚剩下还没做的 ${remaining} 个分别是什么、当前状态和优先级如何。`,
      );
    } else if (signals.pendingTodos.length > 0) {
      pushUnique(
        "ListChecks",
        `待完成的「${compactText(signals.pendingTodos[0], 12)}」具体要做什么？`,
        `结合主会话上下文，帮我梳理尚未完成的待办项（尤其是「${signals.pendingTodos[0]}」）具体涉及哪些改动和依赖。`,
      );
    }

    if (signals.latestError) {
      pushUnique(
        "Bug",
        "刚才那个报错的根因是什么？",
        `主会话中出现了报错：「${signals.latestError}」。请帮我定位它的根本原因，并看看当前修复是否彻底覆盖了同类情况。`,
      );
    }

    if (signals.unresolvedHint) {
      pushUnique(
        "ShieldAlert",
        `核实一下「${compactText(signals.unresolvedHint, 14)}」`,
        `主会话里提到「${signals.unresolvedHint}」，请帮我在代码库和配置中独立核实一下具体情况，看看有没有潜在坑点。`,
      );
    }

    if (secondaryIssue && primaryIssue) {
      pushUnique(
        "HelpCircle",
        `${secondaryIssue} 和 ${primaryIssue} 之间有什么关联或冲突？`,
        `结合主会话内容，帮我梳理 ${primaryIssue} 与 ${secondaryIssue} 各自负责的改动范围、依赖关系以及合并/上线时需要注意的地方。`,
      );
    } else if (primaryIssue) {
      pushUnique(
        "HelpCircle",
        `${primaryIssue} 还有哪些细节或风险要注意？`,
        `针对主会话讨论的 ${primaryIssue}${primaryPr ? `（${primaryPr}）` : ""}，帮我检查一下它的改动是否还有遗漏的边界情况、兼容性问题或待确认点。`,
      );
    }

    if (primarySym) {
      pushUnique(
        "Search",
        `${compactText(primarySym, 18)} 具体是怎么生效的？`,
        `主会话提到了 \`${primarySym}\`，请帮我追踪它在代码里的定义、读写链路以及默认值/边界条件下的行为。`,
      );
    }

    if (primaryFile) {
      const filePair = secondaryFile ? `${primaryFile} 与 ${secondaryFile}` : primaryFile;
      pushUnique(
        "ShieldAlert",
        `检查 ${compactText(filePair, 18)} 的边界与副作用`,
        `围绕主会话涉及的 ${filePair}，帮我排查改动后是否会影响现有调用方、异常分支或并发状态。`,
      );
      pushUnique(
        "Workflow",
        `梳理 ${compactText(primaryFile, 18)} 相关的调用链`,
        `结合主会话上下文，帮我用清晰的结构梳理 ${primaryFile} 相关的核心调用流程与数据流转。`,
      );
    }

    // Fill up to 4 contextual Chinese follow-ups if needed
    const topicRef =
      primaryPr ||
      primaryIssue ||
      primarySym ||
      primaryFile ||
      (input.title ? compactText(input.title, 16) : "当前主会话方案");
    pushUnique(
      "ShieldAlert",
      `${compactText(topicRef, 14)} 有没有潜在边界或漏掉的情况？`,
      `基于主会话当前的结论与实现（${topicRef}），帮我挑刺检查一下有没有遗漏的边界条件、异常分支或上线风险。`,
    );
    pushUnique(
      "GitCompareArrows",
      "当前做法有没有更简洁稳妥的替代方案？",
      "结合主会话刚刚讨论的设计与改动，评估一下是否有更简单、耦合更低的实现方式，并对比各自取舍。",
    );
    pushUnique(
      "BookOpen",
      "用通俗直观的方式帮我总结当前进展与待定项",
      "基于主会话最近的内容，帮我精炼总结：1）已经确定/完成了什么；2）还剩哪些未决问题或待核实项；3）下一步最关键的动作是什么。",
    );
    pushUnique(
      "Workflow",
      "这轮改动会影响哪些上下游模块？",
      "结合主会话中的改动内容和当前代码库，帮我分析受影响的上下游调用方、配置项以及需要重点回归验证的场景。",
    );

    return candidates.slice(0, 4);
  }

  if (lang === "ja") {
    if (signals.openDilemma) {
      pushUnique(
        "GitCompareArrows",
        `「${compactText(signals.openDilemma, 16)}」はどう選ぶべき？`,
        `メインセッションで言及された「${signals.openDilemma}」について、各案のメリット・デメリットとリスクを比較して推奨案を教えてください。`,
      );
    }
    if (signals.remainingCountGap) {
      pushUnique(
        "ListChecks",
        `残りの ${signals.remainingCountGap.remaining} 件は何が残っている？`,
        `メインセッションの進捗（全 ${signals.remainingCountGap.total} 件中 ${signals.remainingCountGap.done} 件完了）について、未完了の ${signals.remainingCountGap.remaining} 件の内容と優先度を整理してください。`,
      );
    }
    if (signals.latestError) {
      pushUnique(
        "Bug",
        "発生したエラーの根本原因と影響範囲は？",
        `メインセッションのエラー「${signals.latestError}」の根本原因と、他にも同様の箇所がないか確認してください。`,
      );
    }
    if (primaryFile || primarySym) {
      const target = primarySym ? `\`${primarySym}\`` : primaryFile!;
      pushUnique(
        "ShieldAlert",
        `${compactText(primarySym || primaryFile!, 18)} のエッジケースを確認`,
        `メインセッションで扱っている ${target} について、見落としやすいエッジケースや副作用がないか点検してください。`,
      );
    }
    for (const fallback of buildDefaultStarterPrompts("ja")) {
      pushUnique(fallback.icon as StarterIconName, fallback.title, fallback.prompt);
    }
    return candidates.slice(0, 4);
  }

  if (lang === "ko") {
    if (signals.openDilemma) {
      pushUnique(
        "GitCompareArrows",
        `'${compactText(signals.openDilemma, 18)}' 어떤 선택이 더 나을까?`,
        `메인 세션에서 언급된 '${signals.openDilemma}'에 대해 각 방안의 장단점과 리스크를 비교하고 추천안을 알려주세요.`,
      );
    }
    if (signals.remainingCountGap) {
      pushUnique(
        "ListChecks",
        `아직 남은 ${signals.remainingCountGap.remaining}개 항목은 무엇인가요?`,
        `메인 세션에서 전체 ${signals.remainingCountGap.total}개 중 ${signals.remainingCountGap.done}개가 완료되었다고 했는데, 남은 ${signals.remainingCountGap.remaining}개의 구체적인 내용과 우선순위를 확인해 주세요.`,
      );
    }
    if (signals.latestError) {
      pushUnique(
        "Bug",
        "방금 발생한 오류의 근본 원인은 무엇인가요?",
        `메인 세션에서 발생한 오류('${signals.latestError}')의 원인과 다른 곳에도 같은 문제가 있는지 확인해 주세요.`,
      );
    }
    if (primaryFile || primarySym) {
      const target = primarySym ? `\`${primarySym}\`` : primaryFile!;
      pushUnique(
        "ShieldAlert",
        `${compactText(primarySym || primaryFile!, 18)} 관련 엣지 케이스 점검`,
        `메인 세션에서 다룬 ${target} 변경이 기존 호출부나 예외 흐름에 부작용을 주지 않는지 점검해 주세요.`,
      );
    }
    for (const fallback of buildDefaultStarterPrompts("ko")) {
      pushUnique(fallback.icon as StarterIconName, fallback.title, fallback.prompt);
    }
    return candidates.slice(0, 4);
  }

  // English & other Latin locales
  if (signals.openDilemma) {
    pushUnique(
      "GitCompareArrows",
      `How should we decide: ${compactText(signals.openDilemma, 34)}?`,
      `The main session raised "${signals.openDilemma}". Compare the trade-offs, risks, and implementation effort of each option and recommend the best path.`,
    );
  }

  if (signals.remainingCountGap) {
    const { remaining, unit, total, done } = signals.remainingCountGap;
    pushUnique(
      "ListChecks",
      `What are the remaining ${remaining} ${unit}?`,
      `The main session noted ${done} of ${total} ${unit} are done. Break down what the remaining ${remaining} ${unit} cover and their current status.`,
    );
  } else if (signals.pendingTodos.length > 0) {
    pushUnique(
      "ListChecks",
      `What's involved in "${compactText(signals.pendingTodos[0], 28)}"?`,
      `Based on the main session, unpack what remains to be done for "${signals.pendingTodos[0]}" and any blockers around it.`,
    );
  }

  if (signals.latestError) {
    pushUnique(
      "Bug",
      "What caused that error and could it recur?",
      `Unpack the root cause of "${signals.latestError}" from the main session and check whether similar code paths are affected.`,
    );
  }

  if (signals.unresolvedHint) {
    pushUnique(
      "ShieldAlert",
      `Verify: ${compactText(signals.unresolvedHint, 38)}`,
      `The main session mentioned "${signals.unresolvedHint}". Independently inspect the codebase to verify what actually happens here.`,
    );
  }

  if (primaryIssue) {
    pushUnique(
      "HelpCircle",
      `Any hidden risks or open items in ${primaryIssue}?`,
      `Review what the main session covered for ${primaryIssue}${primaryPr ? ` (${primaryPr})` : ""} and check for edge cases, conflicts, or unverified assumptions.`,
    );
  }

  if (primarySym) {
    pushUnique(
      "Search",
      `How does ${compactText(primarySym, 28)} work end-to-end?`,
      `Trace where \`${primarySym}\` is defined, read, and enforced in the codebase, including its defaults and edge cases.`,
    );
  }

  if (primaryFile) {
    const label = secondaryFile ? `${primaryFile} & ${secondaryFile}` : primaryFile;
    pushUnique(
      "ShieldAlert",
      `Any edge cases in ${compactText(label, 30)}?`,
      `Check the recent logic around ${label} discussed in the main session for subtle regressions, race conditions, or downstream impact.`,
    );
  }

  for (const fallback of buildDefaultStarterPrompts(languageTag)) {
    pushUnique(fallback.icon as StarterIconName, fallback.title, fallback.prompt);
  }

  return candidates.slice(0, 4);
}

/**
 * Computes a stable fingerprint for caching AI-generated follow-up prompts on a main session.
 * Ignores mid-stream deltas until message count or settled tail text changes.
 */
export function computeMainStarterFingerprint(
  agentId: string,
  status: string | undefined,
  entries: ReadonlyArray<TimelineEntryLike>,
): string {
  let userCount = 0;
  let assistantCount = 0;
  let lastUser = "";
  let lastAssistant = "";

  for (const entry of entries) {
    const { item } = entry;
    if (item.type === "user_message") {
      userCount++;
      lastUser = item.text.slice(-120);
    } else if (item.type === "assistant_message") {
      assistantCount++;
      lastAssistant = item.text.slice(-160);
    }
  }

  // While the main agent is actively streaming a turn, anchor on completed message counts + first
  // 80 chars so we don't thrash cache keys on every token; once idle, include the settled tail.
  const tailKey =
    status === "running"
      ? `${lastUser.slice(0, 60)}|${lastAssistant.slice(0, 60)}`
      : `${lastUser}|${lastAssistant}`;

  let hash = 2166136261;
  for (let i = 0; i < tailKey.length; i++) {
    hash ^= tailKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `${agentId}:u${userCount}:a${assistantCount}:${(hash >>> 0).toString(36)}`;
}

export const STARTER_GENERATOR_SYSTEM_PROMPT = [
  "You generate contextual follow-up starter questions for a developer's Sidechat panel.",
  "CRITICAL RULES:",
  "- DO NOT call any tools, shell commands, MCP servers, or file reads. Work strictly from the conversation digest in the user message.",
  "- Output ONLY a single valid JSON object matching the requested schema, with no markdown prose before or after.",
].join("\n");

export function buildAiStarterGenerationPrompt(input: {
  digest: string;
  languageTag: string;
}): string {
  const langInstruction =
    input.languageTag.startsWith("zh")
      ? "Simplified Chinese (简体中文) — keep technical identifiers, ticket IDs, and file names intact"
      : input.languageTag.startsWith("ja")
        ? "Japanese (日本語) — keep technical identifiers, ticket IDs, and file names intact"
        : input.languageTag.startsWith("ko")
          ? "Korean (한국어) — keep technical identifiers, ticket IDs, and file names intact"
          : `the exact same natural language used in the main session (${input.languageTag})`;

  return [
    "Read the developer's active main coding session below and generate 4 sharp, natural FOLLOW-UP QUESTIONS that the developer would genuinely want to ask next in Sidechat (without interrupting the main agent).",
    "",
    "What makes great Sidechat follow-up suggestions:",
    "1. Ground EVERY item in concrete specifics from the main session (open design dilemmas/choices, unelaborated details like 'what are the remaining N items?', unverified claims or conflict locations, specific ticket/PR IDs, config variables, files, or subtle side-effects).",
    "2. Phrase `title` like a natural question or crisp check a developer actually thinks of after reading the main agent's latest message (for Chinese/Japanese/Korean: <= 22 characters; for English: <= 48 characters). NEVER output generic boilerplate like 'Explain recent changes' or 'Check edge cases'.",
    "3. Make `prompt` a clear, direct 1-2 sentence sidechat question ready to send as-is, referencing the specific entities/files/options from the main session so the sidechat agent knows exactly what to investigate.",
    "4. Cover 4 distinct angles across the 4 items (e.g., weighing an open decision/trade-off, unpacking omitted/remaining items, verifying a risky assumption or edge case, and understanding a specific mechanism/impact).",
    `5. Write BOTH \`title\` and \`prompt\` in ${langInstruction}.`,
    `6. Choose \`icon\` for each item from: ${STARTER_ICON_NAMES.join(", ")}.`,
    "",
    "Return ONLY raw JSON in this exact shape:",
    '{"starters":[{"icon":"GitCompareArrows","title":"...","prompt":"..."},{"icon":"ListChecks","title":"...","prompt":"..."},{"icon":"ShieldAlert","title":"...","prompt":"..."},{"icon":"Workflow","title":"...","prompt":"..."}]}',
    "",
    "<main_session_digest>",
    input.digest,
    "</main_session_digest>",
  ].join("\n");
}

/**
 * Parses the fast model's JSON output (tolerating optional ```json fences or leading/trailing text)
 * into up to 4 validated `StarterPromptItem`s. Returns `null` if fewer than 2 valid items are found.
 */
export function parseAiStarterResponse(rawText: string): StarterPromptItem[] | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    candidates.unshift(fenced[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  const defaultIcons: StarterIconName[] = [
    "GitCompareArrows",
    "ListChecks",
    "ShieldAlert",
    "Workflow",
  ];

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const rawList = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { starters?: unknown }).starters)
          ? (parsed as { starters: unknown[] }).starters
          : null;
      if (!rawList) continue;

      const items: StarterPromptItem[] = [];
      const seenTitles = new Set<string>();
      for (const entry of rawList) {
        if (!entry || typeof entry !== "object") continue;
        const rec = entry as Record<string, unknown>;
        const title = typeof rec.title === "string" ? rec.title.replace(/\s+/g, " ").trim() : "";
        const prompt = typeof rec.prompt === "string" ? rec.prompt.trim() : "";
        if (!title || !prompt) continue;
        const normKey = title.toLowerCase();
        if (seenTitles.has(normKey)) continue;
        seenTitles.add(normKey);

        const fallbackIcon = defaultIcons[items.length % defaultIcons.length];
        const rawIcon = typeof rec.icon === "string" ? rec.icon.trim() : undefined;
        items.push({
          id: `ai-${items.length + 1}`,
          icon: normalizeIcon(rawIcon, fallbackIcon),
          title: compactText(title, 60),
          prompt,
        });
        if (items.length === 4) break;
      }

      if (items.length >= 2) {
        return items;
      }
    } catch {
      continue;
    }
  }

  return null;
}
