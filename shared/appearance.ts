import type { PluginTheme } from "@getpaseo/plugin";

export const DEFAULT_WEB_MONO_FONT =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export type ChatDisplayMode = "full" | "collapseToolCalls" | "collapseTurns";
export type SendShortcutMode = "enter" | "mod-enter";
export type SendBehaviorMode = "interrupt" | "steer" | "queue";

export interface HostAppearanceSettings {
  monoFontFamily: string;
  uiBaseFontSize: number;
  contentFontSize: number;
  contentLineHeight: number;
  codeFontSize: number;
  codeLineHeight: number;
  autoExpandReasoning: boolean;
  chatDisplay: ChatDisplayMode;
  chatOutlineEnabled: boolean;
  sendShortcut: SendShortcutMode;
  sendBehavior: SendBehaviorMode;
  themePreference: string;
}

export interface DerivedPalette {
  dark: boolean;
  userBubbleBg: string;
  userBubbleBorder: string;
  thoughtBg: string;
  thoughtBorder: string;
  toolBg: string;
  toolHoverBg: string;
  codeBg: string;
  accentSoftBg: string;
  accentSoftBorder: string;
  warningSoftBg: string;
  dangerSoftBg: string;
  successSoftBg: string;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

export function isSafeFontFamily(family: string): boolean {
  if (!family || family.length > 200) return false;
  if (/[\x00-\x1f\x7f]/.test(family)) return false;
  if (!/^[\p{L}\p{N}\s,_.'"-]+$/u.test(family)) return false;
  if ((family.match(/'/g)?.length ?? 0) % 2 !== 0) return false;
  if ((family.match(/"/g)?.length ?? 0) % 2 !== 0) return false;
  return true;
}

/**
 * Parses Paseo's `@paseo:app-settings` (or `@paseo:settings`) with exact parity
 * to Paseo's own defaults, bounds, and legacy `toolCallDetailLevel` / `compactToolCalls`
 * migrations.
 */
export function parseHostAppearanceSettings(
  raw: unknown,
  options: { native?: boolean; fallbackMonoFont?: string } = {},
): HostAppearanceSettings {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallbackMono = options.fallbackMonoFont ?? (options.native ? "monospace" : DEFAULT_WEB_MONO_FONT);
  const rawMono = typeof record.monoFontFamily === "string" ? record.monoFontFamily.trim() : "";
  const monoFontFamily = isSafeFontFamily(rawMono) ? rawMono : fallbackMono;

  const defaultUiBase = options.native ? 15 : 13;
  const defaultContent = options.native ? 16 : 14;
  const legacyUiScale =
    record.uiBaseFontSize === undefined && typeof record.uiFontSize === "number"
      ? Math.round((defaultUiBase * record.uiFontSize) / 16)
      : undefined;

  const uiBaseFontSize = clampInt(record.uiBaseFontSize ?? legacyUiScale, 10, 21, defaultUiBase);
  const contentFontSize = clampInt(record.contentFontSize, 10, 21, record.uiBaseFontSize !== undefined ? uiBaseFontSize : defaultContent);
  const codeFontSize = clampInt(record.codeFontSize, 9, 22, 12);

  const autoExpandReasoning = typeof record.autoExpandReasoning === "boolean" ? record.autoExpandReasoning : false;

  // Match Paseo's exact chatDisplay resolution & legacy compactToolCalls/toolCallDetailLevel migration.
  let chatDisplay: ChatDisplayMode = "collapseTurns";
  if (
    record.chatDisplay === "full" ||
    record.chatDisplay === "collapseToolCalls" ||
    record.chatDisplay === "collapseTurns"
  ) {
    chatDisplay = record.chatDisplay;
  } else if (record.toolCallDetailLevel !== undefined || record.compactToolCalls !== undefined) {
    const legacyOverview =
      record.toolCallDetailLevel !== undefined
        ? record.toolCallDetailLevel === "overview" || record.toolCallDetailLevel === "concise"
        : record.compactToolCalls === true;
    chatDisplay = legacyOverview ? "collapseToolCalls" : "full";
  }

  const chatOutlineEnabled = typeof record.chatOutlineEnabled === "boolean" ? record.chatOutlineEnabled : true;
  const sendShortcut: SendShortcutMode = record.sendShortcut === "mod-enter" ? "mod-enter" : "enter";
  const sendBehavior: SendBehaviorMode =
    record.sendBehavior === "interrupt" || record.sendBehavior === "queue" ? record.sendBehavior : "steer";
  const themePreference =
    typeof record.pluginThemeId === "string" && record.pluginThemeId
      ? record.pluginThemeId
      : typeof record.theme === "string" && record.theme
        ? record.theme
        : "auto";

  return {
    monoFontFamily,
    uiBaseFontSize,
    contentFontSize,
    contentLineHeight: Math.round(contentFontSize * 1.45),
    codeFontSize,
    codeLineHeight: Math.round(codeFontSize * 1.48),
    autoExpandReasoning,
    chatDisplay,
    chatOutlineEnabled,
    sendShortcut,
    sendBehavior,
    themePreference,
  };
}

export function sameHostAppearance(a: HostAppearanceSettings, b: HostAppearanceSettings): boolean {
  return (
    a.monoFontFamily === b.monoFontFamily &&
    a.uiBaseFontSize === b.uiBaseFontSize &&
    a.contentFontSize === b.contentFontSize &&
    a.codeFontSize === b.codeFontSize &&
    a.autoExpandReasoning === b.autoExpandReasoning &&
    a.chatDisplay === b.chatDisplay &&
    a.chatOutlineEnabled === b.chatOutlineEnabled &&
    a.sendShortcut === b.sendShortcut &&
    a.sendBehavior === b.sendBehavior &&
    a.themePreference === b.themePreference
  );
}

export function parseRgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(color.trim());
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(color.trim());
  if (short) {
    return [
      parseInt(short[1][0] + short[1][0], 16),
      parseInt(short[1][1] + short[1][1], 16),
      parseInt(short[1][2] + short[1][2], 16),
    ];
  }
  const rgbMatch = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color.trim());
  if (rgbMatch) {
    return [
      Math.min(255, Number(rgbMatch[1])),
      Math.min(255, Number(rgbMatch[2])),
      Math.min(255, Number(rgbMatch[3])),
    ];
  }
  return null;
}

export function isDarkSurface(surfaceColor: string): boolean {
  const channels = parseRgb(surfaceColor);
  if (!channels) return true;
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance < 128;
}

export function mixColor(foreground: string, background: string, alpha: number): string {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return background;
  const clamped = Math.max(0, Math.min(1, alpha));
  return (
    "#" +
    fg
      .map((channel, index) =>
        Math.round(channel * clamped + bg[index] * (1 - clamped))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function deriveSidechatPalette(colors: PluginTheme["colors"]): DerivedPalette {
  const dark = isDarkSurface(colors.surface0);
  return {
    dark,
    userBubbleBg: mixColor(colors.accent, colors.surface1, dark ? 0.14 : 0.09),
    userBubbleBorder: mixColor(colors.accent, colors.border, dark ? 0.32 : 0.24),
    thoughtBg: mixColor(colors.foregroundMuted, colors.surface0, dark ? 0.08 : 0.05),
    thoughtBorder: mixColor(colors.foregroundMuted, colors.border, 0.35),
    toolBg: colors.surface1,
    toolHoverBg: colors.surface2,
    codeBg: mixColor(colors.surface2, colors.surface0, dark ? 0.55 : 0.65),
    accentSoftBg: mixColor(colors.accent, colors.surface0, dark ? 0.18 : 0.12),
    accentSoftBorder: mixColor(colors.accent, colors.border, dark ? 0.45 : 0.35),
    warningSoftBg: mixColor(colors.statusWarning, colors.surface0, dark ? 0.18 : 0.12),
    dangerSoftBg: mixColor(colors.statusDanger, colors.surface0, dark ? 0.18 : 0.12),
    successSoftBg: mixColor(colors.statusSuccess, colors.surface0, dark ? 0.18 : 0.12),
  };
}
