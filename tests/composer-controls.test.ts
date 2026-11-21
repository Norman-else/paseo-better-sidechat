import assert from "node:assert/strict";
import test from "node:test";
import { findSvgIconProblem } from "@getpaseo/plugin";
import {
  buildContextRingSvg,
  BUILTIN_PROVIDER_SVGS,
  CLAUDE_ICON_SVG,
  CODEX_ICON_SVG,
  formatContextUsageSummary,
  formatProviderLabel,
  formatShortModelLabel,
  formatShortModeLabel,
  formatShortThinkingLabel,
  resolveContextUsageRatio,
  resolveEffectiveProviderMode,
  resolveModeIconName,
  resolveProviderIconSvg,
  resolveToolbarDensity,
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

test("sidechatSettings v2 migration preserves user preferences while upgrading defaultClaudeMode", () => {
  const migrated = sidechatSettings.migrate?.(
    {
      defaultContextMode: "always",
      contextTurns: 10,
      defaultClaudeMode: "plan",
      preferClaudeProvider: true,
      readOnlyGuard: false,
    },
    1,
  ) as Record<string, unknown>;
  assert.equal(migrated.defaultPermissionMode, "plan");
  assert.equal(migrated.inheritMainModel, true);
  assert.equal(migrated.defaultContextMode, "always");
  assert.equal(migrated.readOnlyGuard, false);
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
