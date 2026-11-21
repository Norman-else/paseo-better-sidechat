import assert from "node:assert/strict";
import test from "node:test";
import { findSvgIconProblem } from "@getpaseo/plugin";
import {
  buildContextRingSvg,
  BUILTIN_PROVIDER_SVGS,
  CLAUDE_ICON_SVG,
  CODEX_ICON_SVG,
  formatContextUsageSummary,
  formatPaseoTokenCount,
  formatProviderLabel,
  formatSessionCostUsd,
  formatShortModelLabel,
  formatShortModeLabel,
  formatShortThinkingLabel,
  formatUsageResetCountdown,
  resolveContextUsageRatio,
  resolveEffectiveProviderMode,
  resolveModeIconName,
  resolveProviderIconSvg,
  resolveToolbarDensity,
  resolveUsageWindowMetrics,
} from "../shared/composer-controls";
import { sidechatSettings } from "../shared/settings";

test("All builtin provider SVGs and buildContextRingSvg pass Paseo inline SVG validation", () => {
  for (const [providerId, svg] of Object.entries(BUILTIN_PROVIDER_SVGS)) {
    assert.equal(
      findSvgIconProblem(svg),
      null,
      `Expected builtin SVG for ${providerId} to pass findSvgIconProblem`,
    );
  }

  const ringSvg = buildContextRingSvg({
    ratio: 0.25,
    trackColor: "#52525b",
    progressColor: "#a1a1aa",
  });
  assert.equal(findSvgIconProblem(ringSvg), null);

  const sanitizedRingSvg = buildContextRingSvg({
    ratio: 0.5,
    trackColor: '" onload="alert(1)',
    progressColor: "javascript:void(0)",
  });
  assert.equal(findSvgIconProblem(sanitizedRingSvg), null);
});

test("resolveProviderIconSvg and formatProviderLabel support builtin and custom ACP providers", () => {
  assert.equal(resolveProviderIconSvg("claude"), CLAUDE_ICON_SVG);
  assert.equal(resolveProviderIconSvg("codex"), CODEX_ICON_SVG);
  assert.ok(resolveProviderIconSvg("kimi-custom"));

  const customValidSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>';
  assert.equal(resolveProviderIconSvg("my-custom-acp", customValidSvg), customValidSvg);
  assert.equal(resolveProviderIconSvg("my-custom-acp", "<script>bad()</script>"), null);

  assert.equal(formatProviderLabel("codex"), "Codex");
  assert.equal(formatProviderLabel("copilot"), "GitHub Copilot");
  assert.equal(formatProviderLabel("kimi", "Kimi Code CLI"), "Kimi Code CLI");
  assert.equal(formatProviderLabel("my-acp-agent"), "My Acp Agent");
});

test("formatShortModelLabel strips redundant provider prefixes across Claude, OpenAI, and Copilot", () => {
  assert.equal(formatShortModelLabel("Claude Opus 5.5"), "Opus 5.5");
  assert.equal(formatShortModelLabel("OpenAI GPT-5.4"), "GPT-5.4");
  assert.equal(formatShortModelLabel("GitHub Copilot GPT-5"), "GPT-5");
  assert.equal(formatShortModelLabel("claude-sonnet-4-5-20250929"), "Sonnet 4.5");
  assert.equal(formatShortModelLabel("claude-opus-4-20250514"), "Opus 4");
  assert.equal(formatShortModelLabel("Kimi K2.5"), "Kimi K2.5");
  assert.equal(formatShortModelLabel(null, "Model"), "Model");
});

test("resolveEffectiveProviderMode maps permission preferences safely across Claude, Codex, Copilot, OpenCode, and zero-mode providers", () => {
  // Codex modes (`auto`, `auto-review`, `full-access`)
  const codexModes = [{ id: "auto" }, { id: "auto-review" }, { id: "full-access" }];
  assert.equal(
    resolveEffectiveProviderMode({
      provider: "codex",
      defaultPermissionMode: "bypassPermissions",
      availableModes: codexModes,
      providerDefaultModeId: "auto",
    }),
    "full-access",
  );
  assert.equal(
    resolveEffectiveProviderMode({
      provider: "codex",
      defaultPermissionMode: "plan",
      availableModes: codexModes,
      providerDefaultModeId: "auto",
    }),
    "auto",
  );

  // Copilot modes (`#agent`, `#plan`, `allow-all`)
  const copilotModes = [
    { id: "https://agentclientprotocol.com/protocol/session-modes#agent" },
    { id: "https://agentclientprotocol.com/protocol/session-modes#plan" },
    { id: "allow-all" },
  ];
  assert.equal(
    resolveEffectiveProviderMode({
      provider: "copilot",
      defaultPermissionMode: "plan",
      availableModes: copilotModes,
    }),
    "https://agentclientprotocol.com/protocol/session-modes#plan",
  );

  // Zero-mode custom ACP provider returns undefined so agents.create omits unsupported modeId
  assert.equal(
    resolveEffectiveProviderMode({
      provider: "kimi",
      defaultPermissionMode: "auto",
      availableModes: [],
    }),
    undefined,
  );
});

test("sidechatSettings v3 migration preserves full main-session MCP tools and permission inheritance", () => {
  const fromV1Default = sidechatSettings.migrate?.(
    {
      defaultContextMode: "first_turn",
      contextTurns: 6,
      defaultClaudeMode: "auto",
      fastStartup: true,
    },
    1,
  ) as Record<string, unknown>;
  assert.equal(fromV1Default.defaultPermissionMode, "inherit");
  assert.equal(fromV1Default.skipExternalMcp, false);
  assert.equal(fromV1Default.inheritMainModel, true);

  const fromV2ExplicitPlan = sidechatSettings.migrate?.(
    {
      defaultContextMode: "always",
      contextTurns: 10,
      defaultPermissionMode: "plan",
      fastStartup: true,
      readOnlyGuard: false,
    },
    2,
  ) as Record<string, unknown>;
  assert.equal(fromV2ExplicitPlan.defaultPermissionMode, "plan");
  assert.equal(fromV2ExplicitPlan.skipExternalMcp, false);
  assert.equal(fromV2ExplicitPlan.defaultContextMode, "always");
  assert.equal(fromV2ExplicitPlan.readOnlyGuard, false);
});

test("formatShortThinkingLabel and mode helpers match Paseo composer toolbar labels & icons", () => {
  assert.equal(formatShortThinkingLabel("low"), "Low");
  assert.equal(formatShortThinkingLabel("Medium thinking"), "Medium");
  assert.equal(formatShortThinkingLabel("High effort"), "High");

  assert.equal(resolveModeIconName("bypassPermissions"), "ShieldOff");
  assert.equal(resolveModeIconName("full-access"), "ShieldOff");
  assert.equal(resolveModeIconName("custom-mode", "ShieldAlert"), "ShieldAlert");

  assert.equal(formatShortModeLabel("bypassPermissions", "Bypass"), "Bypass");
  assert.equal(formatShortModeLabel("auto", "Default Permissions"), "Default");
  assert.equal(formatShortModeLabel("auto", "Auto mode"), "Auto");
  assert.equal(formatShortModeLabel("full-access", "Full Access"), "Full Access");
});

test("resolveContextUsageRatio, formatContextUsageSummary, and resolveToolbarDensity work accurately", () => {
  const active = resolveContextUsageRatio({
    contextWindowUsedTokens: 48_000,
    contextWindowMaxTokens: 200_000,
    totalCostUsd: 0.145,
  });
  assert.equal(active.ratio, 0.24);
  assert.equal(
    formatContextUsageSummary({
      contextWindowUsedTokens: 48_000,
      contextWindowMaxTokens: 200_000,
      totalCostUsd: 0.145,
    }),
    "Context: 48k / 200k (24%) · $0.14",
  );
  assert.equal(resolveToolbarDensity(480, false), "full");
  assert.equal(resolveToolbarDensity(390, false), "condensed");
  assert.equal(resolveToolbarDensity(320, false), "iconOnly");
});

test("Paseo context window popover token, cost, quota bar, and reset countdown formatters match Paseo", () => {
  assert.equal(formatPaseoTokenCount(75_200), "75k");
  assert.equal(formatPaseoTokenCount(1_000_000), "1m");
  assert.equal(formatPaseoTokenCount(850), "850");

  assert.equal(formatSessionCostUsd(1.3), "$1.30");
  assert.equal(formatSessionCostUsd(0.0042), "$0.0042");
  assert.equal(formatSessionCostUsd(0), null);

  const rem = resolveUsageWindowMetrics(
    { usedPct: 14, remainingPct: 86, tone: "ok" },
    "remaining",
  );
  assert.equal(rem.displayPercent, 86);
  assert.equal(rem.barPercent, 86);
  assert.equal(rem.severity, "ok");

  const usedWarn = resolveUsageWindowMetrics(
    { usedPct: 78, remainingPct: 22 },
    "used",
  );
  assert.equal(usedWarn.displayPercent, 78);
  assert.equal(usedWarn.severity, "warning");

  const nowMs = Date.parse("2026-11-21T03:22:00Z");
  const shortReset = formatUsageResetCountdown("2026-11-21T05:30:30Z", nowMs, "en");
  assert.equal(shortReset?.countdown, "2h 8m");

  const multiDayReset = formatUsageResetCountdown("2026-11-26T22:30:00Z", nowMs, "en");
  assert.equal(multiDayReset?.countdown, "5d 19h");
});
