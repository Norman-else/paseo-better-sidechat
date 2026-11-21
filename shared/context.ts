import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

export const SIDECHAT_CONTEXT_OPEN = "<sidechat_context>";
export const SIDECHAT_CONTEXT_CLOSE = "</sidechat_context>";
export const QUOTED_SELECTION_OPEN = "<quoted_selection>";
export const QUOTED_SELECTION_CLOSE = "</quoted_selection>";

export const SIDECHAT_READONLY_SYSTEM_PROMPT = [
  "You are a fast, precise Sidechat assistant inside Paseo, running alongside the user's main coding session in the same workspace directory.",
  "Guidelines:",
  "- Answer questions, explain code, analyze architecture, debug errors, and compare trade-offs clearly and concisely.",
  "- Feel free to inspect files, search code, and run read-only inspection commands (such as git status/diff/log) to ground your answers in the actual codebase.",
  "- IMPORTANT: Because the main coding agent may be actively working in this directory, DO NOT modify, create, or delete workspace files, and do not run state-mutating git/shell commands unless the user explicitly instructs you to make edits here.",
  "- When `<sidechat_context>` or `<quoted_selection>` blocks are present in a user message, treat them as background context from the user's main session and focus directly on answering the user's question.",
].join("\n");

export const SIDECHAT_EDITABLE_SYSTEM_PROMPT = [
  "You are a Sidechat assistant inside Paseo, running alongside the user's main coding session in the same workspace directory.",
  "When `<sidechat_context>` or `<quoted_selection>` blocks are present in a user message, treat them as background context from the user's main session and focus directly on the user's request.",
].join("\n");

export interface MainAgentContextInput {
  agentId: string;
  title: string | null;
  provider: string;
  model: string | null;
  cwd: string;
  status: string;
  entries: ReadonlyArray<{
    item: AgentTimelineItem;
    turnId?: string;
    timestamp?: string;
  }>;
  maxTurns?: number;
}

export interface MainContextDigest {
  agentId: string;
  title: string | null;
  turnCount: number;
  touchedFiles: string[];
  recentPrompts: string[];
  summaryPreview: string;
  digest: string;
}

function truncateText(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function stripInjectedBlocks(raw: string): string {
  return raw
    .replace(/<sidechat_context>[\s\S]*?<\/sidechat_context>\s*/g, "")
    .replace(/<quoted_selection>[\s\S]*?<\/quoted_selection>\s*/g, "")
    .trim();
}

export function buildMainContextDigest(input: MainAgentContextInput): MainContextDigest {
  const maxTurns = Math.max(1, Math.min(30, input.maxTurns ?? 6));
  const touchedFiles: string[] = [];
  const seenFiles = new Set<string>();
  const addFile = (filePath: string | undefined) => {
    const trimmed = filePath?.trim();
    if (!trimmed || seenFiles.has(trimmed)) return;
    seenFiles.add(trimmed);
    if (touchedFiles.length < 12) touchedFiles.push(trimmed);
  };

  interface TurnBucket {
    userText?: string;
    assistantText?: string;
    errors: string[];
    files: string[];
  }

  const turns: TurnBucket[] = [];
  let current: TurnBucket | null = null;

  for (const entry of input.entries) {
    const { item } = entry;
    if (item.type === "user_message") {
      const clean = stripInjectedBlocks(item.text);
      if (!clean) continue;
      current = { userText: clean, errors: [], files: [] };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { errors: [], files: [] };
      turns.push(current);
    }
    if (item.type === "assistant_message") {
      const clean = item.text.trim();
      if (clean) {
        current.assistantText = current.assistantText ? `${current.assistantText}\n${clean}` : clean;
      }
    } else if (item.type === "tool_call") {
      const detail = item.detail;
      if (detail.type === "edit" || detail.type === "write" || detail.type === "read") {
        addFile(detail.filePath);
        if (detail.filePath && !current.files.includes(detail.filePath) && current.files.length < 6) {
          current.files.push(detail.filePath);
        }
      }
      if (item.status === "failed" && item.error) {
        const errStr =
          typeof item.error === "string"
            ? item.error
            : item.error && typeof item.error === "object" && "message" in item.error
              ? String((item.error as { message?: unknown }).message ?? "")
              : "";
        if (errStr && current.errors.length < 2) current.errors.push(truncateText(errStr, 160));
      }
    } else if (item.type === "error") {
      if (item.message && current.errors.length < 2) {
        current.errors.push(truncateText(item.message, 160));
      }
    }
  }

  const selectedTurns = turns.slice(-maxTurns);
  const recentPrompts = selectedTurns
    .map((t) => (t.userText ? truncateText(t.userText.replace(/\s+/g, " "), 90) : ""))
    .filter(Boolean);

  const lines: string[] = [
    `Main session: ${input.title || "Untitled"} (${input.provider}${input.model ? `/${input.model}` : ""}, status: ${input.status})`,
    `Working directory: ${input.cwd}`,
  ];

  if (touchedFiles.length > 0) {
    lines.push(`Recently referenced/edited files: ${touchedFiles.join(", ")}`);
  }

  if (selectedTurns.length > 0) {
    lines.push("Recent conversation turns:");
    selectedTurns.forEach((turn, idx) => {
      const turnNum = idx + 1;
      if (turn.userText) {
        lines.push(`[Turn ${turnNum} User]: ${truncateText(turn.userText, 500)}`);
      }
      if (turn.files.length > 0) {
        lines.push(`[Turn ${turnNum} Files]: ${turn.files.join(", ")}`);
      }
      if (turn.errors.length > 0) {
        lines.push(`[Turn ${turnNum} Errors]: ${turn.errors.join(" | ")}`);
      }
      if (turn.assistantText) {
        lines.push(`[Turn ${turnNum} Assistant]: ${truncateText(turn.assistantText, 700)}`);
      }
    });
  }

  const latestPrompt = recentPrompts.at(-1) ?? "";
  const summaryPreview = latestPrompt
    ? truncateText(latestPrompt, 72)
    : input.title
      ? truncateText(input.title, 72)
      : input.cwd;

  return {
    agentId: input.agentId,
    title: input.title,
    turnCount: selectedTurns.length,
    touchedFiles,
    recentPrompts,
    summaryPreview,
    digest: lines.join("\n"),
  };
}

export function composeSidechatPrompt(input: {
  text: string;
  mainContext?: string | null;
  quotedSelection?: string | null;
}): string {
  const parts: string[] = [];
  const context = input.mainContext?.trim();
  if (context) {
    parts.push(`${SIDECHAT_CONTEXT_OPEN}\n${context}\n${SIDECHAT_CONTEXT_CLOSE}`);
  }
  const quote = input.quotedSelection?.trim();
  if (quote) {
    parts.push(`${QUOTED_SELECTION_OPEN}\n${quote}\n${QUOTED_SELECTION_CLOSE}`);
  }
  parts.push(input.text.trim());
  return parts.join("\n\n");
}

export interface ParsedSidechatUserMessage {
  body: string;
  mainContext: string | null;
  quotedSelection: string | null;
}

export function parseSidechatUserMessage(raw: string): ParsedSidechatUserMessage {
  let rest = raw;
  let mainContext: string | null = null;
  let quotedSelection: string | null = null;

  const ctxMatch = /<sidechat_context>\n?([\s\S]*?)\n?<\/sidechat_context>\s*/.exec(rest);
  if (ctxMatch) {
    mainContext = ctxMatch[1].trim() || null;
    rest = rest.slice(0, ctxMatch.index) + rest.slice(ctxMatch.index + ctxMatch[0].length);
  }

  const quoteMatch = /<quoted_selection>\n?([\s\S]*?)\n?<\/quoted_selection>\s*/.exec(rest);
  if (quoteMatch) {
    quotedSelection = quoteMatch[1].trim() || null;
    rest = rest.slice(0, quoteMatch.index) + rest.slice(quoteMatch.index + quoteMatch[0].length);
  }

  return {
    body: rest.trim(),
    mainContext,
    quotedSelection,
  };
}

export function formatTransferToMainPrompt(input: {
  question?: string | null;
  answer: string;
  mode: "insert" | "send";
  locale?: string;
}): string {
  const zh = Boolean(input.locale && input.locale.toLowerCase().startsWith("zh"));
  const cleanAnswer = input.answer.trim();
  const cleanQuestion = input.question ? stripInjectedBlocks(input.question) : "";
  if (zh) {
    const header = cleanQuestion
      ? `来自侧边聊天（关于「${truncateText(cleanQuestion.replace(/\s+/g, " "), 60)}」）的结论：`
      : "来自侧边聊天的参考结论：";
    const tail =
      input.mode === "send"
        ? "\n\n请结合以上结论继续推进当前任务。"
        : "\n\n";
    return `${header}\n\n${cleanAnswer}${tail}`;
  }
  const header = cleanQuestion
    ? `Context from Sidechat (re: "${truncateText(cleanQuestion.replace(/\s+/g, " "), 60)}"):`
    : "Notes from Sidechat:";
  const tail = input.mode === "send" ? "\n\nPlease incorporate these findings into the current task." : "\n\n";
  return `${header}\n\n${cleanAnswer}${tail}`;
}

export function deriveThreadTitle(promptText: string, fallback = "Sidechat"): string {
  const clean = stripInjectedBlocks(promptText).replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length <= 42 ? clean : `${clean.slice(0, 41).trimEnd()}…`;
}
