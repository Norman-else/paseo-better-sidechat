import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execCommand, type PluginServerContext } from "@getpaseo/plugin/server";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";

type ServerPaseoApi = Parameters<Parameters<PluginServerContext["addHook"]>[1]>[1]["paseo"];
import { resolveEffectiveProviderMode, resolveProviderIconSvg } from "./shared/composer-controls";
import {
  createThreadRpc,
  forgeInfoRpc,
  forgeSearchRpc,
  invokeExternalPluginRpc,
  listAttachmentSourcesRpc,
  listThreadsRpc,
  listTimelinePluginsRpc,
  mainContextRpc,
  preferencesRpc,
  searchAttachmentSourceRpc,
  slashCommandsRpc,
  starterSuggestionsRpc,
  updateThreadRpc,
  uploadFileRpc,
  usageReportsRpc,
  workspaceFilesRpc,
  type SidechatThread,
  type UsageReportCardData,
} from "./shared/contracts";
import {
  buildMainContextDigest,
  composeSidechatPrompt,
  deriveThreadTitle,
  SIDECHAT_EDITABLE_SYSTEM_PROMPT,
  SIDECHAT_READONLY_SYSTEM_PROMPT,
} from "./shared/context";
import {
  DEFAULT_SIDECHAT_SETTINGS,
  sidechatSettings,
  type SidechatSettingsValues,
} from "./shared/settings";
import {
  buildAiStarterGenerationPrompt,
  buildContextualStarterPrompts,
  buildDefaultStarterPrompts,
  buildRecencyWeightedStarterDigest,
  computeMainStarterFingerprint,
  detectConversationLanguage,
  parseAiStarterResponse,
  STARTER_GENERATOR_SYSTEM_PROMPT,
  type StarterPromptItem,
} from "./shared/starters";
import { SidechatAttachmentService } from "./server/attachments";
import { SidechatThreadStore } from "./server/thread-store";

async function loadProviderEntries(
  paseo: ServerPaseoApi,
  cwd: string,
): Promise<ProviderSnapshotEntry[]> {
  try {
    const snap = await paseo.providers.waitForReady({ cwd, timeoutMs: 5_000 });
    return snap.entries ?? [];
  } catch {
    try {
      const snap = await paseo.providers.snapshot({ cwd });
      return snap.entries ?? [];
    } catch {
      return [];
    }
  }
}

async function resolveProviderAndModel(input: {
  paseo: ServerPaseoApi;
  cwd: string;
  entries: ProviderSnapshotEntry[];
  requestedProviderModel?: string;
  parentProvider?: string | null;
  parentModel?: string | null;
  inheritMainModel: boolean;
}): Promise<{
  providerModel: string;
  provider: string;
  model: string;
  providerEntry: ProviderSnapshotEntry | null;
}> {
  const findEntry = (providerId: string) =>
    input.entries.find((e) => e.provider === providerId) ?? null;

  const pickDefaultModelForProvider = async (
    providerId: string,
  ): Promise<string | null> => {
    const entry = findEntry(providerId);
    const snapSelectable = (entry?.models ?? []).filter((m) => m.isSelectable !== false);
    const snapChosen = snapSelectable.find((m) => m.isDefault) ?? snapSelectable[0];
    if (snapChosen) return snapChosen.id;

    try {
      const listed = await input.paseo.providers.listModels(providerId, { cwd: input.cwd });
      const selectable = (listed.models ?? []).filter((m) => m.isSelectable !== false);
      const chosen = selectable.find((m) => m.isDefault) ?? selectable[0];
      return chosen?.id ?? null;
    } catch {
      return null;
    }
  };

  // 1. Explicit `provider/model` selected by the user in Sidechat's model picker
  if (input.requestedProviderModel && input.requestedProviderModel.includes("/")) {
    const slash = input.requestedProviderModel.indexOf("/");
    const provider = input.requestedProviderModel.slice(0, slash);
    const model = input.requestedProviderModel.slice(slash + 1);
    return {
      providerModel: input.requestedProviderModel,
      provider,
      model,
      providerEntry: findEntry(provider),
    };
  }

  // 2. Inherit active main session's provider & model (works for Claude, Codex, Copilot, OpenCode, Kimi, etc.)
  if (input.inheritMainModel && input.parentProvider) {
    const model =
      input.parentModel || (await pickDefaultModelForProvider(input.parentProvider));
    if (model) {
      return {
        providerModel: `${input.parentProvider}/${model}`,
        provider: input.parentProvider,
        model,
        providerEntry: findEntry(input.parentProvider),
      };
    }
  }

  // 3. First enabled & ready provider from Paseo's host snapshot
  for (const entry of input.entries) {
    if (entry.enabled === false) continue;
    const selectable = (entry.models ?? []).filter((m) => m.isSelectable !== false);
    const chosen = selectable.find((m) => m.isDefault) ?? selectable[0];
    if (chosen) {
      return {
        providerModel: `${entry.provider}/${chosen.id}`,
        provider: entry.provider,
        model: chosen.id,
        providerEntry: entry,
      };
    }
  }

  // 4. Fallback via `providers.listAvailable()`
  const available = await input.paseo.providers.listAvailable();
  for (const item of available.providers) {
    if (!item.available) continue;
    const chosenId = await pickDefaultModelForProvider(item.provider);
    if (chosenId) {
      return {
        providerModel: `${item.provider}/${chosenId}`,
        provider: item.provider,
        model: chosenId,
        providerEntry: findEntry(item.provider),
      };
    }
  }

  throw new Error("No available AI model provider found on this Paseo host.");
}

function pickFastStarterModel(input: {
  entries: ProviderSnapshotEntry[];
  preferredProvider?: string | null;
  preferredModel?: string | null;
}): {
  provider: string;
  model: string;
  providerModel: string;
  thinkingOptionId?: string;
  providerEntry: ProviderSnapshotEntry | null;
} | null {
  const fastModelPattern = /\b(haiku|mini|nano|flash|fast|instant|small|lite)\b/i;
  const lowThinkingPattern = /^(off|none|disabled|minimal|low)$/i;

  const chooseFromEntry = (
    entry: ProviderSnapshotEntry,
    fallbackModelId?: string | null,
  ) => {
    const selectable = (entry.models ?? []).filter((m) => m.isSelectable !== false);
    if (selectable.length === 0 && !fallbackModelId) return null;

    const fastMatch = selectable.find(
      (m) => fastModelPattern.test(m.id) || fastModelPattern.test(m.label || ""),
    );
    const preferredMatch = fallbackModelId
      ? selectable.find((m) => m.id === fallbackModelId)
      : undefined;
    const defaultMatch = selectable.find((m) => m.isDefault) ?? selectable[0];
    const chosen = fastMatch ?? preferredMatch ?? defaultMatch;
    const modelId = chosen?.id ?? fallbackModelId;
    if (!modelId) return null;

    const lowThinking = (chosen?.thinkingOptions ?? []).find(
      (opt) => lowThinkingPattern.test(opt.id) || lowThinkingPattern.test(opt.label || ""),
    );

    return {
      provider: entry.provider,
      model: modelId,
      providerModel: `${entry.provider}/${modelId}`,
      thinkingOptionId: lowThinking?.id,
      providerEntry: entry,
    };
  };

  if (input.preferredProvider) {
    const preferredEntry = input.entries.find(
      (e) => e.provider === input.preferredProvider && e.enabled !== false,
    );
    if (preferredEntry) {
      const picked = chooseFromEntry(preferredEntry, input.preferredModel);
      if (picked) return picked;
    }
  }

  for (const entry of input.entries) {
    if (entry.enabled === false) continue;
    const picked = chooseFromEntry(entry, null);
    if (picked) return picked;
  }

  if (input.preferredProvider && input.preferredModel) {
    return {
      provider: input.preferredProvider,
      model: input.preferredModel,
      providerModel: `${input.preferredProvider}/${input.preferredModel}`,
      providerEntry: null,
    };
  }

  return null;
}

function resolvePaseoCliBin(): string {
  const candidates = [
    join(homedir(), ".local", "bin", "paseo"),
    "/Applications/Paseo.app/Contents/Resources/bin/paseo",
    "/usr/local/bin/paseo",
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  return "paseo";
}

function normalizeRawUsageEntries(rawList: unknown[]): UsageReportCardData[] {
  const cards: UsageReportCardData[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const sourceId = typeof item.sourceId === "string" ? item.sourceId : "";
    if (!sourceId) continue;
    const sourceLabel =
      typeof item.sourceLabel === "string" && item.sourceLabel
        ? item.sourceLabel
        : sourceId;
    const rawIcon = typeof item.icon === "string" ? item.icon.trim() : null;
    const iconSvg = resolveProviderIconSvg(sourceId, rawIcon);
    const accountObj =
      item.account && typeof item.account === "object"
        ? (item.account as Record<string, unknown>)
        : null;
    const accountLabel =
      accountObj && typeof accountObj.label === "string" && accountObj.label.trim()
        ? accountObj.label.trim()
        : null;
    const reportObj =
      item.report && typeof item.report === "object"
        ? (item.report as Record<string, unknown>)
        : {};
    const status =
      reportObj.status === "available" || reportObj.status === "error"
        ? reportObj.status
        : "unavailable";
    const planLabel =
      typeof reportObj.planLabel === "string" && reportObj.planLabel.trim()
        ? reportObj.planLabel.trim()
        : null;

    const windows = Array.isArray(reportObj.windows)
      ? reportObj.windows
          .filter((w): w is Record<string, unknown> => Boolean(w && typeof w === "object"))
          .map((w) => ({
            id: String(w.id ?? ""),
            label: String(w.label ?? w.id ?? ""),
            shortLabel: typeof w.shortLabel === "string" ? w.shortLabel : undefined,
            usedPct: typeof w.usedPct === "number" ? w.usedPct : null,
            remainingPct: typeof w.remainingPct === "number" ? w.remainingPct : null,
            resetsAt: typeof w.resetsAt === "string" ? w.resetsAt : null,
            runsOutAt: typeof w.runsOutAt === "string" ? w.runsOutAt : null,
            tone:
              w.tone === "ok" ||
              w.tone === "warning" ||
              w.tone === "danger" ||
              w.tone === "default"
                ? (w.tone as "ok" | "warning" | "danger" | "default")
                : undefined,
          }))
      : [];

    const balances = Array.isArray(reportObj.balances)
      ? reportObj.balances
          .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === "object"))
          .map((b) => ({
            id: String(b.id ?? ""),
            label: String(b.label ?? b.id ?? ""),
            used: typeof b.used === "number" ? b.used : null,
            remaining: typeof b.remaining === "number" ? b.remaining : null,
            limit: typeof b.limit === "number" ? b.limit : null,
            unit: (
              b.unit === "usd" ||
              b.unit === "credits" ||
              b.unit === "requests" ||
              b.unit === "tokens"
                ? b.unit
                : "credits"
            ) as "tokens" | "usd" | "credits" | "requests",
            resetsAt: typeof b.resetsAt === "string" ? b.resetsAt : null,
            tone:
              b.tone === "ok" ||
              b.tone === "warning" ||
              b.tone === "danger" ||
              b.tone === "default"
                ? (b.tone as "ok" | "warning" | "danger" | "default")
                : undefined,
          }))
      : [];

    const details = Array.isArray(reportObj.details)
      ? reportObj.details
          .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === "object"))
          .map((d) => ({
            id: String(d.id ?? d.label ?? ""),
            label: String(d.label ?? ""),
            value: String(d.value ?? ""),
            tone:
              d.tone === "ok" ||
              d.tone === "warning" ||
              d.tone === "danger" ||
              d.tone === "default"
                ? (d.tone as "ok" | "warning" | "danger" | "default")
                : undefined,
          }))
      : [];

    let errorMessage: string | null = null;
    if (status === "error" && typeof reportObj.error === "string") {
      errorMessage = reportObj.error;
    } else if (
      status === "unavailable" &&
      reportObj.problem &&
      typeof reportObj.problem === "object"
    ) {
      const prob = reportObj.problem as Record<string, unknown>;
      if (prob.kind === "expired") {
        errorMessage = "Session login expired";
      } else if (prob.kind === "no_quota" && typeof prob.detail === "string") {
        errorMessage = prob.detail;
      }
    }

    cards.push({
      id: typeof item.id === "string" ? item.id : sourceId,
      sourceId,
      sourceLabel,
      iconSvg,
      accountLabel,
      status,
      planLabel,
      windows,
      balances,
      details,
      errorMessage,
      fetchedAt:
        typeof item.successfulAt === "string"
          ? item.successfulAt
          : typeof item.fetchedAt === "string"
            ? item.fetchedAt
            : null,
    });
  }
  return cards;
}

export default function contribute(server: PluginServerContext) {
  const settingsHandle = server.registerSettings(sidechatSettings);
  const store = new SidechatThreadStore();
  const attachmentService = new SidechatAttachmentService(resolvePaseoCliBin);
  let cachedUsageAtMs = 0;
  let cachedUsageCards: UsageReportCardData[] | null = null;
  const aiStarterCache = new Map<string, StarterPromptItem[]>();
  const inFlightAiStarters = new Map<string, Promise<StarterPromptItem[] | null>>();

  const rememberAiStarters = (key: string, items: StarterPromptItem[]) => {
    if (aiStarterCache.has(key)) {
      aiStarterCache.delete(key);
    }
    aiStarterCache.set(key, items);
    while (aiStarterCache.size > 60) {
      const oldest = aiStarterCache.keys().next().value;
      if (oldest === undefined) break;
      aiStarterCache.delete(oldest);
    }
  };

  const readSettings = async (): Promise<SidechatSettingsValues> => {
    try {
      const state = await settingsHandle.read();
      return state.status === "ready" ? state.values : DEFAULT_SIDECHAT_SETTINGS;
    } catch {
      return DEFAULT_SIDECHAT_SETTINGS;
    }
  };

  server.handle(preferencesRpc, async () => readSettings());

  server.handle(listThreadsRpc, async ({ workspaceId, parentAgentId }, { paseo }) => {
    const stored = await store.list({ workspaceId, parentAgentId });
    const refreshed = await Promise.all(
      stored.map(async (record): Promise<SidechatThread | null> => {
        try {
          const live = await paseo.agents.ref(record.agentId).refresh();
          if (!live?.agent || live.agent.archivedAt) {
            await store.patch(record.agentId, { archived: true });
            return null;
          }
          const agent = live.agent;
          const synced: SidechatThread = {
            agentId: record.agentId,
            workspaceId: record.workspaceId,
            parentAgentId: record.parentAgentId,
            title: record.title || agent.title || "Sidechat",
            cwd: agent.cwd || record.cwd,
            provider: agent.provider || record.provider,
            model: agent.model ?? record.model,
            modeId: agent.currentModeId ?? record.modeId,
            thinkingOptionId:
              agent.effectiveThinkingOptionId ?? agent.thinkingOptionId ?? record.thinkingOptionId,
            status: agent.status,
            createdAt: record.createdAt,
            updatedAt: agent.updatedAt > record.updatedAt ? agent.updatedAt : record.updatedAt,
          };
          return synced;
        } catch {
          return {
            agentId: record.agentId,
            workspaceId: record.workspaceId,
            parentAgentId: record.parentAgentId,
            title: record.title,
            cwd: record.cwd,
            provider: record.provider,
            model: record.model,
            modeId: record.modeId,
            thinkingOptionId: record.thinkingOptionId,
            status: record.status,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          };
        }
      }),
    );

    return {
      threads: refreshed.filter((item): item is SidechatThread => item !== null),
    };
  });

  server.handle(mainContextRpc, async ({ agentId, maxTurns }, { paseo }) => {
    try {
      const prefs = await readSettings();
      const timeline = await paseo.agents.ref(agentId).timeline.refetch({
        direction: "tail",
        limit: 140,
      });
      if (timeline.error || !timeline.agent) {
        return {
          available: false,
          error: timeline.error ?? "Main session is unavailable.",
        };
      }
      const digest = buildMainContextDigest({
        agentId,
        title: timeline.agent.title,
        provider: timeline.agent.provider,
        model: timeline.agent.model,
        cwd: timeline.agent.cwd,
        status: timeline.agent.status,
        entries: timeline.entries,
        maxTurns: maxTurns ?? prefs.contextTurns,
      });
      return { available: true, digest };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : "Failed to inspect main session.",
      };
    }
  });

  server.handle(createThreadRpc, async (input, { paseo }) => {
    const prefs = await readSettings();
    let parentSnapshot: Awaited<ReturnType<ReturnType<ServerPaseoApi["agents"]["ref"]>["refresh"]>> = null;
    if (input.parentAgentId) {
      try {
        parentSnapshot = await paseo.agents.ref(input.parentAgentId).refresh();
      } catch {
        parentSnapshot = null;
      }
    }

    const parentAgent = parentSnapshot?.agent ?? null;
    const effectiveCwd = parentAgent?.cwd || input.cwd;
    const providerEntries = await loadProviderEntries(paseo, effectiveCwd);

    const { providerModel, provider, model, providerEntry } = await resolveProviderAndModel({
      paseo,
      cwd: effectiveCwd,
      entries: providerEntries,
      requestedProviderModel: input.providerModel,
      parentProvider: parentAgent?.provider,
      parentModel: parentAgent?.model,
      inheritMainModel: prefs.inheritMainModel,
    });

    let availableModes = providerEntry?.modes;
    if (!availableModes) {
      try {
        const modeRes = await paseo.providers.listModes(provider, { cwd: effectiveCwd });
        availableModes = modeRes.modes;
      } catch {
        availableModes = undefined;
      }
    }

    const resolvedModeId = resolveEffectiveProviderMode({
      provider,
      requestedModeId: input.modeId,
      parentProvider: parentAgent?.provider,
      parentModeId: parentAgent?.currentModeId,
      defaultPermissionMode: prefs.defaultPermissionMode,
      availableModes,
      providerDefaultModeId: providerEntry?.defaultModeId,
    });

    const resolvedThinkingId =
      input.thinkingOptionId !== undefined
        ? input.thinkingOptionId || undefined
        : parentAgent?.provider === provider
          ? (parentAgent.effectiveThinkingOptionId ?? parentAgent.thinkingOptionId ?? undefined)
          : undefined;

    let mainContextText: string | null = null;
    if (input.attachMainContext && input.parentAgentId) {
      try {
        const timeline = await paseo.agents.ref(input.parentAgentId).timeline.refetch({
          direction: "tail",
          limit: 140,
        });
        if (!timeline.error && timeline.agent) {
          mainContextText = buildMainContextDigest({
            agentId: input.parentAgentId,
            title: timeline.agent.title,
            provider: timeline.agent.provider,
            model: timeline.agent.model,
            cwd: timeline.agent.cwd,
            status: timeline.agent.status,
            entries: timeline.entries,
            maxTurns: prefs.contextTurns,
          }).digest;
        }
      } catch {
        mainContextText = null;
      }
    }

    const sentPrompt = composeSidechatPrompt({
      text: input.prompt,
      mainContext: mainContextText,
      quotedSelection: input.quotedSelection,
    });

    const title = deriveThreadTitle(input.prompt || input.titleSeed || "", "Sidechat");
    const now = new Date().toISOString();

    const createAgentWithOptions = async (includeUserOptions: boolean) => {
      const mergedOptions: Record<string, unknown> = {};
      if (parentAgent?.provider === provider && parentAgent.options) {
        for (const [k, v] of Object.entries(parentAgent.options)) {
          if (k === "extraArgs") continue;
          if (v !== undefined) mergedOptions[k] = v;
        }
      }
      if (prefs.skipExternalMcp && provider === "claude") {
        mergedOptions.extraArgs = { "strict-mcp-config": null };
      }
      if (includeUserOptions) {
        if (input.providerOptions) {
          for (const [k, v] of Object.entries(input.providerOptions)) {
            if (v !== undefined) mergedOptions[k] = v;
          }
        }
        if (input.fastMode !== undefined && provider === "claude") {
          mergedOptions.fast_mode = input.fastMode;
        }
      }

      const sharedCreatePayload = {
        background: true,
        ...(input.parentAgentId ? { parent: input.parentAgentId } : {}),
        title,
        labels: {
          "paseo-better-sidechat": "1",
          "paseo-better-sidechat.workspaceId": input.workspaceId,
          ...(input.parentAgentId
            ? { "paseo-better-sidechat.parentAgentId": input.parentAgentId }
            : {}),
        },
        metadata: {
          "paseo-better-sidechat": {
            workspaceId: input.workspaceId,
            parentAgentId: input.parentAgentId ?? null,
          },
        },
        config: {
          provider: providerModel,
          ...(resolvedModeId ? { modeId: resolvedModeId } : {}),
          ...(resolvedThinkingId ? { thinkingOptionId: resolvedThinkingId } : {}),
          ...(prefs.skipExternalMcp && provider === "claude" ? { mcpServers: {} } : {}),
          ...(Object.keys(mergedOptions).length > 0 ? { options: mergedOptions } : {}),
          systemPrompt: prefs.readOnlyGuard
            ? SIDECHAT_READONLY_SYSTEM_PROMPT
            : SIDECHAT_EDITABLE_SYSTEM_PROMPT,
        },
        ...(!input.deferInitialSend ? { prompt: sentPrompt } : {}),
        ...(!input.deferInitialSend && input.clientMessageId
          ? { clientMessageId: input.clientMessageId }
          : {}),
      };

      // Create inside the same Paseo workspace so workspace-level MCP servers, skills, and env
      // match the main conversation 1:1; fall back to `paseo.agents.create({ cwd })` if needed.
      if (input.workspaceId && !parentAgent?.cwd) {
        try {
          return await paseo.workspaces.ref(input.workspaceId).agents.create(sharedCreatePayload);
        } catch {
          // Fall back to explicit `cwd` creation below.
        }
      }

      return paseo.agents.create({
        cwd: effectiveCwd,
        ...sharedCreatePayload,
      });
    };

    const hasCustomOptions =
      Boolean(input.fastMode) ||
      Boolean(input.providerOptions && Object.keys(input.providerOptions).length > 0);

    let handle: Awaited<ReturnType<typeof createAgentWithOptions>>;
    try {
      handle = await createAgentWithOptions(true);
    } catch (error) {
      if (hasCustomOptions) {
        handle = await createAgentWithOptions(false);
      } else {
        throw error;
      }
    }

    const snapshot = handle.current();
    const thread: SidechatThread = {
      agentId: handle.id,
      workspaceId: input.workspaceId,
      parentAgentId: input.parentAgentId ?? null,
      title,
      cwd: snapshot?.cwd || effectiveCwd,
      provider: snapshot?.provider || provider,
      model: snapshot?.model ?? model,
      modeId: snapshot?.currentModeId ?? resolvedModeId ?? null,
      thinkingOptionId:
        snapshot?.effectiveThinkingOptionId ??
        snapshot?.thinkingOptionId ??
        resolvedThinkingId ??
        null,
      status: snapshot?.status ?? "running",
      createdAt: snapshot?.createdAt ?? now,
      updatedAt: snapshot?.updatedAt ?? now,
    };

    await store.upsert(thread);
    return { thread, sentPrompt };
  });

  server.handle(updateThreadRpc, async (input, { paseo }) => {
    const now = new Date().toISOString();
    if (input.action === "rename" && input.title) {
      await store.patch(input.agentId, {
        title: input.title.trim(),
        updatedAt: now,
      });
      return { ok: true };
    }
    if (input.action === "touch") {
      await store.patch(input.agentId, { updatedAt: now });
      return { ok: true };
    }
    if (input.action === "archive") {
      await store.patch(input.agentId, { archived: true, updatedAt: now });
      await paseo.agents
        .ref(input.agentId)
        .archive()
        .catch(() => {});
      return { ok: true };
    }
    return { ok: false };
  });

  server.handle(usageReportsRpc, async ({ provider, agentId, forceRefresh }, { paseo }) => {
    const matchesProvider = (card: UsageReportCardData) => {
      const src = card.sourceId.toLowerCase();
      const target = provider.toLowerCase();
      return src === target || target.startsWith(`${src}-`) || src.startsWith(`${target}-`);
    };

    const bin = resolvePaseoCliBin();

    // 1. If tied to a live agent, try agent-scoped usage first when refreshing or available.
    if (agentId) {
      try {
        const args = ["usage", "--agent", agentId, "--json", ...(forceRefresh ? ["--refresh"] : [])];
        const res = await execCommand(bin, args, { timeout: 12_000 });
        const parsed = JSON.parse(res.stdout);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { reports: normalizeRawUsageEntries(parsed) };
        }
      } catch {
        // Fall back to host-level usage reports filtered by provider.
      }
    }

    // 2. Host-level usage reports (with 45s cache unless `forceRefresh: true`).
    if (!forceRefresh && cachedUsageCards && Date.now() - cachedUsageAtMs < 45_000) {
      return { reports: cachedUsageCards.filter(matchesProvider) };
    }

    try {
      const args = ["usage", "--json", ...(forceRefresh ? ["--refresh"] : [])];
      const res = await execCommand(bin, args, { timeout: 15_000 });
      const parsed = JSON.parse(res.stdout);
      if (Array.isArray(parsed)) {
        const normalized = normalizeRawUsageEntries(parsed);
        cachedUsageCards = normalized;
        cachedUsageAtMs = Date.now();
        return { reports: normalized.filter(matchesProvider) };
      }
    } catch {
      // Fall back to `paseo.providers.listUsage()` below.
    }

    try {
      const legacy = await paseo.providers.listUsage();
      const converted: UsageReportCardData[] = (legacy.providers ?? []).map((p) => ({
        id: p.providerId,
        sourceId: p.providerId,
        sourceLabel: p.displayName,
        iconSvg: resolveProviderIconSvg(p.providerId),
        accountLabel: null,
        status: p.status,
        planLabel: p.planLabel ?? null,
        windows: (p.windows ?? []).map((w) => ({
          id: w.id,
          label: w.label,
          shortLabel: w.shortLabel,
          usedPct: w.usedPct ?? null,
          remainingPct: w.remainingPct ?? null,
          resetsAt: w.resetsAt ?? null,
          runsOutAt: w.runsOutAt ?? null,
          tone: w.tone,
        })),
        balances: (p.balances ?? []).map((b) => ({
          id: b.id,
          label: b.label,
          used: b.used ?? null,
          remaining: b.remaining ?? null,
          limit: b.limit ?? null,
          unit: b.unit,
          resetsAt: b.resetsAt ?? null,
          tone: b.tone,
        })),
        details: (p.details ?? []).map((d) => ({
          id: d.id,
          label: d.label,
          value: d.value,
          tone: d.tone,
        })),
        errorMessage: p.error ?? null,
        fetchedAt: p.fetchedAt ?? legacy.fetchedAt ?? null,
      }));
      cachedUsageCards = converted;
      cachedUsageAtMs = Date.now();
      return { reports: converted.filter(matchesProvider) };
    } catch {
      return { reports: [] };
    }
  });

  server.handle(forgeInfoRpc, async ({ cwd }) => attachmentService.getForgeInfo(cwd));

  server.handle(forgeSearchRpc, async ({ cwd, query }) =>
    attachmentService.searchForge({ cwd, query }),
  );

  server.handle(listAttachmentSourcesRpc, async ({ locale }) => ({
    sources: await attachmentService.listPluginAttachmentSources(locale),
  }));

  server.handle(searchAttachmentSourceRpc, async ({ pluginId, searchMethod, query }) =>
    attachmentService.searchPluginAttachmentSource({ pluginId, searchMethod, query }),
  );

  server.handle(uploadFileRpc, async ({ fileName, mimeType, dataBase64 }) => ({
    attachment: await attachmentService.uploadFile({ fileName, mimeType, dataBase64 }),
  }));

  server.handle(workspaceFilesRpc, async ({ cwd, query, limit }) =>
    attachmentService.searchWorkspaceFiles({ cwd, query, limit }),
  );

  server.handle(slashCommandsRpc, async (input, { paseo }) => ({
    commands: await attachmentService.listCommandsAndSkills({
      paseo,
      cwd: input.cwd,
      provider: input.provider,
      model: input.model,
      modeId: input.modeId,
      thinkingOptionId: input.thinkingOptionId,
      sideAgentId: input.sideAgentId,
      mainAgentId: input.mainAgentId,
    }),
  }));

  server.handle(listTimelinePluginsRpc, async () => ({
    plugins: await attachmentService.listTimelinePluginBundles(),
  }));

  server.handle(invokeExternalPluginRpc, async ({ pluginId, method, params }) => ({
    output: await attachmentService.invokeExternalPlugin({ pluginId, method, params }),
  }));

  server.handle(
    starterSuggestionsRpc,
    async (
      { agentId, workspaceId, locale, mode, forceRefresh },
      { paseo },
    ): Promise<{
      starters: StarterPromptItem[];
      source: "default" | "contextual" | "ai";
      canRefineWithAi: boolean;
      cacheKey: string | null;
    }> => {
      try {
        const timeline = await paseo.agents.ref(agentId).timeline.refetch({
          direction: "tail",
          limit: 120,
        });

        if (timeline.error || !timeline.agent) {
          return {
            starters: buildDefaultStarterPrompts(locale),
            source: "default",
            canRefineWithAi: false,
            cacheKey: null,
          };
        }

        const hasMessages = timeline.entries.some(
          (e) =>
            (e.item.type === "user_message" && e.item.text.trim().length > 0) ||
            (e.item.type === "assistant_message" && e.item.text.trim().length > 0),
        );

        if (!hasMessages) {
          return {
            starters: buildDefaultStarterPrompts(locale),
            source: "default",
            canRefineWithAi: false,
            cacheKey: null,
          };
        }

        const cacheKey = computeMainStarterFingerprint(
          agentId,
          timeline.agent.status,
          timeline.entries,
        );

        if (!forceRefresh) {
          const cached = aiStarterCache.get(cacheKey);
          if (cached && cached.length > 0) {
            rememberAiStarters(cacheKey, cached);
            return {
              starters: cached,
              source: "ai",
              canRefineWithAi: false,
              cacheKey,
            };
          }
        }

        const contextual = buildContextualStarterPrompts({
          title: timeline.agent.title,
          status: timeline.agent.status,
          entries: timeline.entries,
          fallbackLocale: locale,
        });

        if (mode === "instant") {
          return {
            starters: contextual,
            source: "contextual",
            canRefineWithAi: true,
            cacheKey,
          };
        }

        const generateWithFastModel = async (): Promise<StarterPromptItem[] | null> => {
          const effectiveCwd = timeline.agent!.cwd || homedir();
          const mainWorkspaceId = timeline.agent!.workspaceId ?? null;
          const providerEntries = await loadProviderEntries(paseo, effectiveCwd);
          const picked = pickFastStarterModel({
            entries: providerEntries,
            preferredProvider: timeline.agent!.provider,
            preferredModel: timeline.agent!.model,
          });
          if (!picked) return null;

          const resolvedModeId = resolveEffectiveProviderMode({
            provider: picked.provider,
            defaultPermissionMode: "plan",
            availableModes: picked.providerEntry?.modes,
            providerDefaultModeId: picked.providerEntry?.defaultModeId,
          });

          const starterDigest = buildRecencyWeightedStarterDigest({
            title: timeline.agent!.title,
            cwd: effectiveCwd,
            status: timeline.agent!.status,
            entries: timeline.entries,
          });
          const { languageTag } = detectConversationLanguage(timeline.entries, locale);
          const prompt = buildAiStarterGenerationPrompt({
            latestTurnBlock: starterDigest.latestTurnBlock,
            earlierBackgroundBlock: starterDigest.earlierBackgroundBlock,
            languageTag,
          });

          let tempHandle: Awaited<ReturnType<ServerPaseoApi["agents"]["create"]>> | null = null;
          let tempWorkspaceId: string | null = null;

          try {
            tempHandle = await paseo.agents.create({
              cwd: effectiveCwd,
              background: true,
              autoArchive: true,
              title: "Sidechat Follow-up Suggestions",
              labels: {
                "paseo-better-sidechat.ephemeral": "starters",
              },
              config: {
                provider: picked.providerModel,
                ...(resolvedModeId ? { modeId: resolvedModeId } : {}),
                ...(picked.thinkingOptionId ? { thinkingOptionId: picked.thinkingOptionId } : {}),
                mcpServers: {},
                ...(picked.provider === "claude"
                  ? { options: { extraArgs: { "strict-mcp-config": null } } }
                  : {}),
                systemPrompt: STARTER_GENERATOR_SYSTEM_PROMPT,
              },
              prompt,
            });

            tempWorkspaceId = tempHandle.current()?.workspaceId ?? tempHandle.workspaceId ?? null;
            const finished = await tempHandle.waitForFinish(16_000);
            let rawText = finished.lastMessage?.trim() ?? "";

            if (!rawText) {
              const tail = await tempHandle.timeline
                .refetch({ direction: "tail", limit: 10 })
                .catch(() => null);
              if (tail && !tail.error) {
                for (let i = tail.entries.length - 1; i >= 0; i--) {
                  const item = tail.entries[i]?.item;
                  if (item?.type === "assistant_message" && item.text.trim()) {
                    rawText = item.text.trim();
                    break;
                  }
                }
              }
            }

            const parsed = rawText ? parseAiStarterResponse(rawText) : null;
            if (!parsed || parsed.length === 0) return null;

            // Pad to 4 items using non-duplicate contextual items if the model returned 2–3.
            const merged = [...parsed];
            for (const item of contextual) {
              if (merged.length >= 4) break;
              if (!merged.some((m) => m.title === item.title)) {
                merged.push(item);
              }
            }
            return merged.slice(0, 4);
          } catch {
            return null;
          } finally {
            if (tempHandle) {
              const finalWsId =
                tempHandle.current()?.workspaceId ?? tempHandle.workspaceId ?? tempWorkspaceId;
              await tempHandle.archive().catch(() => {});
              if (
                finalWsId &&
                finalWsId !== workspaceId &&
                finalWsId !== mainWorkspaceId
              ) {
                await paseo.workspaces
                  .ref(finalWsId)
                  .archive()
                  .catch(() => {});
              }
            }
          }
        };

        let aiPromise = !forceRefresh ? inFlightAiStarters.get(cacheKey) : undefined;
        if (!aiPromise) {
          const promiseKey = forceRefresh ? `${cacheKey}:refresh:${Date.now()}` : cacheKey;
          aiPromise = generateWithFastModel().finally(() => {
            inFlightAiStarters.delete(promiseKey);
          });
          inFlightAiStarters.set(promiseKey, aiPromise);
        }

        const aiItems = await aiPromise;
        if (aiItems && aiItems.length > 0) {
          rememberAiStarters(cacheKey, aiItems);
          return {
            starters: aiItems,
            source: "ai",
            canRefineWithAi: false,
            cacheKey,
          };
        }

        return {
          starters: contextual,
          source: "contextual",
          canRefineWithAi: false,
          cacheKey,
        };
      } catch {
        return {
          starters: buildDefaultStarterPrompts(locale),
          source: "default",
          canRefineWithAi: false,
          cacheKey: null,
        };
      }
    },
  );

  server.addHook("workspace.archive.after", async ({ workspace }, { paseo }) => {
    const archivedIds = await store.archiveWorkspace(workspace.id);
    await Promise.allSettled(
      archivedIds.map((agentId) => paseo.agents.ref(agentId).archive()),
    );
  });

  return () => attachmentService.close();
}
