import assert from "node:assert/strict";
import test from "node:test";
import { findSvgIconProblem } from "@getpaseo/plugin";
import {
  buildContextRingSvg,
  CLAUDE_ICON_SVG,
  formatContextUsageSummary,
  formatShortModelLabel,
  formatShortModeLabel,
  formatShortThinkingLabel,
  resolveContextUsageRatio,
  resolveModeIconName,
  resolveToolbarDensity,
} from "../shared/composer-controls";

test("CLAUDE_ICON_SVG and buildContextRingSvg pass Paseo inline SVG icon validation", () => {
  assert.equal(findSvgIconProblem(CLAUDE_ICON_SVG), null);

  const ringSvg = buildContextRingSvg({
    ratio: 0.25,
    trackColor: "#52525b",
    progressColor: "#a1a1aa",
  });
  assert.equal(findSvgIconProblem(ringSvg), null);

  // Rejects unsafe color injection by falling back to safe hex
  const sanitizedRingSvg = buildContextRingSvg({
    ratio: 0.5,
    trackColor: '" onload="alert(1)',
    progressColor: "javascript:void(0)",
  });
  assert.equal(findSvgIconProblem(sanitizedRingSvg), null);
});

test("formatShortModelLabel strips Claude prefix and formats model slugs like Paseo", () => {
  assert.equal(formatShortModelLabel("Claude Opus 5.5"), "Opus 5.5");
  assert.equal(formatShortModelLabel("Claude Sonnet 4.5"), "Sonnet 4.5");
  assert.equal(formatShortModelLabel("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(formatShortModelLabel("claude-opus-4-20250514"), "Opus 4");
  assert.equal(formatShortModelLabel(null, "Model"), "Model");
});

test("formatShortThinkingLabel and mode helpers match Paseo composer toolbar labels & icons", () => {
  assert.equal(formatShortThinkingLabel("low"), "Low");
  assert.equal(formatShortThinkingLabel("Medium thinking"), "Medium");
  assert.equal(formatShortThinkingLabel("High (recommended)"), "High");

  assert.equal(resolveModeIconName("bypassPermissions"), "ShieldOff");
  assert.equal(resolveModeIconName("plan"), "ShieldEllipsis");
  assert.equal(resolveModeIconName("default"), "Shield");
  assert.equal(resolveModeIconName("acceptEdits"), "ShieldPlus");
  assert.equal(resolveModeIconName("auto"), "ShieldCheck");

  assert.equal(formatShortModeLabel("bypassPermissions", "Bypass"), "Bypass");
  assert.equal(formatShortModeLabel("auto", "Auto mode"), "Auto");
  assert.equal(formatShortModeLabel("plan", "Plan Mode"), "Plan");
  assert.equal(formatShortModeLabel("default", "Always Ask"), "Ask");
  assert.equal(formatShortModeLabel("acceptEdits", "Accept File Edits"), "Edits");
});

test("resolveContextUsageRatio and formatContextUsageSummary compute accurate ring ratios", () => {
  const fresh = resolveContextUsageRatio(null, 200_000);
  assert.equal(fresh.usedTokens, 0);
  assert.equal(fresh.maxTokens, 200_000);
  assert.equal(fresh.ratio, 0);

  const active = resolveContextUsageRatio({
    contextWindowUsedTokens: 48_000,
    contextWindowMaxTokens: 200_000,
    totalCostUsd: 0.145,
  });
  assert.equal(active.ratio, 0.24);
  assert.equal(formatContextUsageSummary({
    contextWindowUsedTokens: 48_000,
    contextWindowMaxTokens: 200_000,
    totalCostUsd: 0.145,
  }), "Context: 48k / 200k (24%) · $0.14");
});

test("resolveToolbarDensity adapts smoothly to narrow sidebar widths", () => {
  assert.equal(resolveToolbarDensity(480, false), "full");
  assert.equal(resolveToolbarDensity(390, false), "condensed");
  assert.equal(resolveToolbarDensity(320, false), "iconOnly");
  assert.equal(resolveToolbarDensity(500, true), "condensed");
});
