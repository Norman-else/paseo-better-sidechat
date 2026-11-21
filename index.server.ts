import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
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

async function resolveProviderAndModel(input: {
  paseo: PaseoApi;
  cwd: string;
  requestedProviderModel?: string;
  parentProvider?: string | null;
  parentModel?: string | null;
  preferClaude: boolean;
}): Promise<{ providerModel: string; provider: string; model: string }> {
  if (input.requestedProviderModel && input.requestedProviderModel.includes("/")) {
    const slash = input.requestedProviderModel.indexOf("/");
    return {
      providerModel: input.requestedProviderModel,
      provider: input.requestedProviderModel.slice(0, slash),
      model: input.requestedProviderModel.slice(slash + 1),
    };
  }

  if (input.parentProvider === "claude" && input.parentModel) {
    return {
      providerModel: `claude/${input.parentModel}`,
      provider: "claude",
      model: input.parentModel,
    };
  }

  if (input.preferClaude || !input.parentProvider) {
    try {
      const claudeModels = await input.paseo.providers.listModels("claude", { cwd: input.cwd });
      const selectable = (claudeModels.models ?? []).filter((m) => m.isSelectable !== false);
      const chosen = selectable.find((m) => m.isDefault) ?? selectable[0];
      if (chosen) {
        return {
          providerModel: `claude/${chosen.id}`,
          provider: "claude",
          model: chosen.id,
        };
      }
    } catch {
      // Fall through to parent provider or available providers.
    }
  }

  if (input.parentProvider && input.parentModel) {
    return {
      providerModel: `${input.parentProvider}/${input.parentModel}`,
      provider: input.parentProvider,
      model: input.parentModel,
    };
  }

  const available = await input.paseo.providers.listAvailable();
  const candidates = [...available.providers].sort((a, b) =>
    a.provider === "claude" ? -1 : b.provider === "claude" ? 1 : 0,
  );
  for (const entry of candidates) {
    if (!entry.available) continue;
    try {
      const listed = await input.paseo.providers.listModels(entry.provider, { cwd: input.cwd });
      const selectable = (listed.models ?? []).filter((m) => m.isSelectable !== false);
      const chosen = selectable.find((m) => m.isDefault) ?? selectable[0];
      if (chosen) {
        return {
          providerModel: `${entry.provider}/${chosen.id}`,
          provider: entry.provider,
          model: chosen.id,
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error("No available AI model provider found on this Paseo host.");
}

function resolveModeId(input: {
  provider: string;
  requestedModeId?: string | null;
  parentProvider?: string | null;
  parentModeId?: string | null;
  settings: SidechatSettingsValues;
}): string | undefined {
  if (input.requestedModeId) return input.requestedModeId;
  if (input.provider === "claude") {
    switch (input.settings.defaultClaudeMode) {
      case "plan":
        return "plan";
      case "default":
        return "default";
      case "inherit":
        return input.parentProvider === "claude" && input.parentModeId ? input.parentModeId : "auto";
      case "auto":
      default:
        return "auto";
    }
  }
  if (input.parentProvider === input.provider && input.parentModeId) {
    return input.parentModeId;
  }
  return undefined;
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

    const { providerModel, provider, model } = await resolveProviderAndModel({
      paseo,
      cwd: effectiveCwd,
      requestedProviderModel: input.providerModel,
      parentProvider: parentAgent?.provider,
      parentModel: parentAgent?.model,
      preferClaude: prefs.preferClaudeProvider,
    });

    const resolvedModeId = resolveModeId({
      provider,
      requestedModeId: input.modeId,
      parentProvider: parentAgent?.provider,
      parentModeId: parentAgent?.currentModeId,
      settings: prefs,
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

    const handle = await paseo.agents.create({
      cwd: effectiveCwd,
      background: true,
      ...(input.parentAgentId ? { parent: input.parentAgentId } : {}),
      title,
      labels: {
        "paseo-better-sidechat": "1",
        "paseo-better-sidechat.workspaceId": input.workspaceId,
        ...(input.parentAgentId ? { "paseo-better-sidechat.parentAgentId": input.parentAgentId } : {}),
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
        ...(prefs.fastStartup && provider === "claude"
          ? {
              mcpServers: {},
              options: { extraArgs: { "strict-mcp-config": null } },
            }
          : {}),
        systemPrompt: prefs.readOnlyGuard
          ? SIDECHAT_READONLY_SYSTEM_PROMPT
          : SIDECHAT_EDITABLE_SYSTEM_PROMPT,
      },
      ...(!input.deferInitialSend ? { prompt: sentPrompt } : {}),
      ...(!input.deferInitialSend && input.clientMessageId
        ? { clientMessageId: input.clientMessageId }
        : {}),
    });

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
