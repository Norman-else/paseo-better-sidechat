import type {
  PluginButtonRegistration,
  PluginClientContext,
  PluginText,
  PluginWorkspaceCommandContext,
} from "@getpaseo/plugin/client";
import {
  enqueueSidechatHandoff,
  subscribeComposerPillPreference,
} from "./client/handoff";
import { messages } from "./client/messages";
import { SidechatSettingsScreen } from "./client/settings-screen";
import {
  SidechatAgentPanel,
  SidechatWorkspacePanel,
} from "./client/sidechat-panel";
import { preferencesRpc } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  type ObservedAgent = {
    id: string;
    workspaceId?: string | null;
    background?: boolean;
    archivedAt?: string | null;
    updatedAt?: string;
    labels?: Record<string, string>;
  };

  const pills = new Map<string, PluginButtonRegistration<PluginText>>();
  const knownAgents = new Map<string, ObservedAgent>();
  let pillEnabled = true;
  const lifetime = new AbortController();

  client.addAgentPanel({
    id: "better-sidechat",
    title: messages.message("panelTitle"),
    icon: "MessagesSquare",
    locations: ["explorer", "workspace"],
    Component: SidechatAgentPanel,
  });

  client.addWorkspacePanel({
    id: "workspace-sidechat",
    title: messages.message("workspacePanelTitle"),
    icon: "MessagesSquare",
    locations: ["explorer", "workspace"],
    Component: SidechatWorkspacePanel,
  });

  client.addSettingsScreen({
    id: "preferences",
    title: messages.message("settingsTitle"),
    icon: "MessagesSquare",
    Component: SidechatSettingsScreen,
  });

  client.addCommandCenterItem({
    id: "open-sidechat",
    title: messages.message("openSidechat"),
    icon: "MessagesSquare",
    keywords: ["btw", "sidechat", "claude", "side", "chat", "ask", "侧边", "聊天", "提问"],
    context: "agent",
    onSelect: ({ openPanel }) => {
      openPanel("better-sidechat", { location: "explorer" });
    },
  });

  client.addCommandCenterItem({
    id: "new-sidechat",
    title: messages.message("newSidechat"),
    icon: "SquarePen",
    keywords: ["btw", "sidechat", "new", "claude", "新建", "侧边", "聊天"],
    context: "agent",
    onSelect: ({ openPanel, workspace, agent }) => {
      enqueueSidechatHandoff(
        { workspaceId: workspace.id, agentId: agent.id },
        { kind: "new_thread" },
      );
      openPanel("better-sidechat", { location: "explorer" });
    },
  });

  client.addCommandCenterItem({
    id: "open-workspace-sidechat",
    title: messages.message("workspacePanelTitle"),
    icon: "MessagesSquare",
    keywords: ["btw", "sidechat", "workspace", "claude", "侧边", "工作区"],
    context: "workspace",
    onSelect: ({ openPanel }) => {
      openPanel("workspace-sidechat", { location: "explorer" });
    },
  });

  // Shared slash handler for `/btw` and `/sidechat`.
  // Registered with `context: "workspace"` so it works in BOTH active agent tabs and brand-new draft tabs!
  const handleSidechatSlash = ({
    workspace,
    composers,
    openPanel,
    args,
  }: PluginWorkspaceCommandContext & { args: string }) => {
    const promptText = args.trim();
    const focused = composers({ focused: true })[0] ?? null;
    let targetAgentId: string | null = null;

    if (focused?.context === "agent") {
      for (const agent of knownAgents.values()) {
        if (agent.workspaceId !== workspace.id) continue;
        if (composers({ agentId: agent.id })[0] === focused) {
          targetAgentId = agent.id;
          break;
        }
      }
    }

    if (!targetAgentId) {
      let latest: ObservedAgent | null = null;
      for (const agent of knownAgents.values()) {
        const isForeground =
          agent.workspaceId === workspace.id &&
          !agent.background &&
          !agent.archivedAt &&
          agent.labels?.["paseo-better-sidechat"] !== "1";
        if (!isForeground) continue;
        if (!latest || (agent.updatedAt ?? "") > (latest.updatedAt ?? "")) {
          latest = agent;
        }
      }
      targetAgentId = latest?.id ?? null;
    }

    if (promptText) {
      enqueueSidechatHandoff(
        { workspaceId: workspace.id, agentId: targetAgentId },
        { kind: "prompt", text: promptText },
      );
    }

    if (targetAgentId) {
      client.openPanel("better-sidechat", {
        workspaceId: workspace.id,
        agentId: targetAgentId,
        location: "explorer",
      });
    } else {
      openPanel("workspace-sidechat", { location: "explorer" });
    }
  };

  client.addSlashCommand({
    name: "btw",
    description: messages.message("slashDescription"),
    argumentHint: messages.message("slashHint"),
    context: "workspace",
    onSubmit: handleSidechatSlash,
  });

  client.addSlashCommand({
    name: "sidechat",
    description: messages.message("slashDescription"),
    argumentHint: messages.message("slashHint"),
    context: "workspace",
    onSubmit: handleSidechatSlash,
  });

  const syncAgentPill = (agent: ObservedAgent) => {
    if (lifetime.signal.aborted) return;
    knownAgents.set(agent.id, agent);
    const isSidechatOrBackground =
      !pillEnabled ||
      Boolean(agent.background) ||
      Boolean(agent.archivedAt) ||
      agent.labels?.["paseo-better-sidechat"] === "1";

    if (!agent.workspaceId || isSidechatOrBackground) {
      pills.get(agent.id)?.remove();
      pills.delete(agent.id);
      return;
    }

    if (pills.has(agent.id)) return;
    const { id: agentId, workspaceId } = agent;
    pills.set(
      agentId,
      client.addComposerPill({
        id: "better-sidechat",
        agentId,
        workspaceId,
        button: {
          title: messages.message("openSidechat"),
          label: messages.message("pillLabel"),
          icon: "MessagesSquare",
          behavior: {
            kind: "action",
            onPress: () => {
              client.openPanel("better-sidechat", {
                workspaceId,
                agentId,
                location: "explorer",
              });
            },
          },
        },
      }),
    );
  };

  const clearPills = () => {
    for (const pill of pills.values()) {
      pill.remove();
    }
    pills.clear();
  };

  const applyPillEnabled = (enabled: boolean) => {
    pillEnabled = enabled;
    if (!enabled) {
      clearPills();
      return;
    }
    for (const agent of knownAgents.values()) {
      syncAgentPill(agent);
    }
  };

  const unsubPillPref = subscribeComposerPillPreference(applyPillEnabled);
  void client
    .rpc(preferencesRpc, {})
    .then((prefs) => {
      if (!lifetime.signal.aborted) applyPillEnabled(prefs.showComposerPill);
    })
    .catch(() => {});

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          clearPills();
          knownAgents.clear();
          for (const { agent } of entries) {
            syncAgentPill(agent);
          }
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          if (message.payload.kind === "upsert") {
            syncAgentPill(message.payload.agent);
          } else {
            knownAgents.delete(message.payload.agentId);
            pills.get(message.payload.agentId)?.remove();
            pills.delete(message.payload.agentId);
          }
        },
      });
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) {
        console.error("Better Sidechat agent observation failed:", error);
      }
    });

  return () => {
    lifetime.abort();
    unsubPillPref();
    knownAgents.clear();
    clearPills();
  };
}
