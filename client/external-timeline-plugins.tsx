import * as PaseoPlugin from "@getpaseo/plugin";
import type { PluginRpcContract, PluginTheme, SettingsDefinition } from "@getpaseo/plugin";
import * as PaseoPluginClient from "@getpaseo/plugin/client";
import type {
  PluginClientContext,
  PluginHostProps,
  PluginTimelineItemProps,
  SettingsState,
} from "@getpaseo/plugin/client";
import * as PaseoPluginClientRn from "@getpaseo/plugin/client/react-native";
import * as PaseoPluginClientUi from "@getpaseo/plugin/client/ui";
import { Markdown } from "@getpaseo/plugin/client/ui";
import type { JsonValue } from "@getpaseo/protocol/agent-types";
import * as ReactQueryModule from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ReactModule from "react";
import { Component, type ComponentType, type ReactNode, useCallback, useMemo } from "react";
import * as JsxRuntimeModule from "react/jsx-runtime";
import * as ReactNativeModule from "react-native";
import { Text, View } from "react-native";
import * as ZodModule from "zod";
import { type ZodType, z } from "zod";
import {
  invokeExternalPluginRpc,
  listTimelinePluginsRpc,
  type TimelinePluginBundleEntry,
} from "../shared/contracts";
import type { SidechatPluginItem } from "../shared/timeline";
import {
  collectTimelinePluginContributions,
  type EvaluatedTimelinePlugin,
} from "../shared/timeline-plugin-loader";
import {
  evaluateCommonJsFactoryBundle,
  readDeviceStorageItem,
  writeDeviceStorageItem,
} from "./web";

export type EvaluatedExternalTimelinePlugin = EvaluatedTimelinePlugin<
  ComponentType<PluginTimelineItemProps<unknown>>
>;

export type HostPluginClientCapabilities = Pick<
  PluginClientContext,
  "i18n" | "paseo" | "openScreen" | "openSurface" | "openSettings" | "composers" | "playAudio"
>;

let sharedHostCapabilities: HostPluginClientCapabilities | null = null;

export function setHostPluginClientCapabilities(
  capabilities: HostPluginClientCapabilities | null,
): void {
  sharedHostCapabilities = capabilities;
}

const storedSettingsEnvelopeSchema = z.object({
  version: z.number().int().positive(),
  values: z.unknown(),
});

const hostSettingsReadResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), revision: z.string(), values: z.unknown() }),
  z.object({ status: z.literal("invalid"), revision: z.string(), error: z.string() }),
]);

const hostSettingsWriteResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), revision: z.string(), values: z.unknown() }),
  z.object({ status: z.literal("conflict"), error: z.string() }),
  z.object({ status: z.literal("invalid"), error: z.string() }),
]);

function formatErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((i) => i.message).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function createExternalPluginClientModule(pluginId: string): typeof PaseoPluginClient {
  function useExternalRpc<InputSchema extends ZodType, OutputSchema extends ZodType>(
    contract: PluginRpcContract<InputSchema, OutputSchema>,
  ) {
    const callProxy = PaseoPluginClient.useRpc(invokeExternalPluginRpc);
    return useCallback(
      async (input: unknown) => {
        const res = await callProxy({
          pluginId,
          method: contract.name,
          params: input,
        });
        return contract.output.parseAsync(res.output);
      },
      [callProxy, contract],
    );
  }

  function useExternalSubscription() {
    return {
      data: undefined,
      error: null,
      status: "closed" as const,
    };
  }

  function useExternalSettings<Schema extends ZodType>(
    definition: SettingsDefinition<Schema>,
  ): SettingsState<Schema> {
    const callProxy = PaseoPluginClient.useRpc(invokeExternalPluginRpc);
    const queryClient = useQueryClient();
    const isDevice = definition.scope === "device";
    const storageKey = `@paseo:plugin-device-settings:${pluginId}/${definition.id}`;
    const queryKey = useMemo(
      () => [
        "sidechat-ext-plugin-settings",
        pluginId,
        definition.scope,
        definition.id,
        definition.version,
      ],
      [definition.id, definition.scope, definition.version],
    );

    const readFn = useCallback(async () => {
      if (isDevice) {
        const raw = readDeviceStorageItem(storageKey);
        const revision = raw ?? "missing";
        try {
          let values: unknown = {};
          let migrated = false;
          if (raw !== null) {
            const parsed = storedSettingsEnvelopeSchema.parse(JSON.parse(raw));
            if (parsed.version > definition.version) {
              throw new Error("Update this plugin to read its newer settings");
            }
            values = parsed.values;
            if (parsed.version < definition.version) {
              if (!definition.migrate) {
                throw new Error("This plugin has no migration for its saved settings");
              }
              values = await definition.migrate(values as JsonValue, parsed.version);
              migrated = true;
            }
          }
          const validated = await definition.schema.parseAsync(values);
          if (migrated) {
            const nextRaw = JSON.stringify({ version: definition.version, values: validated });
            writeDeviceStorageItem(storageKey, nextRaw);
            return { status: "ready" as const, revision: nextRaw, values: validated };
          }
          return { status: "ready" as const, revision, values: validated };
        } catch (err) {
          return {
            status: "invalid" as const,
            revision,
            error: formatErrorMessage(err),
          };
        }
      }

      const res = await callProxy({
        pluginId,
        method: `settings.${definition.id}.read`,
        params: {},
      });
      return hostSettingsReadResultSchema.parse(res.output);
    }, [callProxy, definition, isDevice, storageKey]);

    const query = useQuery({
      queryKey,
      queryFn: readFn,
      retry: false,
    });

    const mutation = useMutation({
      mutationFn: async (
        payload: { revision: string; values: unknown } | { revision: string },
      ) => {
        if (isDevice) {
          const currentRaw = readDeviceStorageItem(storageKey) ?? "missing";
          if (currentRaw !== payload.revision) {
            throw new Error("Settings changed. Reload before saving.");
          }
          const nextCandidate = "values" in payload ? payload.values : {};
          const parsed = await definition.schema.safeParseAsync(nextCandidate);
          if (!parsed.success) {
            throw new Error(formatErrorMessage(parsed.error));
          }
          const serialized = JSON.stringify({
            version: definition.version,
            values: parsed.data,
          });
          writeDeviceStorageItem(storageKey, serialized);
          queryClient.setQueryData(queryKey, {
            status: "ready",
            revision: serialized,
            values: parsed.data,
          });
          return;
        }

        const res =
          "values" in payload
            ? await callProxy({
                pluginId,
                method: `settings.${definition.id}.write`,
                params: {
                  revision: payload.revision,
                  values: await definition.schema.parseAsync(payload.values),
                },
              })
            : await callProxy({
                pluginId,
                method: `settings.${definition.id}.reset`,
                params: { revision: payload.revision },
              });
        const writeOut = hostSettingsWriteResultSchema.parse(res.output);
        if (writeOut.status !== "saved") {
          throw new Error(writeOut.error);
        }
        queryClient.setQueryData(queryKey, {
          status: "ready",
          revision: writeOut.revision,
          values: writeOut.values,
        });
      },
    });

    const save = useCallback(
      async (values: z.output<Schema>, revision: string) => {
        try {
          await mutation.mutateAsync({ values, revision });
          return true;
        } catch {
          return false;
        }
      },
      [mutation],
    );

    const reset = useCallback(async () => {
      if (!query.data) return false;
      try {
        await mutation.mutateAsync({ revision: query.data.revision });
        return true;
      } catch {
        return false;
      }
    }, [mutation, query.data]);

    const reload = useCallback(async () => {
      mutation.reset();
      await query.refetch();
    }, [mutation, query]);

    const baseControls = {
      saving: mutation.isPending,
      saveError: mutation.error ? formatErrorMessage(mutation.error) : null,
      save,
      reset,
      reload,
    };

    if (query.isPending) {
      return { ...baseControls, status: "loading" };
    }
    if (query.isError) {
      return { ...baseControls, status: "error", error: formatErrorMessage(query.error) };
    }
    if (query.data.status === "invalid") {
      return {
        ...baseControls,
        status: "invalid",
        revision: query.data.revision,
        error: query.data.error,
      };
    }

    const checked = definition.schema.safeParse(query.data.values);
    if (!checked.success) {
      return {
        ...baseControls,
        status: "invalid",
        revision: query.data.revision,
        error: formatErrorMessage(checked.error),
      };
    }

    return {
      ...baseControls,
      status: "ready",
      revision: query.data.revision,
      values: checked.data,
    };
  }

  return {
    ...PaseoPluginClient,
    useRpc: useExternalRpc as typeof PaseoPluginClient.useRpc,
    useSubscription: useExternalSubscription as unknown as typeof PaseoPluginClient.useSubscription,
    useSettings: useExternalSettings as typeof PaseoPluginClient.useSettings,
  };
}

function createPluginModuleResolver(pluginId: string): (specifier: string) => unknown {
  const scopedClientModule = createExternalPluginClientModule(pluginId);
  return (specifier: string): unknown => {
    switch (specifier) {
      case "@getpaseo/plugin":
        return PaseoPlugin;
      case "@getpaseo/plugin/client":
        return scopedClientModule;
      case "@getpaseo/plugin/client/ui":
        return PaseoPluginClientUi;
      case "@getpaseo/plugin/client/react-native":
        return PaseoPluginClientRn;
      case "react":
        return ReactModule;
      case "react/jsx-runtime":
        return JsxRuntimeModule;
      case "react-native":
        return ReactNativeModule;
      case "@tanstack/react-query":
        return ReactQueryModule;
      case "zod":
        return ZodModule;
      default:
        throw new Error(`Module "${specifier}" is not available in plugin client code`);
    }
  };
}

// Per-host cache keyed by `pluginId` so unchanged bundles preserve object identity across renders.
const hostPluginCache = new Map<string, Map<string, EvaluatedExternalTimelinePlugin>>();

function syncEvaluatedPluginsForHost(
  hostId: string,
  entries: ReadonlyArray<TimelinePluginBundleEntry>,
  invokeForPlugin: (pluginId: string, method: string, params: unknown) => Promise<unknown>,
): ReadonlyArray<EvaluatedExternalTimelinePlugin> {
  let byId = hostPluginCache.get(hostId);
  if (!byId) {
    byId = new Map();
    hostPluginCache.set(hostId, byId);
  }

  const incomingIds = new Set(entries.map((e) => e.id));
  for (const [existingId, evaluated] of byId.entries()) {
    if (!incomingIds.has(existingId)) {
      byId.delete(existingId);
      void evaluated.cleanup().catch(() => {});
    }
  }

  const active: EvaluatedExternalTimelinePlugin[] = [];
  for (const entry of entries) {
    const existing = byId.get(entry.id);
    if (existing && existing.bundleHash === entry.clientBundleHash) {
      active.push(existing);
      continue;
    }
    if (existing) {
      byId.delete(entry.id);
      void existing.cleanup().catch(() => {});
    }
    try {
      const evaluated = collectTimelinePluginContributions<
        ComponentType<PluginTimelineItemProps<unknown>>
      >({
        pluginId: entry.id,
        bundleHash: entry.clientBundleHash,
        bundleCode: entry.clientBundle,
        evaluateFactory: evaluateCommonJsFactoryBundle,
        requireModule: createPluginModuleResolver(entry.id),
        hostCapabilities: sharedHostCapabilities
          ? {
              i18n: sharedHostCapabilities.i18n,
              paseo: sharedHostCapabilities.paseo,
              openScreen: (arg) =>
                sharedHostCapabilities?.openScreen(
                  arg as Parameters<PluginClientContext["openScreen"]>[0],
                ),
              openSurface: (id) => sharedHostCapabilities?.openSurface(id),
              openSettings: (id) => sharedHostCapabilities?.openSettings(id),
              composers: (sel) =>
                sharedHostCapabilities
                  ? sharedHostCapabilities.composers(
                      sel as Parameters<PluginClientContext["composers"]>[0],
                    )
                  : [],
              playAudio: (src) =>
                sharedHostCapabilities ? sharedHostCapabilities.playAudio(src) : Promise.resolve(),
            }
          : null,
        invokeDirectRpc: (method, params) => invokeForPlugin(entry.id, method, params),
      });
      if (
        evaluated.timelineTransformers.length > 0 ||
        evaluated.timelineRenderers.length > 0
      ) {
        byId.set(entry.id, evaluated);
        active.push(evaluated);
      } else {
        void evaluated.cleanup().catch(() => {});
      }
    } catch (err) {
      console.warn(
        `[BetterSidechat] Failed to evaluate external timeline plugin "${entry.id}":`,
        err,
      );
    }
  }

  return active;
}

const EMPTY_PLUGINS: ReadonlyArray<EvaluatedExternalTimelinePlugin> = [];

/**
 * Automatically loads and keeps in sync all installed Paseo timeline plugins on `hostId`
 * (e.g. `Gen-UI` and any future plugins added via `paseo plugin add ...`).
 */
export function useExternalTimelinePlugins(
  hostId: string,
): ReadonlyArray<EvaluatedExternalTimelinePlugin> {
  const callListPlugins = PaseoPluginClient.useRpc(listTimelinePluginsRpc);
  const callExternalRpc = PaseoPluginClient.useRpc(invokeExternalPluginRpc);

  const query = useQuery({
    queryKey: ["sidechat-timeline-plugins", hostId],
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => callListPlugins({}),
  });

  const invokeForPlugin = useCallback(
    async (pluginId: string, method: string, params: unknown) => {
      const res = await callExternalRpc({ pluginId, method, params });
      return res.output;
    },
    [callExternalRpc],
  );

  return useMemo(() => {
    const entries = query.data?.plugins;
    if (!entries || entries.length === 0) return EMPTY_PLUGINS;
    return syncEvaluatedPluginsForHost(hostId, entries, invokeForPlugin);
  }, [hostId, invokeForPlugin, query.data?.plugins]);
}

class TimelinePluginErrorBoundary extends Component<
  { resetKey: string; fallback: ReactNode; children: ReactNode },
  { hasError: boolean; failedKey: string | null }
> {
  override state: { hasError: boolean; failedKey: string | null } = {
    hasError: false,
    failedKey: null,
  };

  static getDerivedStateFromError(): Partial<{ hasError: boolean }> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { hasError: boolean; failedKey: string | null },
  ) {
    if (state.hasError && state.failedKey !== null && state.failedKey !== props.resetKey) {
      return { hasError: false, failedKey: null };
    }
    if (state.hasError && state.failedKey === null) {
      return { failedKey: props.resetKey };
    }
    return null;
  }

  override componentDidCatch(error: unknown): void {
    console.warn("[BetterSidechat] External timeline renderer crashed:", error);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function extractFallbackMarkdown(item: SidechatPluginItem): string | null {
  if (item.data && typeof item.data === "object" && !Array.isArray(item.data)) {
    const record = item.data as Record<string, unknown>;
    for (const key of ["markdown", "text", "code", "source", "raw", "content"]) {
      const val = record[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return key === "code" ? `\`\`\`\n${val}\n\`\`\`` : val;
      }
    }
  }
  if (typeof item.data === "string" && item.data.trim().length > 0) {
    return item.data;
  }
  return null;
}

export function ExternalPluginTimelineItemView({
  item,
  agentId,
  host,
  theme,
  layout,
  plugins,
}: {
  item: SidechatPluginItem;
  agentId: string;
  host: PluginHostProps["host"];
  theme: PluginTheme;
  layout: PluginHostProps["layout"];
  plugins: ReadonlyArray<EvaluatedExternalTimelinePlugin>;
}) {
  const { colors } = theme;

  const resolved = useMemo(() => {
    const plugin = plugins.find((p) => p.id === item.pluginId);
    if (!plugin) return null;
    const renderer = plugin.timelineRenderers.find(
      (r) => r.kind === item.itemKind && r.version === item.version,
    );
    if (!renderer) return null;
    try {
      const parsed = renderer.schema.safeParse(item.data);
      if (!parsed.success) {
        console.warn(
          `[BetterSidechat] Timeline renderer schema failed for ${item.pluginId}/${item.itemKind}@${item.version}`,
          parsed.error,
        );
        return null;
      }
      return {
        Component: renderer.Component,
        data: parsed.data,
      };
    } catch (err) {
      console.warn("[BetterSidechat] Timeline renderer schema threw:", err);
      return null;
    }
  }, [item.data, item.itemKind, item.pluginId, item.version, plugins]);

  const timestampDate = useMemo(() => {
    const ms = Date.parse(item.timestamp);
    return Number.isFinite(ms) ? new Date(ms) : new Date();
  }, [item.timestamp]);

  const itemProp = useMemo(
    () => ({
      type: "plugin" as const,
      kind: item.itemKind,
      version: item.version,
      data: resolved?.data,
    }),
    [item.itemKind, item.version, resolved?.data],
  );

  const fallbackMarkdown = extractFallbackMarkdown(item);
  const fallbackNode = fallbackMarkdown ? (
    <View style={{ paddingHorizontal: 2, paddingVertical: 2 }}>
      <Markdown>{fallbackMarkdown}</Markdown>
    </View>
  ) : (
    <Text
      style={{
        color: colors.foregroundMuted,
        paddingVertical: 6,
        fontSize: 13,
      }}
    >
      Plugin timeline item unavailable ({item.pluginId}/{item.itemKind}).
    </Text>
  );

  if (!resolved) {
    return fallbackNode;
  }

  const RendererComponent = resolved.Component;
  const resetKey = `${item.id}:${item.version}:${JSON.stringify(item.data).length}`;

  return (
    <TimelinePluginErrorBoundary resetKey={resetKey} fallback={fallbackNode}>
      <RendererComponent
        agentId={agentId}
        host={host}
        theme={theme}
        layout={layout}
        timestamp={timestampDate}
        item={itemProp}
      />
    </TimelinePluginErrorBoundary>
  );
}
