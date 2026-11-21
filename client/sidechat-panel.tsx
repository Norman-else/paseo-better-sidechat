import type {
  PluginAgentPanelProps,
  PluginHostProps,
  PluginTab,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import {
  useAgent,
  useAgents,
  useComposers,
  usePaseo,
  useRpc,
  useSettings,
  useTabState,
  useWorkspace,
} from "@getpaseo/plugin/client";
import {
  FlatList,
  Icon,
  Loading,
  Modal,
  ScrollView,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/ui";
import type {
  AgentMode,
  AgentModelDefinition,
  AgentPermissionRequest,
  AgentPermissionResponse,
} from "@getpaseo/protocol/agent-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type FlatList as NativeFlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { z } from "zod";
import { deriveSidechatPalette } from "../shared/appearance";
import {
  composeSidechatPrompt,
  formatTransferToMainPrompt,
} from "../shared/context";
import {
  createThreadRpc,
  listThreadsRpc,
  mainContextRpc,
  type SidechatThread,
  updateThreadRpc,
} from "../shared/contracts";
import {
  DEFAULT_SIDECHAT_SETTINGS,
  sidechatSettings,
} from "../shared/settings";
import {
  appendOptimisticUserMessage,
  applyTimelineStreamEvent,
  createEmptyTimelineState,
  extractPromptOutline,
  fromTimelineSnapshot,
  projectTimelineRows,
  type ProjectedRow,
  type SidechatUserItem,
  type TimelineState,
} from "../shared/timeline";
import {
  consumeSidechatHandoff,
  subscribeSidechatHandoff,
} from "./handoff";
import { useMessages } from "./messages";
import { type MenuOption, PopoverMenu } from "./popover-menu";
import { Spinner } from "./spinner";
import {
  LiveTurnStatusRow,
  PermissionRequestBanner,
  SidechatTimelineRowView,
} from "./timeline-views";
import {
  codeScopeProps,
  composerWebKeyProps,
  noOutlineInputStyle,
  panelScopeProps,
  pointerCursorStyle,
  stableScrollbarStyle,
  useHostAppearance,
  watchExternalSelection,
} from "./web";

const tabStateSchema = z.object({
  sideAgentId: z.string().nullable().default(null),
  draft: z.string().default(""),
  draftProviderModel: z.string().nullable().default(null),
  draftThinkingId: z.string().nullable().default(null),
  draftModeId: z.string().nullable().default(null),
  contextOverride: z.boolean().nullable().default(null),
});

type SidechatTabState = z.infer<typeof tabStateSchema>;

const DEFAULT_TAB_STATE: SidechatTabState = {
  sideAgentId: null,
  draft: "",
  draftProviderModel: null,
  draftThinkingId: null,
  draftModeId: null,
  contextOverride: null,
};

function makeClientMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `sc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface NavigableProps extends PluginHostProps {
  workspaceId: string;
  pinnedMainAgentId?: string | null;
  tab: PluginTab;
  navigation?: PluginAgentPanelProps["navigation"];
}

export function SidechatAgentPanel(props: PluginAgentPanelProps) {
  return (
    <SidechatSurface
      workspaceId={props.workspaceId}
      pinnedMainAgentId={props.params.agentId}
      tab={props.tab}
      theme={props.theme}
      host={props.host}
      layout={props.layout}
      navigation={props.navigation}
    />
  );
}

export function SidechatWorkspacePanel(props: PluginWorkspacePanelProps) {
  return (
    <SidechatSurface
      workspaceId={props.workspaceId}
      pinnedMainAgentId={null}
      tab={props.tab}
      theme={props.theme}
      host={props.host}
      layout={props.layout}
      navigation={props.navigation}
    />
  );
}

function SidechatSurface({
  workspaceId,
  pinnedMainAgentId,
  tab,
  theme,
  host,
  layout,
  navigation,
}: NavigableProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t, locale } = useMessages();
  const appearance = useHostAppearance();
  const palette = useMemo(() => deriveSidechatPalette(theme.colors), [theme.colors]);
  const { colors } = theme;
  const panelScopeId = useId();

  const settingsState = useSettings(sidechatSettings);
  const prefs =
    settingsState.status === "ready" ? settingsState.values : DEFAULT_SIDECHAT_SETTINGS;

  const [tabState, setTabState] = useTabState(tab, tabStateSchema, DEFAULT_TAB_STATE);
  const latestTabStateRef = useRef(tabState);
  latestTabStateRef.current = tabState;
  const patchTabState = useCallback(
    (patch: Partial<SidechatTabState>) => {
      const next = { ...latestTabStateRef.current, ...patch };
      latestTabStateRef.current = next;
      setTabState(next);
    },
    [setTabState],
  );

  // Measure own panel width for responsive sidebar layout.
  const [panelWidth, setPanelWidth] = useState(420);
  const compact = layout.compact || panelWidth < 460;
  const controlHeight = layout.compact ? 38 : 28;

  // Resolve workspace & active main agent.
  const workspace = useWorkspace(workspaceId);
  const workspaceAgentRefs = useAgents({
    hosts: [host.id],
    where: (a) => a.workspaceId === workspaceId && !a.background,
    orderBy: ["lastActivityAt", "desc"],
  });
  const mainAgentId = pinnedMainAgentId || workspaceAgentRefs[0]?.id || null;
  const mainAgent = useAgent(mainAgentId ?? "");
  const effectiveCwd = mainAgent?.cwd || workspace?.directory || "";

  // Composers bridge (Paseo 0.16): main composer for inserting notes, side composer for live config.
  const mainComposers = useComposers(
    mainAgentId ? { agentId: mainAgentId } : { focused: true },
  );
  const mainComposer = mainAgentId ? mainComposers[0] ?? null : null;

  // RPC hooks
  const callListThreads = useRpc(listThreadsRpc);
  const callCreateThread = useRpc(createThreadRpc);
  const callUpdateThread = useRpc(updateThreadRpc);
  const callMainContext = useRpc(mainContextRpc);

  const threadsQueryKey = useMemo(
    () => ["sidechat-threads", host.id, workspaceId, mainAgentId ?? "workspace"] as const,
    [host.id, workspaceId, mainAgentId],
  );

  const threadsQuery = useQuery({
    queryKey: threadsQueryKey,
    queryFn: () =>
      callListThreads({
        workspaceId,
        ...(mainAgentId ? { parentAgentId: mainAgentId } : {}),
      }),
    staleTime: 8_000,
  });

  const threads = threadsQuery.data?.threads ?? [];
  const activeSideAgentId = tabState.sideAgentId;
  const activeThreadFromList = useMemo(
    () => threads.find((item) => item.agentId === activeSideAgentId) ?? null,
    [threads, activeSideAgentId],
  );

  // Auto-select latest existing thread on first open if none selected & draft is empty.
  const didInitialAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialAutoSelectRef.current) return;
    if (!threadsQuery.isSuccess) return;
    didInitialAutoSelectRef.current = true;
    if (!latestTabStateRef.current.sideAgentId && !latestTabStateRef.current.draft && threads.length > 0) {
      patchTabState({ sideAgentId: threads[0].agentId });
    }
  }, [threadsQuery.isSuccess, threads, patchTabState]);

  const sideComposers = useComposers(
    activeSideAgentId ? { agentId: activeSideAgentId } : { agentId: "__none__" },
  );
  const sideComposer = activeSideAgentId ? sideComposers[0] ?? null : null;

  // Discover Claude models & modes on this host.
  const catalogQuery = useQuery({
    queryKey: ["sidechat-catalog", host.id, effectiveCwd],
    enabled: Boolean(effectiveCwd),
    staleTime: 60_000,
    queryFn: async () => {
      const models: AgentModelDefinition[] = [];
      let claudeModes: AgentMode[] = [];
      try {
        const [claudeModelRes, claudeModeRes] = await Promise.all([
          paseo.providers.listModels("claude", { cwd: effectiveCwd }),
          paseo.providers.listModes("claude", { cwd: effectiveCwd }),
        ]);
        for (const m of claudeModelRes.models ?? []) {
          if (m.isSelectable !== false) models.push(m);
        }
        claudeModes = claudeModeRes.modes ?? [];
      } catch {
        // Fallback: check other available providers if Claude is unavailable.
      }
      if (models.length === 0) {
        const avail = await paseo.providers.listAvailable();
        for (const p of avail.providers) {
          if (!p.available) continue;
          try {
            const res = await paseo.providers.listModels(p.provider, { cwd: effectiveCwd });
            for (const m of res.models ?? []) {
              if (m.isSelectable !== false) models.push(m);
            }
          } catch {
            continue;
          }
        }
      }
      return { models, claudeModes };
    },
  });

  const availableModels = catalogQuery.data?.models ?? [];
  const availableClaudeModes = catalogQuery.data?.claudeModes ?? [];

  // Effective provider/model, thinking option, and mode for active thread or draft.
  const effectiveProvider = activeSideAgentId
    ? sideComposer?.agent.provider || activeThreadFromList?.provider || "claude"
    : tabState.draftProviderModel
      ? tabState.draftProviderModel.split("/")[0]
      : mainAgent?.provider === "claude" || !prefs.preferClaudeProvider
        ? mainAgent?.provider || "claude"
        : "claude";

  const effectiveModelId = activeSideAgentId
    ? sideComposer?.agent.model || activeThreadFromList?.model || null
    : tabState.draftProviderModel
      ? tabState.draftProviderModel.slice(tabState.draftProviderModel.indexOf("/") + 1)
      : mainAgent?.provider === effectiveProvider && mainAgent.model
        ? mainAgent.model
        : (availableModels.find((m) => m.provider === effectiveProvider && m.isDefault) ??
            availableModels.find((m) => m.provider === effectiveProvider) ??
            availableModels[0])?.id ?? null;

  const currentModelDef = useMemo(
    () =>
      availableModels.find(
        (m) => m.provider === effectiveProvider && m.id === effectiveModelId,
      ) ?? null,
    [availableModels, effectiveProvider, effectiveModelId],
  );

  const thinkingOptions = currentModelDef?.thinkingOptions ?? [];
  const effectiveThinkingId = activeSideAgentId
    ? sideComposer?.agent.thinking ?? activeThreadFromList?.thinkingOptionId ?? null
    : tabState.draftThinkingId !== null
      ? tabState.draftThinkingId || null
      : mainAgent?.provider === effectiveProvider && mainAgent.thinkingOptionId
        ? mainAgent.thinkingOptionId
        : currentModelDef?.defaultThinkingOptionId ?? null;

  const effectiveModeId = activeSideAgentId
    ? sideComposer?.agent.mode ?? activeThreadFromList?.modeId ?? "auto"
    : tabState.draftModeId ??
      (prefs.defaultClaudeMode === "inherit"
        ? mainAgent?.currentModeId ?? "auto"
        : prefs.defaultClaudeMode);

  // Live timeline & agent snapshot subscription for `activeSideAgentId`
  const [timelineState, setTimelineState] = useState<TimelineState>(() =>
    createEmptyTimelineState(),
  );
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<AgentPermissionRequest[]>([]);
  const [creatingThread, setCreatingThread] = useState(false);

  // Per-thread manual expand/collapse toggles
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [toggledItemIds, setToggledItemIds] = useState<Set<string>>(() => new Set());

  // External text selection quote
  const [candidateSelection, setCandidateSelection] = useState<string | null>(null);
  const [attachedQuote, setAttachedQuote] = useState<string | null>(null);

  // Menus & Modals
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [outlineMenuOpen, setOutlineMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);

  // Scroll management & initial-send coordination
  const listRef = useRef<NativeFlatList<ProjectedRow> | null>(null);
  const stickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [turnStartedAtMs, setTurnStartedAtMs] = useState<number | null>(null);
  const pendingInitialSendRef = useRef<{
    agentId: string;
    sentPrompt: string;
    clientMessageId: string;
  } | null>(null);

  useEffect(() => {
    return watchExternalSelection(panelScopeId, (selected) => {
      setCandidateSelection(selected);
    });
  }, [panelScopeId]);

  // Reset manual fold overrides when switching threads or when Paseo's `chatDisplay` / `autoExpandReasoning` changes.
  useEffect(() => {
    setExpandedGroupIds(new Set());
    setToggledItemIds(new Set());
  }, [activeSideAgentId, appearance.chatDisplay, appearance.autoExpandReasoning]);

  // Subscribe to `activeSideAgentId` timeline & agent updates.
  useEffect(() => {
    if (!activeSideAgentId) {
      setTimelineState(createEmptyTimelineState());
      setPendingPermissions([]);
      setLoadingTimeline(false);
      return;
    }

    let cancelled = false;
    const handle = paseo.agents.ref(activeSideAgentId);
    const pendingSend =
      pendingInitialSendRef.current?.agentId === activeSideAgentId
        ? pendingInitialSendRef.current
        : null;
    if (pendingSend) {
      pendingInitialSendRef.current = null;
      setLoadingTimeline(false);
    } else {
      setLoadingTimeline(true);
    }

    const fetchLatestSnapshot = async () => {
      try {
        const snapshot = await handle.timeline.refetch({
          direction: "tail",
          limit: 250,
        });
        if (cancelled) return;
        if (!snapshot.error) {
          setPendingPermissions(snapshot.agent?.pendingPermissions ?? []);
          setTimelineState((prev) => {
            const optimistic = prev.items.filter(
              (i): i is SidechatUserItem => i.kind === "user_message" && Boolean(i.optimistic),
            );
            return fromTimelineSnapshot(snapshot, optimistic);
          });
        }
      } catch {
        // Ignore transient disconnect; subscription_restored will refetch.
      } finally {
        if (!cancelled) setLoadingTimeline(false);
      }
    };

    const unsubTimeline = handle.timeline.subscribe((event) => {
      if (cancelled) return;
      if (event.event.type === "permission_requested") {
        const req = event.event.request;
        setPendingPermissions((prev) =>
          prev.some((p) => p.id === req.id) ? prev : [...prev, req],
        );
      } else if (event.event.type === "permission_resolved") {
        const resolvedId = event.event.requestId;
        setPendingPermissions((prev) => prev.filter((p) => p.id !== resolvedId));
      }

      setTimelineState((prev) => {
        const outcome = applyTimelineStreamEvent(prev, event);
        if (outcome.needsRefetch) {
          void fetchLatestSnapshot();
        }
        return outcome.state;
      });
    });

    const unsubAgent = handle.subscribe((update) => {
      if (cancelled) return;
      if (update.kind === "upsert") {
        setPendingPermissions(update.agent.pendingPermissions ?? []);
        const running =
          update.agent.status === "running" || Boolean(update.agent.activeTurn?.turnId);
        setTimelineState((prev) =>
          prev.isTurnActive === running ? prev : { ...prev, isTurnActive: running },
        );
      }
    });

    if (pendingSend) {
      void (async () => {
        try {
          await unsubTimeline.ready.catch(() => {});
          if (cancelled) return;
          await handle.send(pendingSend.sentPrompt, {
            messageId: pendingSend.clientMessageId,
          });
        } catch (error) {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : "Failed to send message");
            setTimelineState((prev) => ({ ...prev, isTurnActive: false }));
          }
        }
      })();
    } else {
      void fetchLatestSnapshot();
    }

    return () => {
      cancelled = true;
      unsubTimeline();
      unsubAgent();
    };
  }, [activeSideAgentId, paseo, toast]);

  const isBusy = creatingThread || timelineState.isTurnActive;

  useEffect(() => {
    if (!isBusy) {
      setTurnStartedAtMs(null);
    } else if (turnStartedAtMs === null) {
      setTurnStartedAtMs(Date.now());
    }
  }, [isBusy, turnStartedAtMs]);

  const liveTurnPhase = useMemo<"starting" | "thinking" | "working" | null>(() => {
    if (creatingThread) return "starting";
    if (!timelineState.isTurnActive) return null;
    const last = timelineState.items.at(-1);
    if (!last || last.kind === "user_message") return "thinking";
    if (last.kind === "assistant_message" && last.streaming && last.text.trim().length > 0) {
      return null;
    }
    if (last.kind === "thought" && last.status === "loading") return null;
    if (last.kind === "tool_call" && last.status === "running") return null;
    return "working";
  }, [creatingThread, timelineState.isTurnActive, timelineState.items]);

  // Determine whether main session context will be attached on next message.
  const isFirstTurn = !activeSideAgentId || timelineState.items.length === 0;
  const shouldAttachMainContext = useMemo(() => {
    if (!mainAgentId) return false;
    if (tabState.contextOverride !== null) return tabState.contextOverride;
    if (prefs.defaultContextMode === "always") return true;
    if (prefs.defaultContextMode === "first_turn") return isFirstTurn;
    return false;
  }, [mainAgentId, tabState.contextOverride, prefs.defaultContextMode, isFirstTurn]);

  const contextPreviewQuery = useQuery({
    queryKey: ["sidechat-main-context", host.id, mainAgentId, prefs.contextTurns],
    enabled: Boolean(mainAgentId) && contextPreviewOpen,
    queryFn: () =>
      callMainContext({
        agentId: mainAgentId!,
        maxTurns: prefs.contextTurns,
      }),
  });

  // Project timeline items into Paseo-faithful display rows (`chatDisplay` + `autoExpandReasoning`).
  const projectedRows = useMemo(
    () =>
      projectTimelineRows(timelineState.items, {
        chatDisplay: appearance.chatDisplay,
        autoExpandReasoning: appearance.autoExpandReasoning,
        isTurnActive: timelineState.isTurnActive,
        expandedGroupIds,
        toggledItemIds,
      }),
    [
      timelineState.items,
      timelineState.isTurnActive,
      appearance.chatDisplay,
      appearance.autoExpandReasoning,
      expandedGroupIds,
      toggledItemIds,
    ],
  );

  const promptOutline = useMemo(
    () =>
      appearance.chatOutlineEnabled ? extractPromptOutline(timelineState.items) : [],
    [appearance.chatOutlineEnabled, timelineState.items],
  );

  // Auto-scroll on streaming updates when user is pinned near bottom.
  useEffect(() => {
    if (!stickToBottomRef.current || projectedRows.length === 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 24);
    return () => clearTimeout(timer);
  }, [projectedRows]);

  const handleToggleItem = useCallback((id: string) => {
    setToggledItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleGroup = useCallback((id: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sendPromptText = useCallback(
    async (rawInputText: string, options?: { forceNewThread?: boolean }) => {
      const trimmed = rawInputText.trim();
      if (!trimmed || !effectiveCwd) return;

      const clientMessageId = makeClientMessageId();
      const quoteToSend = attachedQuote;
      setAttachedQuote(null);
      stickToBottomRef.current = true;

      const targetSideAgentId = options?.forceNewThread ? null : latestTabStateRef.current.sideAgentId;

      if (!targetSideAgentId) {
        setTurnStartedAtMs(Date.now());
        setCreatingThread(true);
        patchTabState({ draft: "", contextOverride: null });
        setTimelineState(
          appendOptimisticUserMessage(createEmptyTimelineState(), {
            text: composeSidechatPrompt({
              text: trimmed,
              quotedSelection: quoteToSend,
            }),
            clientMessageId,
          }),
        );

        try {
          const providerModel =
            effectiveProvider && effectiveModelId
              ? `${effectiveProvider}/${effectiveModelId}`
              : undefined;

          const created = await callCreateThread({
            workspaceId,
            parentAgentId: mainAgentId,
            cwd: effectiveCwd,
            prompt: trimmed,
            clientMessageId,
            providerModel,
            modeId: effectiveModeId,
            thinkingOptionId: effectiveThinkingId,
            attachMainContext: shouldAttachMainContext,
            quotedSelection: quoteToSend,
            deferInitialSend: true,
          });

          pendingInitialSendRef.current = {
            agentId: created.thread.agentId,
            sentPrompt: created.sentPrompt,
            clientMessageId,
          };
          // Re-align optimistic message with full composed prompt (including main context badge)
          setTimelineState(
            appendOptimisticUserMessage(createEmptyTimelineState(), {
              text: created.sentPrompt,
              clientMessageId,
            }),
          );
          patchTabState({ sideAgentId: created.thread.agentId });
          void queryClient.invalidateQueries({ queryKey: threadsQueryKey });
        } catch (error) {
          pendingInitialSendRef.current = null;
          toast.error(error instanceof Error ? error.message : "Failed to start sidechat");
          setTimelineState(createEmptyTimelineState());
          patchTabState({ draft: trimmed });
        } finally {
          setCreatingThread(false);
        }
        return;
      }

      // Existing sidechat thread: optionally attach fresh main-session context if enabled.
      setTurnStartedAtMs(Date.now());
      patchTabState({ draft: "", contextOverride: null });
      let mainDigestText: string | null = null;
      if (shouldAttachMainContext && mainAgentId) {
        try {
          const ctxRes = await callMainContext({
            agentId: mainAgentId,
            maxTurns: prefs.contextTurns,
          });
          if (ctxRes.available && ctxRes.digest) {
            mainDigestText = ctxRes.digest.digest;
          }
        } catch {
          mainDigestText = null;
        }
      }

      const composed = composeSidechatPrompt({
        text: trimmed,
        mainContext: mainDigestText,
        quotedSelection: quoteToSend,
      });

      setTimelineState((prev) =>
        appendOptimisticUserMessage(prev, {
          text: composed,
          clientMessageId,
        }),
      );

      try {
        await paseo.agents.ref(targetSideAgentId).send(composed, {
          messageId: clientMessageId,
          activeTurnBehavior: appearance.sendBehavior === "interrupt" ? "interrupt" : "steer",
        });
        void callUpdateThread({
          agentId: targetSideAgentId,
          workspaceId,
          action: "touch",
        }).then(() => queryClient.invalidateQueries({ queryKey: threadsQueryKey }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send message");
      }
    },
    [
      effectiveCwd,
      attachedQuote,
      effectiveProvider,
      effectiveModelId,
      effectiveModeId,
      effectiveThinkingId,
      shouldAttachMainContext,
      workspaceId,
      mainAgentId,
      prefs.contextTurns,
      appearance.sendBehavior,
      callCreateThread,
      callMainContext,
      callUpdateThread,
      paseo,
      patchTabState,
      queryClient,
      threadsQueryKey,
      toast,
    ],
  );

  const sendPromptRef = useRef(sendPromptText);
  sendPromptRef.current = sendPromptText;

  // Consume `/sidechat [question]` or `New Sidechat` handoff intents!
  useEffect(() => {
    const processPending = () => {
      const intent = consumeSidechatHandoff({
        workspaceId,
        agentId: mainAgentId,
      });
      if (!intent) return;
      if (intent.kind === "new_thread") {
        patchTabState({ sideAgentId: null, contextOverride: null });
        setTimelineState(createEmptyTimelineState());
      } else if (intent.kind === "prompt" && intent.text.trim()) {
        void sendPromptRef.current(intent.text);
      }
    };
    processPending();
    return subscribeSidechatHandoff(processPending);
  }, [workspaceId, mainAgentId, patchTabState]);

  const handleStopTurn = useCallback(async () => {
    if (!activeSideAgentId) return;
    try {
      await paseo.agents.ref(activeSideAgentId).reload();
      setTimelineState((prev) => ({ ...prev, isTurnActive: false, activeTurnId: null }));
      toast.show(t("stoppingToast"), { variant: "info" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stop turn");
    }
  }, [activeSideAgentId, paseo, t, toast]);

  const handleRespondPermission = useCallback(
    async (requestId: string, response: AgentPermissionResponse) => {
      if (!activeSideAgentId) return;
      try {
        await paseo.agents.ref(activeSideAgentId).respondToPermission({
          requestId,
          response,
        });
        setPendingPermissions((prev) => prev.filter((r) => r.id !== requestId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Permission response failed");
      }
    },
    [activeSideAgentId, paseo, toast],
  );

  const handleInsertToMain = useCallback(
    (question: string | null, answer: string) => {
      if (!mainComposer) return;
      const formatted = formatTransferToMainPrompt({
        question,
        answer,
        mode: "insert",
        locale,
      });
      mainComposer.insertText(formatted);
      void mainComposer.focus().catch(() => {});
      toast.show(t("insertedToMain"), { variant: "success" });
    },
    [mainComposer, locale, t, toast],
  );

  const handleSendToMain = useCallback(
    async (question: string | null, answer: string) => {
      if (!mainAgentId) return;
      const formatted = formatTransferToMainPrompt({
        question,
        answer,
        mode: "send",
        locale,
      });
      try {
        await paseo.agents.ref(mainAgentId).send(formatted, {
          activeTurnBehavior: appearance.sendBehavior === "interrupt" ? "interrupt" : "steer",
        });
        toast.show(t("sentToMain"), { variant: "success" });
      } catch {
        toast.error(t("transferFailed"));
      }
    },
    [mainAgentId, locale, paseo, appearance.sendBehavior, t, toast],
  );

  const handleArchiveActiveThread = useCallback(async () => {
    if (!activeSideAgentId) return;
    const archivingId = activeSideAgentId;
    const nextThread = threads.find((item) => item.agentId !== archivingId) ?? null;
    patchTabState({ sideAgentId: nextThread?.agentId ?? null });
    await callUpdateThread({
      agentId: archivingId,
      workspaceId,
      action: "archive",
    }).catch(() => {});
    void queryClient.invalidateQueries({ queryKey: threadsQueryKey });
  }, [activeSideAgentId, threads, patchTabState, callUpdateThread, workspaceId, queryClient, threadsQueryKey]);

  const handleScroll = useCallback((ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = ev.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nearBottom = distanceFromBottom <= 90;
    stickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom && contentSize.height > layoutMeasurement.height + 140);
  }, []);

  // Build menu options
  const threadMenuOptions: MenuOption[] = useMemo(() => {
    const opts: MenuOption[] = [
      {
        id: "__new__",
        label: t("newThread"),
        icon: "Plus",
        selected: !activeSideAgentId,
        onSelect: () => {
          patchTabState({ sideAgentId: null, contextOverride: null });
          setTimelineState(createEmptyTimelineState());
        },
      },
    ];
    for (const thread of threads) {
      opts.push({
        id: thread.agentId,
        label: thread.title || t("untitledThread"),
        subtitle: `${thread.provider}${thread.model ? `/${thread.model}` : ""}`,
        icon: thread.status === "running" ? "LoaderCircle" : "MessageSquare",
        selected: thread.agentId === activeSideAgentId,
        onSelect: () => {
          patchTabState({ sideAgentId: thread.agentId, contextOverride: null });
        },
      });
    }
    if (activeSideAgentId && navigation?.openAgent) {
      opts.push({
        id: "__promote__",
        label: t("openAsMainTab"),
        icon: "ExternalLink",
        onSelect: () => {
          navigation.openAgent({ agentId: activeSideAgentId, serverId: host.id });
        },
      });
    }
    if (activeSideAgentId) {
      opts.push({
        id: "__archive__",
        label: t("archiveThread"),
        icon: "Archive",
        danger: true,
        onSelect: () => {
          void handleArchiveActiveThread();
        },
      });
    }
    return opts;
  }, [activeSideAgentId, threads, navigation, host.id, t, patchTabState, handleArchiveActiveThread]);

  const outlineOptions: MenuOption[] = useMemo(
    () =>
      promptOutline.map((entry) => ({
        id: entry.id,
        label: `#${entry.promptIndex}  ${entry.preview}`,
        icon: "CornerDownRight",
        onSelect: () => {
          const targetIdx = projectedRows.findIndex((r) => r.id === entry.id);
          if (targetIdx >= 0) {
            stickToBottomRef.current = false;
            listRef.current?.scrollToIndex({
              index: targetIdx,
              animated: true,
              viewPosition: 0.08,
            });
          }
        },
      })),
    [promptOutline, projectedRows],
  );

  const modelMenuOptions: MenuOption[] = useMemo(
    () =>
      availableModels.map((m) => {
        const key = `${m.provider}/${m.id}`;
        const isSelected = m.provider === effectiveProvider && m.id === effectiveModelId;
        return {
          id: key,
          label: m.label || m.id,
          subtitle: m.provider === "claude" ? "Claude" : m.provider,
          selected: isSelected,
          onSelect: () => {
            if (activeSideAgentId && sideComposer) {
              void sideComposer.setModel(m.id).catch((err) => {
                toast.error(err instanceof Error ? err.message : "Failed to switch model");
              });
            } else {
              patchTabState({
                draftProviderModel: key,
                draftThinkingId: m.defaultThinkingOptionId ?? null,
              });
            }
          },
        };
      }),
    [
      availableModels,
      effectiveProvider,
      effectiveModelId,
      activeSideAgentId,
      sideComposer,
      patchTabState,
      toast,
    ],
  );

  const thinkingMenuOptions: MenuOption[] = useMemo(() => {
    if (thinkingOptions.length === 0) return [];
    return thinkingOptions.map((opt) => ({
      id: opt.id,
      label: opt.label,
      subtitle: opt.description,
      selected: opt.id === effectiveThinkingId,
      onSelect: () => {
        if (activeSideAgentId && sideComposer) {
          void sideComposer.setThinking(opt.id).catch((err) => {
            toast.error(err instanceof Error ? err.message : "Failed to switch thinking");
          });
        } else {
          patchTabState({ draftThinkingId: opt.id });
        }
      },
    }));
  }, [thinkingOptions, effectiveThinkingId, activeSideAgentId, sideComposer, patchTabState, toast]);

  const modeMenuOptions: MenuOption[] = useMemo(() => {
    const modes =
      effectiveProvider === "claude" && availableClaudeModes.length > 0
        ? availableClaudeModes
        : [
            { id: "auto", label: t("modeAuto") },
            { id: "plan", label: t("modePlan") },
            { id: "default", label: t("modeDefault") },
            { id: "acceptEdits", label: t("modeAcceptEdits") },
          ];
    return modes.map((m) => ({
      id: m.id,
      label: m.label,
      subtitle: m.description,
      selected: m.id === effectiveModeId,
      onSelect: () => {
        if (activeSideAgentId && sideComposer) {
          void sideComposer.setMode(m.id).catch((err) => {
            toast.error(err instanceof Error ? err.message : "Failed to switch mode");
          });
        } else {
          patchTabState({ draftModeId: m.id });
        }
      },
    }));
  }, [
    effectiveProvider,
    availableClaudeModes,
    effectiveModeId,
    activeSideAgentId,
    sideComposer,
    patchTabState,
    t,
    toast,
  ]);

  const activeThreadTitle = activeSideAgentId
    ? activeThreadFromList?.title || t("untitledThread")
    : t("newThread");

  const shortcutLabel =
    appearance.sendShortcut === "mod-enter" ? t("modEnterShortcut") : t("enterShortcut");

  const starterItems = useMemo(
    () => [
      {
        id: "explain",
        icon: "BookOpen",
        title: t("starterExplainTitle"),
        prompt: t("starterExplainPrompt"),
      },
      {
        id: "edge",
        icon: "ShieldAlert",
        title: t("starterEdgeCasesTitle"),
        prompt: t("starterEdgeCasesPrompt"),
      },
      {
        id: "compare",
        icon: "GitCompareArrows",
        title: t("starterCompareTitle"),
        prompt: t("starterComparePrompt"),
      },
      {
        id: "trace",
        icon: "Workflow",
        title: t("starterTraceTitle"),
        prompt: t("starterTracePrompt"),
      },
    ],
    [t],
  );

  const selectedModelLabel =
    currentModelDef?.label ||
    (effectiveModelId ? effectiveModelId.replace(/^claude-/, "") : t("modelLabel"));

  const selectedThinkingLabel =
    thinkingOptions.find((o) => o.id === effectiveThinkingId)?.label ||
    effectiveThinkingId ||
    t("thinkingDefault");

  const selectedModeLabel =
    modeMenuOptions.find((m) => m.id === effectiveModeId)?.label || effectiveModeId || t("modeAuto");

  return (
    <View
      {...panelScopeProps(panelScopeId)}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - panelWidth) > 4) setPanelWidth(w);
      }}
      style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: colors.surface0,
      }}
    >
      {/* Top Toolbar */}
      <View
        style={{
          minHeight: compact ? 44 : 36,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          zIndex: 30,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <PopoverMenu
            title={t("threadsTitle")}
            open={threadMenuOpen}
            onOpenChange={setThreadMenuOpen}
            theme={theme}
            compact={compact}
            uiFontSize={appearance.uiBaseFontSize}
            options={threadMenuOptions}
            emptyLabel={t("noThreadsYet")}
            trigger={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={activeThreadTitle}
                accessibilityState={{ expanded: threadMenuOpen }}
                onPress={() => setThreadMenuOpen((v) => !v)}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    minHeight: controlHeight,
                    maxWidth: Math.max(150, panelWidth - 110),
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: pressed || hovered ? colors.surface2 : colors.surface1,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                  pointerCursorStyle,
                ]}
              >
                {isBusy ? (
                  <Spinner size={12} color={colors.accent} label={activeThreadTitle} />
                ) : (
                  <Icon name="MessagesSquare" size={13} color={colors.accent} />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    fontSize: appearance.uiBaseFontSize,
                    fontWeight: "600",
                    color: colors.foreground,
                  }}
                >
                  {activeThreadTitle}
                </Text>
                {threads.length > 0 ? (
                  <Text
                    style={{
                      fontSize: Math.max(10, appearance.uiBaseFontSize - 2),
                      color: colors.foregroundMuted,
                    }}
                  >
                    {threads.length}
                  </Text>
                ) : null}
                <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
              </Pressable>
            }
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {promptOutline.length >= 2 ? (
            <PopoverMenu
              title={t("outlineTitle")}
              open={outlineMenuOpen}
              onOpenChange={setOutlineMenuOpen}
              anchor="right"
              theme={theme}
              compact={compact}
              uiFontSize={appearance.uiBaseFontSize}
              options={outlineOptions}
              trigger={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("outlineTitle")}
                  onPress={() => setOutlineMenuOpen((v) => !v)}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    {
                      width: controlHeight,
                      height: controlHeight,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon name="ListTree" size={14} color={colors.foregroundMuted} />
                </Pressable>
              }
            />
          ) : null}

          {(expandedGroupIds.size > 0 || toggledItemIds.size > 0) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("collapseAll")}
              onPress={() => {
                setExpandedGroupIds(new Set());
                setToggledItemIds(new Set());
              }}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                {
                  width: controlHeight,
                  height: controlHeight,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                },
                pointerCursorStyle,
              ]}
            >
              <Icon name="FoldVertical" size={14} color={colors.foregroundMuted} />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("newThread")}
            onPress={() => {
              patchTabState({ sideAgentId: null, contextOverride: null });
              setTimelineState(createEmptyTimelineState());
            }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              {
                width: controlHeight,
                height: controlHeight,
                borderRadius: 6,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
              },
              pointerCursorStyle,
            ]}
          >
            <Icon name="SquarePen" size={14} color={colors.foregroundMuted} />
          </Pressable>
        </View>
      </View>

      {/* Main Chat Body */}
      <View style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {loadingTimeline && projectedRows.length === 0 ? (
          <Loading />
        ) : projectedRows.length === 0 ? (
          <ScrollView
            style={stableScrollbarStyle}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 16,
              paddingVertical: 20,
              gap: 16,
            }}
          >
            <View style={{ gap: 6 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: palette.accentSoftBg,
                  borderWidth: 1,
                  borderColor: palette.accentSoftBorder,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 2,
                }}
              >
                <Icon name="Sparkles" size={16} color={colors.accent} />
              </View>
              <Text
                style={{
                  fontSize: appearance.contentFontSize + 2,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                {t("emptyTitle")}
              </Text>
              <Text
                style={{
                  fontSize: Math.max(12, appearance.uiBaseFontSize),
                  lineHeight: Math.round(appearance.uiBaseFontSize * 1.45),
                  color: colors.foregroundMuted,
                }}
              >
                {t("emptySubtitle")}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              {starterItems.map((starter) => (
                <Pressable
                  key={starter.id}
                  accessibilityRole="button"
                  accessibilityLabel={starter.title}
                  onPress={() => {
                    void sendPromptText(starter.prompt);
                  }}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    {
                      minHeight: compact ? 42 : 34,
                      paddingHorizontal: 11,
                      paddingVertical: 7,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed || hovered ? colors.surface2 : colors.surface1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon name={starter.icon} size={14} color={colors.accent} />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: appearance.uiBaseFontSize,
                      color: colors.foreground,
                    }}
                  >
                    {starter.title}
                  </Text>
                  <Icon name="ArrowUpRight" size={13} color={colors.foregroundMuted} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={projectedRows}
            extraData={timelineState}
            keyExtractor={(item) => item.id}
            style={[{ flex: 1 }, stableScrollbarStyle]}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingTop: 10,
              paddingBottom: 14,
              gap: 4,
            }}
            onScroll={handleScroll}
            scrollEventThrottle={64}
            onScrollToIndexFailed={() => {}}
            ListFooterComponent={
              <LiveTurnStatusRow
                phase={liveTurnPhase}
                startedAtMs={turnStartedAtMs}
                theme={theme}
                appearance={appearance}
                t={t}
              />
            }
            renderItem={({ item }) => (
              <SidechatTimelineRowView
                row={item}
                theme={theme}
                palette={palette}
                appearance={appearance}
                compact={compact}
                locale={locale}
                t={t}
                canInsertToMain={Boolean(mainComposer)}
                canSendToMain={Boolean(mainAgentId)}
                onToggleItem={handleToggleItem}
                onToggleGroup={handleToggleGroup}
                onInsertToMain={handleInsertToMain}
                onSendToMain={handleSendToMain}
              />
            )}
          />
        )}

        {showScrollToBottom ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("scrollToBottom")}
            onPress={() => {
              stickToBottomRef.current = true;
              setShowScrollToBottom(false);
              listRef.current?.scrollToEnd({ animated: true });
            }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              {
                position: "absolute",
                right: 14,
                bottom: 10,
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: pressed || hovered ? colors.surface2 : colors.surface1,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              },
              pointerCursorStyle,
            ]}
          >
            <Icon name="ArrowDown" size={14} color={colors.foreground} />
          </Pressable>
        ) : null}
      </View>

      {/* Pending Permission Banner */}
      <PermissionRequestBanner
        requests={pendingPermissions}
        theme={theme}
        palette={palette}
        appearance={appearance}
        compact={compact}
        locale={locale}
        t={t}
        onRespond={handleRespondPermission}
      />

      {/* Composer Box */}
      <View
        style={{
          paddingHorizontal: 10,
          paddingBottom: 10,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface0,
          gap: 6,
          zIndex: 20,
        }}
      >
        {/* Context & Selection Chips Bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {mainAgentId ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={
                  shouldAttachMainContext ? t("mainContextAttached") : t("mainContextOff")
                }
                accessibilityState={{ checked: shouldAttachMainContext }}
                onPress={() => {
                  patchTabState({ contextOverride: !shouldAttachMainContext });
                }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    minHeight: compact ? 30 : 23,
                    paddingHorizontal: 7,
                    borderRadius: 5,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    backgroundColor: shouldAttachMainContext
                      ? palette.accentSoftBg
                      : pressed || hovered
                        ? colors.surface2
                        : colors.surface1,
                    borderWidth: 1,
                    borderColor: shouldAttachMainContext
                      ? palette.accentSoftBorder
                      : colors.border,
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon
                  name="Link2"
                  size={11}
                  color={shouldAttachMainContext ? colors.accent : colors.foregroundMuted}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                    fontWeight: shouldAttachMainContext ? "600" : "400",
                    color: shouldAttachMainContext ? colors.foreground : colors.foregroundMuted,
                  }}
                >
                  {tabState.contextOverride === null &&
                  prefs.defaultContextMode === "first_turn" &&
                  isFirstTurn
                    ? t("mainContextAuto")
                    : shouldAttachMainContext
                      ? t("mainContextAttached")
                      : t("mainContextOff")}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("previewMainContext")}
                onPress={() => setContextPreviewOpen(true)}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    width: compact ? 30 : 23,
                    height: compact ? 30 : 23,
                    borderRadius: 5,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon name="Eye" size={12} color={colors.foregroundMuted} />
              </Pressable>
            </View>
          ) : null}

          {candidateSelection && !attachedQuote ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("quoteSelectionChip")}
              onPress={() => {
                setAttachedQuote(candidateSelection);
                setCandidateSelection(null);
              }}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                {
                  minHeight: compact ? 30 : 23,
                  paddingHorizontal: 7,
                  borderRadius: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: pressed || hovered ? colors.surface2 : colors.surface1,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
                pointerCursorStyle,
              ]}
            >
              <Icon name="Quote" size={11} color={colors.accent} />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                  color: colors.foreground,
                }}
              >
                {t("quoteSelectionChip")}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Active Attached Quote Preview */}
        {attachedQuote ? (
          <View
            {...codeScopeProps}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 6,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: colors.surface1,
              borderLeftWidth: 2,
              borderLeftColor: colors.accent,
            }}
          >
            <Text
              numberOfLines={3}
              style={{
                flex: 1,
                fontFamily: appearance.monoFontFamily,
                fontSize: Math.max(11, appearance.codeFontSize - 1),
                lineHeight: appearance.codeLineHeight,
                color: colors.foregroundMuted,
              }}
            >
              {attachedQuote}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("clearQuote")}
              onPress={() => setAttachedQuote(null)}
              style={[{ padding: 2 }, pointerCursorStyle]}
            >
              <Icon name="X" size={13} color={colors.foregroundMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Input Surface */}
        <View
          style={{
            borderRadius: 9,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface1,
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: 6,
            gap: 6,
          }}
        >
          <TextInput
            multiline
            value={tabState.draft}
            onChangeText={(text) => patchTabState({ draft: text })}
            placeholder={t("composerPlaceholder", { shortcut: shortcutLabel })}
            placeholderTextColor={colors.foregroundMuted}
            accessibilityLabel={t("composerPlaceholder", { shortcut: shortcutLabel })}
            {...composerWebKeyProps(appearance.sendShortcut, () => {
              if (latestTabStateRef.current.draft.trim()) {
                void sendPromptText(latestTabStateRef.current.draft);
              }
            })}
            style={[
              {
                minHeight: compact ? 46 : 38,
                maxHeight: 150,
                padding: 0,
                fontSize: appearance.contentFontSize,
                lineHeight: appearance.contentLineHeight,
                color: colors.foreground,
              },
              noOutlineInputStyle,
            ]}
          />

          {/* Bottom Composer Controls: Model, Thinking Effort, Mode, Send/Stop */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 4,
                flex: 1,
                minWidth: 0,
              }}
            >
              {/* Model Picker */}
              {modelMenuOptions.length > 0 ? (
                <PopoverMenu
                  title={t("modelLabel")}
                  open={modelMenuOpen}
                  onOpenChange={setModelMenuOpen}
                  placement="top"
                  theme={theme}
                  compact={compact}
                  uiFontSize={appearance.uiBaseFontSize}
                  options={modelMenuOptions}
                  trigger={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t("modelLabel")}: ${selectedModelLabel}`}
                      onPress={() => setModelMenuOpen((v) => !v)}
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                        {
                          minHeight: compact ? 30 : 24,
                          maxWidth: 150,
                          paddingHorizontal: 6,
                          borderRadius: 5,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                        },
                        pointerCursorStyle,
                      ]}
                    >
                      <Icon name="Cpu" size={12} color={colors.foregroundMuted} />
                      <Text
                        numberOfLines={1}
                        style={{
                          flexShrink: 1,
                          fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                          color: colors.foregroundMuted,
                        }}
                      >
                        {selectedModelLabel}
                      </Text>
                    </Pressable>
                  }
                />
              ) : null}

              {/* Thinking Effort Picker */}
              {thinkingMenuOptions.length > 0 ? (
                <PopoverMenu
                  title={t("thinkingLabel")}
                  open={thinkingMenuOpen}
                  onOpenChange={setThinkingMenuOpen}
                  placement="top"
                  theme={theme}
                  compact={compact}
                  uiFontSize={appearance.uiBaseFontSize}
                  options={thinkingMenuOptions}
                  trigger={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t("thinkingLabel")}: ${selectedThinkingLabel}`}
                      onPress={() => setThinkingMenuOpen((v) => !v)}
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                        {
                          minHeight: compact ? 30 : 24,
                          paddingHorizontal: 6,
                          borderRadius: 5,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                        },
                        pointerCursorStyle,
                      ]}
                    >
                      <Icon name="Brain" size={12} color={colors.foregroundMuted} />
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                          color: colors.foregroundMuted,
                        }}
                      >
                        {selectedThinkingLabel}
                      </Text>
                    </Pressable>
                  }
                />
              ) : null}

              {/* Permission Mode Picker */}
              <PopoverMenu
                title={t("modeLabel")}
                open={modeMenuOpen}
                onOpenChange={setModeMenuOpen}
                placement="top"
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                options={modeMenuOptions}
                trigger={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("modeLabel")}: ${selectedModeLabel}`}
                    onPress={() => setModeMenuOpen((v) => !v)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        minHeight: compact ? 30 : 24,
                        paddingHorizontal: 6,
                        borderRadius: 5,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon
                      name={effectiveModeId === "plan" ? "ShieldEllipsis" : "ShieldCheck"}
                      size={12}
                      color={colors.foregroundMuted}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                        color: colors.foregroundMuted,
                      }}
                    >
                      {selectedModeLabel}
                    </Text>
                  </Pressable>
                }
              />
            </View>

            {/* Stop / Send Action */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {isBusy && !tabState.draft.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("stopButton")}
                  onPress={() => {
                    void handleStopTurn();
                  }}
                  style={({ pressed }) => [
                    {
                      height: compact ? 34 : 26,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      backgroundColor: colors.surface2,
                      borderWidth: 1,
                      borderColor: colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      opacity: pressed ? 0.8 : 1,
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon name="Square" size={11} color={colors.foreground} />
                  <Text
                    style={{
                      fontSize: Math.max(11, appearance.uiBaseFontSize - 1),
                      fontWeight: "600",
                      color: colors.foreground,
                    }}
                  >
                    {t("stopButton")}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("sendButton")}
                  accessibilityState={{
                    disabled: !tabState.draft.trim() || !effectiveCwd || creatingThread,
                  }}
                  disabled={!tabState.draft.trim() || !effectiveCwd || creatingThread}
                  onPress={() => {
                    void sendPromptText(tabState.draft);
                  }}
                  style={({ pressed }) => {
                    const enabled = Boolean(tabState.draft.trim() && effectiveCwd && !creatingThread);
                    return [
                      {
                        width: compact ? 34 : 26,
                        height: compact ? 34 : 26,
                        borderRadius: 6,
                        backgroundColor: enabled ? colors.accent : colors.surface2,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: !enabled ? 0.45 : pressed ? 0.85 : 1,
                      },
                      enabled ? pointerCursorStyle : undefined,
                    ];
                  }}
                >
                  <Icon
                    name="ArrowUp"
                    size={14}
                    color={
                      tabState.draft.trim() && effectiveCwd
                        ? colors.accentForeground
                        : colors.foregroundMuted
                    }
                  />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Main Session Context Preview Modal */}
      <Modal
        title={t("previewMainContext")}
        open={contextPreviewOpen}
        onOpenChange={setContextPreviewOpen}
      >
        <Modal.Content scrollable contentContainerStyle={{ padding: 16, gap: 12 }}>
          {contextPreviewQuery.isLoading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <Spinner size={18} color={colors.accent} label={t("previewMainContext")} />
            </View>
          ) : contextPreviewQuery.data?.available && contextPreviewQuery.data.digest ? (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: appearance.uiBaseFontSize, color: colors.foregroundMuted }}>
                {t("mainContextTurns", { count: contextPreviewQuery.data.digest.turnCount })}
              </Text>
              <View
                {...codeScopeProps}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.surface1,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  selectable
                  style={{
                    fontFamily: appearance.monoFontFamily,
                    fontSize: appearance.codeFontSize,
                    lineHeight: appearance.codeLineHeight,
                    color: colors.foreground,
                  }}
                >
                  {contextPreviewQuery.data.digest.digest}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: appearance.uiBaseFontSize, color: colors.foregroundMuted }}>
              {contextPreviewQuery.data?.error || t("noMainAgent")}
            </Text>
          )}
        </Modal.Content>
      </Modal>
    </View>
  );
}
