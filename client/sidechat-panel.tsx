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
  useToast,
} from "@getpaseo/plugin/client/ui";
import type {
  AgentMode,
  AgentModelDefinition,
  AgentOptionControl,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentUsage,
  JsonValue,
  ProviderSnapshotEntry,
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
  formatProviderLabel,
  resolveEffectiveProviderMode,
  resolveModeIconName,
  resolveProviderIconSvg,
} from "../shared/composer-controls";
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
import { SidechatComposerBar } from "./composer-bar";
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
  draftFastMode: z.boolean().default(false),
  draftOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  contextOverride: z.boolean().nullable().default(null),
});

type SidechatTabState = z.infer<typeof tabStateSchema>;

const DEFAULT_TAB_STATE: SidechatTabState = {
  sideAgentId: null,
  draft: "",
  draftProviderModel: null,
  draftThinkingId: null,
  draftModeId: null,
  draftFastMode: false,
  draftOptions: {},
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

  // Discover ALL enabled AI providers, models, modes, icons & labels on this Paseo host.
  const catalogQueryKey = useMemo(
    () => ["sidechat-catalog", host.id, effectiveCwd] as const,
    [host.id, effectiveCwd],
  );

  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    enabled: Boolean(effectiveCwd),
    staleTime: 30_000,
    queryFn: async (): Promise<{ entries: ProviderSnapshotEntry[] }> => {
      let entries: ProviderSnapshotEntry[] = [];
      try {
        const snap = await paseo.providers.waitForReady({
          cwd: effectiveCwd,
          timeoutMs: 8_000,
        });
        entries = snap.entries ?? [];
      } catch {
        try {
          const snap = await paseo.providers.snapshot({ cwd: effectiveCwd });
          entries = snap.entries ?? [];
        } catch {
          entries = [];
        }
      }

      if (entries.length === 0) {
        const avail = await paseo.providers.listAvailable();
        const fallbackEntries: ProviderSnapshotEntry[] = [];
        for (const p of avail.providers) {
          if (!p.available) continue;
          try {
            const [modelRes, modeRes] = await Promise.all([
              paseo.providers.listModels(p.provider, { cwd: effectiveCwd }),
              paseo.providers.listModes(p.provider, { cwd: effectiveCwd }).catch(() => ({
                modes: [] as AgentMode[],
              })),
            ]);
            fallbackEntries.push({
              provider: p.provider,
              status: "ready",
              enabled: true,
              models: modelRes.models ?? [],
              modes: modeRes.modes ?? [],
            });
          } catch {
            continue;
          }
        }
        entries = fallbackEntries;
      }

      return { entries };
    },
  });

  // Live subscribe to provider snapshot updates (e.g. enabling/disabling providers in Paseo Settings).
  useEffect(() => {
    const unsubscribe = paseo.providers.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: catalogQueryKey });
    });
    return unsubscribe;
  }, [paseo, queryClient, catalogQueryKey]);

  const enabledProviderEntries = useMemo(
    () => (catalogQuery.data?.entries ?? []).filter((e) => e.enabled !== false),
    [catalogQuery.data?.entries],
  );

  const availableModels = useMemo(() => {
    const list: AgentModelDefinition[] = [];
    for (const entry of enabledProviderEntries) {
      for (const m of entry.models ?? []) {
        if (m.isSelectable !== false) {
          list.push(m);
        }
      }
    }
    return list;
  }, [enabledProviderEntries]);

  const defaultHostProvider =
    enabledProviderEntries.find((e) => (e.models ?? []).some((m) => m.isSelectable !== false))
      ?.provider ??
    enabledProviderEntries[0]?.provider ??
    "claude";

  // Effective provider/model, thinking option, and mode for active thread or draft.
  const effectiveProvider = activeSideAgentId
    ? sideComposer?.agent.provider || activeThreadFromList?.provider || defaultHostProvider
    : tabState.draftProviderModel && tabState.draftProviderModel.includes("/")
      ? tabState.draftProviderModel.slice(0, tabState.draftProviderModel.indexOf("/"))
      : prefs.inheritMainModel && mainAgent?.provider
        ? mainAgent.provider
        : defaultHostProvider;

  const currentProviderEntry = useMemo(
    () =>
      enabledProviderEntries.find((e) => e.provider === effectiveProvider) ??
      (catalogQuery.data?.entries ?? []).find((e) => e.provider === effectiveProvider) ??
      null,
    [enabledProviderEntries, catalogQuery.data?.entries, effectiveProvider],
  );

  const effectiveModelId = activeSideAgentId
    ? sideComposer?.agent.model || activeThreadFromList?.model || null
    : tabState.draftProviderModel && tabState.draftProviderModel.includes("/")
      ? tabState.draftProviderModel.slice(tabState.draftProviderModel.indexOf("/") + 1)
      : prefs.inheritMainModel && mainAgent?.provider === effectiveProvider && mainAgent.model
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
      : prefs.inheritMainModel &&
          mainAgent?.provider === effectiveProvider &&
          mainAgent.thinkingOptionId
        ? mainAgent.thinkingOptionId
        : currentModelDef?.defaultThinkingOptionId ?? null;

  const providerModes = useMemo<AgentMode[]>(
    () => currentProviderEntry?.modes ?? [],
    [currentProviderEntry],
  );

  const effectiveModeId = useMemo(() => {
    if (activeSideAgentId) {
      return (
        sideComposer?.agent.mode ??
        activeThreadFromList?.modeId ??
        resolveEffectiveProviderMode({
          provider: effectiveProvider,
          defaultPermissionMode: prefs.defaultPermissionMode,
          availableModes: currentProviderEntry ? providerModes : undefined,
          providerDefaultModeId: currentProviderEntry?.defaultModeId,
        }) ??
        null
      );
    }
    return (
      resolveEffectiveProviderMode({
        provider: effectiveProvider,
        requestedModeId: tabState.draftModeId,
        parentProvider: mainAgent?.provider,
        parentModeId: mainAgent?.currentModeId,
        defaultPermissionMode: prefs.defaultPermissionMode,
        availableModes: currentProviderEntry ? providerModes : undefined,
        providerDefaultModeId: currentProviderEntry?.defaultModeId,
      }) ?? null
    );
  }, [
    activeSideAgentId,
    sideComposer?.agent.mode,
    activeThreadFromList?.modeId,
    effectiveProvider,
    tabState.draftModeId,
    mainAgent?.provider,
    mainAgent?.currentModeId,
    prefs.defaultPermissionMode,
    currentProviderEntry,
    providerModes,
  ]);

  // Query provider-specific option controls (`fast_mode` on Claude, Codex controls, etc.)
  const controlsProviderTarget = effectiveModelId
    ? `${effectiveProvider}/${effectiveModelId}`
    : effectiveProvider;

  const controlsQuery = useQuery({
    queryKey: ["sidechat-controls", host.id, effectiveCwd, controlsProviderTarget],
    enabled: Boolean(effectiveCwd && effectiveProvider),
    staleTime: 30_000,
    queryFn: () =>
      paseo.providers.listControls({
        provider: controlsProviderTarget,
        cwd: effectiveCwd,
      }),
  });

  const optionControls = useMemo<AgentOptionControl[]>(() => {
    if (controlsQuery.data?.controls) {
      return controlsQuery.data.controls;
    }
    if (effectiveProvider === "claude") {
      return [
        {
          type: "toggle",
          key: "fast_mode",
          label: "Fast mode",
          icon: "Zap",
          defaultValue: false,
        },
      ];
    }
    return [];
  }, [controlsQuery.data?.controls, effectiveProvider]);

  const effectiveOptions = useMemo<Readonly<Record<string, JsonValue>>>(() => {
    if (activeSideAgentId && sideComposer) {
      return sideComposer.agent.options;
    }
    const base = (controlsQuery.data?.options ?? {}) as Record<string, JsonValue>;
    const merged: Record<string, JsonValue> = { ...base, ...tabState.draftOptions };
    if (tabState.draftFastMode && effectiveProvider === "claude" && merged.fast_mode === undefined) {
      merged.fast_mode = true;
    }
    return merged;
  }, [
    activeSideAgentId,
    sideComposer,
    controlsQuery.data?.options,
    tabState.draftOptions,
    tabState.draftFastMode,
    effectiveProvider,
  ]);

  // Live timeline & agent snapshot subscription for `activeSideAgentId`
  const [timelineState, setTimelineState] = useState<TimelineState>(() =>
    createEmptyTimelineState(),
  );
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [pendingPermissions, setPendingPermissions] = useState<AgentPermissionRequest[]>([]);
  const [lastUsage, setLastUsage] = useState<AgentUsage | null>(null);
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
      setLastUsage(null);
      setLoadingTimeline(false);
      return;
    }

    let cancelled = false;
    let initialSendInFlight = false;
    setLastUsage(null);
    const handle = paseo.agents.ref(activeSideAgentId);
    const pendingSend =
      pendingInitialSendRef.current?.agentId === activeSideAgentId
        ? pendingInitialSendRef.current
        : null;
    if (pendingSend) {
      pendingInitialSendRef.current = null;
      initialSendInFlight = true;
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
          if (snapshot.agent?.lastUsage) {
            setLastUsage(snapshot.agent.lastUsage);
          }
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
      } else if (event.event.type === "turn_completed" && event.event.usage) {
        setLastUsage(event.event.usage);
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
        if (update.agent.lastUsage) {
          setLastUsage(update.agent.lastUsage);
        }
        const running =
          update.agent.status === "running" || Boolean(update.agent.activeTurn?.turnId);
        if (!running && initialSendInFlight) {
          return;
        }
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
          initialSendInFlight = false;
        } catch (error) {
          initialSendInFlight = false;
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
            providerOptions: tabState.draftOptions,
            fastMode: Boolean(effectiveOptions.fast_mode),
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
      tabState.draftOptions,
      effectiveOptions,
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
      const entry = enabledProviderEntries.find((e) => e.provider === thread.provider);
      const providerLabel = formatProviderLabel(thread.provider, entry?.label);
      const threadSvg =
        thread.status === "running"
          ? null
          : resolveProviderIconSvg(thread.provider, entry?.iconSvg);
      opts.push({
        id: thread.agentId,
        label: thread.title || t("untitledThread"),
        subtitle: `${providerLabel}${thread.model ? ` · ${thread.model}` : ""}`,
        icon: thread.status === "running" ? "LoaderCircle" : "MessageSquare",
        iconSvg: threadSvg,
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
  }, [
    activeSideAgentId,
    threads,
    enabledProviderEntries,
    navigation,
    host.id,
    t,
    patchTabState,
    handleArchiveActiveThread,
  ]);

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

  const modelMenuOptions: MenuOption[] = useMemo(() => {
    const multiProvider = enabledProviderEntries.length > 1;
    const items: MenuOption[] = [];

    for (const entry of enabledProviderEntries) {
      const providerLabel = formatProviderLabel(entry.provider, entry.label);
      const providerSvg = resolveProviderIconSvg(entry.provider, entry.iconSvg);
      const selectable = (entry.models ?? []).filter((m) => m.isSelectable !== false);

      for (const m of selectable) {
        const key = `${m.provider}/${m.id}`;
        const isSelected = m.provider === effectiveProvider && m.id === effectiveModelId;
        items.push({
          id: key,
          label: m.label || m.id,
          subtitle: m.description || (multiProvider ? null : providerLabel),
          section: multiProvider ? providerLabel : null,
          iconSvg: providerSvg,
          icon: providerSvg ? undefined : "Cpu",
          selected: isSelected,
          onSelect: () => {
            if (activeSideAgentId && sideComposer && m.provider === effectiveProvider) {
              void sideComposer.setModel(m.id).catch((err) => {
                toast.error(err instanceof Error ? err.message : "Failed to switch model");
              });
              return;
            }
            if (activeSideAgentId && m.provider !== effectiveProvider) {
              // Running Paseo agents are bound to their provider runtime; start a clean draft on the new provider.
              patchTabState({
                sideAgentId: null,
                draftProviderModel: key,
                draftThinkingId: m.defaultThinkingOptionId ?? null,
                draftModeId: entry.defaultModeId ?? null,
                draftFastMode: false,
                draftOptions: {},
                contextOverride: null,
              });
              setTimelineState(createEmptyTimelineState());
              toast.show(t("switchedProviderNewThread", { provider: providerLabel }), {
                variant: "info",
              });
              return;
            }
            const changedProvider = m.provider !== effectiveProvider;
            patchTabState({
              draftProviderModel: key,
              draftThinkingId: m.defaultThinkingOptionId ?? null,
              ...(changedProvider
                ? {
                    draftModeId: entry.defaultModeId ?? null,
                    draftFastMode: false,
                    draftOptions: {},
                  }
                : {}),
            });
          },
        });
      }
    }
    return items;
  }, [
    enabledProviderEntries,
    effectiveProvider,
    effectiveModelId,
    activeSideAgentId,
    sideComposer,
    patchTabState,
    t,
    toast,
  ]);

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
    const modes: AgentMode[] =
      currentProviderEntry !== null
        ? providerModes
        : effectiveProvider === "claude"
          ? [
              { id: "auto", label: t("modeAuto"), icon: "ShieldCheck" },
              { id: "plan", label: t("modePlan"), icon: "ShieldEllipsis" },
              { id: "default", label: t("modeDefault"), icon: "Shield" },
              { id: "acceptEdits", label: t("modeAcceptEdits"), icon: "ShieldPlus" },
              { id: "bypassPermissions", label: "Bypass", icon: "ShieldOff" },
            ]
          : [];

    return modes.map((m) => ({
      id: m.id,
      label: m.label,
      subtitle: m.description,
      icon: resolveModeIconName(m.id, m.icon),
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
    currentProviderEntry,
    providerModes,
    effectiveProvider,
    effectiveModeId,
    activeSideAgentId,
    sideComposer,
    patchTabState,
    t,
    toast,
  ]);

  const handleSetOption = useCallback(
    (key: string, value: JsonValue) => {
      if (activeSideAgentId && sideComposer) {
        void sideComposer.setOptions({ [key]: value }).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Option is not supported by this model");
        });
      } else {
        const safePrimitive =
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean" ||
          value === null
            ? value
            : String(value);
        patchTabState({
          draftOptions: { ...latestTabStateRef.current.draftOptions, [key]: safePrimitive },
          ...(key === "fast_mode" && typeof value === "boolean" ? { draftFastMode: value } : {}),
        });
      }
    },
    [activeSideAgentId, sideComposer, patchTabState, toast],
  );

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

  const selectedModelLabel = currentModelDef?.label || effectiveModelId || null;

  const selectedThinkingLabel =
    thinkingOptions.find((o) => o.id === effectiveThinkingId)?.label || effectiveThinkingId || null;

  const selectedModeObj = useMemo(
    () => providerModes.find((m) => m.id === effectiveModeId) ?? null,
    [providerModes, effectiveModeId],
  );

  const selectedModeLabel =
    selectedModeObj?.label ||
    modeMenuOptions.find((m) => m.id === effectiveModeId)?.label ||
    effectiveModeId ||
    null;

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

      {/* Paseo-aligned Bottom Composer Card */}
      <SidechatComposerBar
        hostId={host.id}
        activeSideAgentId={activeSideAgentId}
        locale={locale}
        theme={theme}
        palette={palette}
        appearance={appearance}
        panelWidth={panelWidth}
        isTouch={layout.compact}
        t={t}
        draft={tabState.draft}
        onChangeDraft={(text) => patchTabState({ draft: text })}
        onSubmit={() => {
          if (latestTabStateRef.current.draft.trim()) {
            void sendPromptText(latestTabStateRef.current.draft);
          }
        }}
        onStop={() => {
          void handleStopTurn();
        }}
        isBusy={isBusy}
        canSubmit={Boolean(tabState.draft.trim() && effectiveCwd && !creatingThread)}
        shortcutLabel={shortcutLabel}
        hasMainAgent={Boolean(mainAgentId)}
        shouldAttachMainContext={shouldAttachMainContext}
        isAutoFirstTurnContext={
          tabState.contextOverride === null &&
          prefs.defaultContextMode === "first_turn" &&
          isFirstTurn
        }
        onToggleMainContext={() => {
          patchTabState({ contextOverride: !shouldAttachMainContext });
        }}
        onPreviewMainContext={() => setContextPreviewOpen(true)}
        candidateSelection={candidateSelection}
        attachedQuote={attachedQuote}
        onAttachCandidateSelection={() => {
          if (candidateSelection) {
            setAttachedQuote(candidateSelection);
            setCandidateSelection(null);
          }
        }}
        onClearQuote={() => setAttachedQuote(null)}
        effectiveProvider={effectiveProvider}
        providerIconSvg={currentProviderEntry?.iconSvg ?? null}
        selectedModelRawLabel={selectedModelLabel}
        modelMaxTokens={currentModelDef?.contextWindowMaxTokens ?? null}
        modelMenuOptions={modelMenuOptions}
        selectedThinkingRawLabel={selectedThinkingLabel}
        thinkingMenuOptions={thinkingMenuOptions}
        effectiveModeId={effectiveModeId}
        selectedModeRawLabel={selectedModeLabel}
        selectedModeIconName={selectedModeObj?.icon ?? null}
        modeMenuOptions={modeMenuOptions}
        optionControls={optionControls}
        effectiveOptions={effectiveOptions}
        onSetOption={handleSetOption}
        lastUsage={lastUsage}
      />

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
