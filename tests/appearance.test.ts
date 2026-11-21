import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSidechatPalette,
  isDarkSurface,
  isSafeFontFamily,
  parseHostAppearanceSettings,
} from "../shared/appearance";

test("parseHostAppearanceSettings matches Paseo defaults when storage is empty", () => {
  const settings = parseHostAppearanceSettings(null);
  assert.equal(settings.autoExpandReasoning, false);
  assert.equal(settings.chatDisplay, "collapseTurns");
  assert.equal(settings.chatOutlineEnabled, true);
  assert.equal(settings.uiBaseFontSize, 13);
  assert.equal(settings.contentFontSize, 14);
  assert.equal(settings.codeFontSize, 12);
  assert.equal(settings.sendShortcut, "enter");
  assert.equal(settings.sendBehavior, "steer");
});

test("parseHostAppearanceSettings honors explicit thinking, collapse, and font settings", () => {
  const settings = parseHostAppearanceSettings({
    autoExpandReasoning: true,
    chatDisplay: "collapseToolCalls",
    chatOutlineEnabled: false,
    monoFontFamily: "'JetBrains Mono', Menlo, monospace",
    uiBaseFontSize: 15,
    contentFontSize: 16,
    codeFontSize: 14,
    sendShortcut: "mod-enter",
    sendBehavior: "interrupt",
    theme: "claude",
  });
  assert.equal(settings.autoExpandReasoning, true);
  assert.equal(settings.chatDisplay, "collapseToolCalls");
  assert.equal(settings.chatOutlineEnabled, false);
  assert.equal(settings.monoFontFamily, "'JetBrains Mono', Menlo, monospace");
  assert.equal(settings.uiBaseFontSize, 15);
  assert.equal(settings.contentFontSize, 16);
  assert.equal(settings.codeFontSize, 14);
  assert.equal(settings.sendShortcut, "mod-enter");
  assert.equal(settings.sendBehavior, "interrupt");
  assert.equal(settings.themePreference, "claude");
});

test("parseHostAppearanceSettings migrates legacy toolCallDetailLevel and compactToolCalls", () => {
  const fromConcise = parseHostAppearanceSettings({ toolCallDetailLevel: "concise" });
  assert.equal(fromConcise.chatDisplay, "collapseToolCalls");

  const fromDetailed = parseHostAppearanceSettings({ toolCallDetailLevel: "detailed" });
  assert.equal(fromDetailed.chatDisplay, "full");

  const fromCompact = parseHostAppearanceSettings({ compactToolCalls: true });
  assert.equal(fromCompact.chatDisplay, "collapseToolCalls");
});

test("isSafeFontFamily rejects unsafe CSS injection strings", () => {
  assert.equal(isSafeFontFamily("SF Mono, Menlo, monospace"), true);
  assert.equal(isSafeFontFamily("bad; color: red}"), false);
  assert.equal(isSafeFontFamily("'unbalanced quote"), false);
});

test("isDarkSurface and deriveSidechatPalette adapt across dark and light Paseo themes", () => {
  assert.equal(isDarkSurface("#09090b"), true);
  assert.equal(isDarkSurface("#ffffff"), false);
  assert.equal(isDarkSurface("rgb(248, 250, 252)"), false);

  const lightPalette = deriveSidechatPalette({
    surface0: "#ffffff",
    surface1: "#f4f4f5",
    surface2: "#e4e4e7",
    border: "#d4d4d8",
    foreground: "#18181b",
    foregroundMuted: "#71717a",
    accent: "#d97757",
    accentForeground: "#ffffff",
    statusSuccess: "#16a34a",
    statusWarning: "#d97706",
    statusDanger: "#dc2626",
  });
  assert.equal(lightPalette.dark, false);
  assert.match(lightPalette.userBubbleBg, /^#[0-9a-f]{6}$/);
});
