import { z } from "zod";

export const workspaceFileEntrySchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["file", "directory"]),
});

export type WorkspaceFileEntry = z.infer<typeof workspaceFileEntrySchema>;

export const slashCommandItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  argumentHint: z.string().default(""),
  kind: z.enum(["command", "skill"]).default("command"),
});

export type SlashCommandItem = z.infer<typeof slashCommandItemSchema>;

export interface ActiveFileMention {
  start: number;
  end: number;
  query: string;
}

export interface ActiveSlashCommand {
  start: number;
  end: number;
  query: string;
  position: "start" | "inline";
}

export type ClientSlashCommandAction = "new-thread" | "archive-thread";

export interface ClientSlashCommandDef {
  name: string;
  aliases: readonly string[];
  action: ClientSlashCommandAction;
  icon: "SquarePen" | "Archive";
}

export const SIDECHAT_CLIENT_COMMANDS: readonly ClientSlashCommandDef[] = [
  {
    name: "clear",
    aliases: ["new"],
    action: "new-thread",
    icon: "SquarePen",
  },
  {
    name: "exit",
    aliases: ["archive", "quit", "q"],
    action: "archive-thread",
    icon: "Archive",
  },
];

const FILE_QUERY_INVALID_RE = /[\s\n\r\t"'<>]/;
const SLASH_QUERY_INVALID_RE = /[/\s\n\r\t"']/;

/**
 * Matches Paseo's `findActiveFileMention`: scans backward from cursor for `@`
 * not preceded by word/`+` characters (avoiding email addresses) and with no whitespace/quotes.
 */
export function findActiveFileMention(input: {
  text: string;
  cursorIndex: number;
}): ActiveFileMention | null {
  const clamped = Math.max(0, Math.min(input.cursorIndex, input.text.length));
  const prefix = input.text.slice(0, clamped);
  for (let at = prefix.lastIndexOf("@"); at >= 0; at = at === 0 ? -1 : prefix.lastIndexOf("@", at - 1)) {
    if (at > 0 && /[\w+]/.test(prefix[at - 1]!)) {
      continue;
    }
    const query = prefix.slice(at + 1);
    if (!FILE_QUERY_INVALID_RE.test(query)) {
      return { start: at, end: clamped, query };
    }
  }
  return null;
}

export function formatQuotedFileMentionPath(relativePath: string): string {
  return `"${relativePath.replace(/"/g, '\\"')}"`;
}

/**
 * Matches Paseo's `applyFileMentionReplacement`, adding a trailing space when at end of input
 * or immediately before non-whitespace so typing can continue smoothly.
 */
export function applyFileMentionReplacement(input: {
  text: string;
  mention: ActiveFileMention;
  relativePath: string;
}): { text: string; cursorIndex: number } {
  const before = input.text.slice(0, input.mention.start);
  const after = input.text.slice(input.mention.end);
  const quoted = formatQuotedFileMentionPath(input.relativePath);
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  const inserted = needsSpace ? `${quoted} ` : quoted;
  const nextText = `${before}${inserted}${after}`;
  return {
    text: nextText,
    cursorIndex: before.length + inserted.length,
  };
}

/**
 * Matches Paseo's `findActiveSlashCommand`: `/` at index 0 (`"start"`) or after whitespace (`"inline"`).
 */
export function findActiveSlashCommand(input: {
  text: string;
  cursorIndex: number;
}): ActiveSlashCommand | null {
  const clamped = Math.max(0, Math.min(input.cursorIndex, input.text.length));
  const prefix = input.text.slice(0, clamped);
  for (
    let slash = prefix.lastIndexOf("/");
    slash >= 0;
    slash = slash === 0 ? -1 : prefix.lastIndexOf("/", slash - 1)
  ) {
    const prevChar = slash > 0 ? input.text[slash - 1]! : "";
    if (prevChar && !/\s/.test(prevChar)) {
      continue;
    }
    const query = prefix.slice(slash + 1);
    if (!SLASH_QUERY_INVALID_RE.test(query)) {
      return {
        start: slash,
        end: clamped,
        query,
        position: slash === 0 ? "start" : "inline",
      };
    }
  }
  return null;
}

export function applySlashCommandReplacement(input: {
  text: string;
  command: ActiveSlashCommand;
  commandName: string;
}): { text: string; cursorIndex: number } {
  const before = input.text.slice(0, input.command.start);
  const after = input.text.slice(input.command.end);
  const token = `/${input.commandName}`;
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  const inserted = needsSpace ? `${token} ` : token;
  return {
    text: `${before}${inserted}${after}`,
    cursorIndex: before.length + inserted.length,
  };
}

export function resolveImmediateClientSlashCommand(input: {
  text: string;
  hasAttachments: boolean;
  hasActiveThread: boolean;
}): ClientSlashCommandDef | null {
  if (input.hasAttachments || !input.hasActiveThread) return null;
  const trimmed = input.text.trim();
  if (!trimmed.startsWith("/")) return null;
  const name = trimmed.slice(1);
  if (!name || /\s/.test(name)) return null;
  const lower = name.toLowerCase();
  for (const cmd of SIDECHAT_CLIENT_COMMANDS) {
    if (cmd.name === lower || cmd.aliases.includes(lower)) {
      return cmd;
    }
  }
  return null;
}

function scoreCandidateName(queryLower: string, candidate: string): number | null {
  const target = candidate.toLowerCase();
  if (!queryLower) return 100;
  if (target === queryLower) return 1000;
  if (target.startsWith(queryLower)) return 850 - Math.min(100, target.length);

  // Segment boundary match (e.g. `:skill-creator` or `-deploy`)
  const boundaryIdx = target.search(
    new RegExp(`[:/_\\-.]${queryLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  if (boundaryIdx >= 0) return 720 - boundaryIdx;

  const subIdx = target.indexOf(queryLower);
  if (subIdx >= 0) return 580 - subIdx;

  // Subsequence fuzzy match
  let qi = 0;
  let gaps = 0;
  for (let ti = 0; ti < target.length && qi < queryLower.length; ti += 1) {
    if (target[ti] === queryLower[qi]) {
      qi += 1;
    } else if (qi > 0) {
      gaps += 1;
    }
  }
  if (qi === queryLower.length) {
    return Math.max(10, 350 - gaps * 4);
  }
  return null;
}

export type UnifiedSlashEntry =
  | {
      source: "provider";
      name: string;
      description: string;
      argumentHint: string;
      kind: "command" | "skill";
    }
  | {
      source: "client";
      name: string;
      aliases: readonly string[];
      description: string;
      action: ClientSlashCommandAction;
      icon: "SquarePen" | "Archive";
    };

export function rankSlashAutocompleteEntries(input: {
  providerCommands: readonly SlashCommandItem[];
  clientCommands: readonly {
    def: ClientSlashCommandDef;
    description: string;
  }[];
  query: string;
  position: "start" | "inline";
  limit?: number;
}): UnifiedSlashEntry[] {
  const maxItems = input.limit ?? 50;
  const queryLower = input.query.trim().toLowerCase();

  const pool: UnifiedSlashEntry[] = [];
  const reservedNames = new Set<string>();

  if (input.position === "start") {
    for (const c of input.clientCommands) {
      reservedNames.add(c.def.name);
      for (const alias of c.def.aliases) reservedNames.add(alias);
    }
  }

  for (const cmd of input.providerCommands) {
    if (input.position === "inline" && cmd.kind !== "skill") {
      continue;
    }
    if (input.position === "start" && reservedNames.has(cmd.name)) {
      continue;
    }
    pool.push({
      source: "provider",
      name: cmd.name,
      description: cmd.description,
      argumentHint: cmd.argumentHint,
      kind: cmd.kind,
    });
  }

  if (input.position === "start") {
    for (const c of input.clientCommands) {
      pool.push({
        source: "client",
        name: c.def.name,
        aliases: c.def.aliases,
        description: c.description,
        action: c.def.action,
        icon: c.def.icon,
      });
    }
  }

  if (!queryLower) {
    // Provider commands/skills first, client commands last (matches Paseo `MOD 5081`)
    return pool.slice(0, maxItems);
  }

  const scored: Array<{ entry: UnifiedSlashEntry; score: number }> = [];
  for (const entry of pool) {
    const names =
      entry.source === "client" ? [entry.name, ...entry.aliases] : [entry.name];
    let best: number | null = null;
    for (const n of names) {
      const s = scoreCandidateName(queryLower, n);
      if (s !== null && (best === null || s > best)) {
        best = s;
      }
    }
    if (best !== null) {
      scored.push({ entry, score: best });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.name.localeCompare(b.entry.name);
  });

  return scored.slice(0, maxItems).map((x) => x.entry);
}
