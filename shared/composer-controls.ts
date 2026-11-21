import type { AgentUsage } from "@getpaseo/protocol/agent-types";

export const CLAUDE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>';

/**
 * Strips redundant provider prefixes (e.g. "Claude Opus 5.5" -> "Opus 5.5",
 * "claude-sonnet-4-5-20250929" -> "Sonnet 4.5") to match Paseo's compact model pill.
 */
export function formatShortModelLabel(labelOrId: string | null | undefined, fallback = "Model"): string {
  if (!labelOrId) return fallback;
  const trimmed = labelOrId.trim();
  if (!trimmed) return fallback;

  const withoutClaudePrefix = trimmed.replace(/^Claude\s+/i, "");
  if (withoutClaudePrefix !== trimmed && withoutClaudePrefix.length > 0) {
    return withoutClaudePrefix;
  }

  const slugMatch = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(trimmed);
  if (slugMatch) {
    const family = slugMatch[1][0].toUpperCase() + slugMatch[1].slice(1).toLowerCase();
    const ver = slugMatch[3] ? `${slugMatch[2]}.${slugMatch[3]}` : slugMatch[2];
    return `${family} ${ver}`;
  }

  return trimmed;
}

export function formatShortThinkingLabel(
  labelOrId: string | null | undefined,
  fallback = "Default",
): string {
  if (!labelOrId) return fallback;
  const cleaned = labelOrId
    .trim()
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/\s+thinking$/i, "")
    .trim();
  if (!cleaned) return fallback;
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

export function resolveModeIconName(modeId: string | null | undefined): string {
  switch (modeId) {
    case "plan":
    case "https://agentclientprotocol.com/protocol/session-modes#plan":
      return "ShieldEllipsis";
    case "default":
    case "ask":
      return "Shield";
    case "acceptEdits":
      return "ShieldPlus";
    case "bypassPermissions":
    case "full-access":
    case "allow-all":
    case "full":
      return "ShieldOff";
    case "auto":
    case "auto-review":
    default:
      return "ShieldCheck";
  }
}

export function formatShortModeLabel(
  modeId: string | null | undefined,
  rawLabel?: string | null,
): string {
  switch (modeId) {
    case "bypassPermissions":
      return "Bypass";
    case "auto":
      return "Auto";
    case "plan":
      return "Plan";
    case "default":
      return "Ask";
    case "acceptEdits":
      return "Edits";
    default: {
      if (!rawLabel) return modeId || "Auto";
      return rawLabel.replace(/\s+mode$/i, "").trim() || rawLabel;
    }
  }
}

export type ComposerToolbarDensity = "full" | "condensed" | "iconOnly";

export function resolveToolbarDensity(
  panelWidth: number,
  isTouchCompact: boolean,
): ComposerToolbarDensity {
  if (panelWidth > 0 && panelWidth < 340) return "iconOnly";
  if (isTouchCompact || (panelWidth > 0 && panelWidth < 430)) return "condensed";
  return "full";
}

function sanitizeSvgColor(color: string, fallback: string): string {
  const trimmed = color.trim();
  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(trimmed) ? trimmed : fallback;
}

export function resolveContextUsageRatio(
  usage: AgentUsage | null | undefined,
  fallbackMaxTokens?: number | null,
): {
  usedTokens: number;
  maxTokens: number;
  ratio: number;
} {
  const maxTokens = usage?.contextWindowMaxTokens ?? fallbackMaxTokens ?? 200_000;
  const usedTokens =
    usage?.contextWindowUsedTokens ??
    ((usage?.inputTokens ?? 0) + (usage?.cachedInputTokens ?? 0) + (usage?.outputTokens ?? 0));
  const safeMax = maxTokens > 0 ? maxTokens : 200_000;
  const safeUsed = Math.max(0, usedTokens);
  const ratio = Math.max(0, Math.min(1, safeUsed / safeMax));
  return { usedTokens: safeUsed, maxTokens: safeMax, ratio };
}

/**
 * Builds Paseo's circular Context Window Meter SVG (`18x18` / `16x16` ring on the right side of the composer).
 */
export function buildContextRingSvg(input: {
  ratio: number;
  trackColor: string;
  progressColor: string;
}): string {
  const radius = 8.5;
  const circumference = 2 * Math.PI * radius;
  // Show a tiny 6% baseline arc even on a fresh session (matching Paseo's initial ring look)
  const effectiveRatio = input.ratio > 0 ? Math.max(0.06, Math.min(1, input.ratio)) : 0.06;
  const dash = (circumference * effectiveRatio).toFixed(2);
  const gap = (circumference - Number(dash)).toFixed(2);
  const track = sanitizeSvgColor(input.trackColor, "#3f3f46");
  const fill = sanitizeSvgColor(input.progressColor, "#a1a1aa");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">',
    `<circle cx="12" cy="12" r="${radius}" stroke="${track}" stroke-width="2.4" opacity="0.45"/>`,
    `<circle cx="12" cy="12" r="${radius}" stroke="${fill}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${dash} ${gap}" transform="rotate(-90 12 12)"/>`,
    "</svg>",
  ].join("");
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}k`;
  return String(tokens);
}

export function formatContextUsageSummary(
  usage: AgentUsage | null | undefined,
  fallbackMaxTokens?: number | null,
): string {
  const { usedTokens, maxTokens, ratio } = resolveContextUsageRatio(usage, fallbackMaxTokens);
  const pct = Math.round(ratio * 100);
  const costPart =
    usage?.totalCostUsd !== undefined && usage.totalCostUsd > 0
      ? ` · $${usage.totalCostUsd.toFixed(usage.totalCostUsd < 0.01 ? 4 : 2)}`
      : "";
  return `Context: ${formatCompactTokens(usedTokens)} / ${formatCompactTokens(maxTokens)} (${pct}%)${costPart}`;
}
