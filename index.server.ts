import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { resolveEffectiveProviderMode } from "./shared/composer-controls";
import {
  createThreadRpc,
  listThreadsRpc,
  mainContextRpc,
  preferencesRpc,
  updateThreadRpc,
  type SidechatThread,
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
import { SidechatThreadStore } from "./server/thread-store";

async function loadProviderEntries(
  paseo: PaseoApi,
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
  paseo: PaseoApi;
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

export default function contribute(server: PluginServerContext) {
  const settingsHandle = server.registerSettings(sidechatSettings);
  const store = new SidechatThreadStore();

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
    let parentSnapshot: Awaited<ReturnType<ReturnType<PaseoApi["agents"]["ref"]>["refresh"]>> = null;
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

    const title = deriveThreadTitle(input.prompt, "Sidechat");
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

  server.addHook("workspace.archive.after", async ({ workspace }, { paseo }) => {
    const archivedIds = await store.archiveWorkspace(workspace.id);
    await Promise.allSettled(
      archivedIds.map((agentId) => paseo.agents.ref(agentId).archive()),
    );
  });

  return () => {};
}
