import type { ZodType } from "zod";
import type {
  TimelinePluginTransformSource,
  TimelineTransformerLike,
} from "./timeline";

const VALID_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const VALID_TRANSFORMER_ITEM_TYPES = new Set([
  "user_message",
  "assistant_message",
  "reasoning",
  "tool_call",
  "todo",
  "notification",
  "error",
  "compaction",
]);

export interface TimelineRendererContributionEntry<ComponentShape = unknown> {
  readonly kind: string;
  readonly version: number;
  readonly schema: ZodType;
  readonly Component: ComponentShape;
}

export interface EvaluatedTimelinePlugin<ComponentShape = unknown>
  extends TimelinePluginTransformSource {
  readonly id: string;
  readonly bundleHash: string;
  readonly timelineTransformers: ReadonlyArray<TimelineTransformerLike>;
  readonly timelineRenderers: ReadonlyArray<TimelineRendererContributionEntry<ComponentShape>>;
  cleanup(): Promise<void>;
}

function validateContributionId(raw: unknown, label: string): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!VALID_ID_PATTERN.test(trimmed)) {
    throw new Error(`Invalid ${label}: ${String(raw)}`);
  }
  return trimmed;
}

const noopCleanup = () => {};
const noopButtonRegistration = () => ({
  update: noopCleanup,
  remove: noopCleanup,
});

const fallbackI18n = {
  locale: "en",
  t: () => "",
  resolve: (text: unknown) => (typeof text === "string" ? text : ""),
  subscribe: () => noopCleanup,
};

export interface HostClientCapabilityBridge {
  readonly i18n?: unknown;
  readonly paseo?: unknown;
  openScreen?(input: unknown): void;
  openSurface?(id: string): void;
  openSettings?(id: string): void;
  composers?(selector: unknown): readonly unknown[];
  playAudio?(source: { base64: string; mimeType: string }): Promise<void>;
}

/**
 * Evaluates a Paseo plugin's compiled `clientBundle` (`(function(require) { ... })`)
 * and captures its `addTimelineTransformer` and `addTimelineRenderer` contributions
 * using Paseo's exact validation rules (`MOD 3978`), while safely no-opping host-level
 * sidebar/panel/command registrations so they are never duplicated in Paseo.
 */
export function collectTimelinePluginContributions<ComponentShape = unknown>(input: {
  pluginId: string;
  bundleHash: string;
  bundleCode: string;
  evaluateFactory: (
    pluginId: string,
    code: string,
  ) => (requireFn: (specifier: string) => unknown) => unknown;
  requireModule: (specifier: string) => unknown;
  hostCapabilities?: HostClientCapabilityBridge | null;
  invokeDirectRpc?: (method: string, params: unknown) => Promise<unknown>;
}): EvaluatedTimelinePlugin<ComponentShape> {
  const {
    pluginId,
    bundleHash,
    bundleCode,
    evaluateFactory,
    requireModule,
    hostCapabilities,
    invokeDirectRpc,
  } = input;

  const timelineTransformers: TimelineTransformerLike[] = [];
  const timelineRenderers: TimelineRendererContributionEntry<ComponentShape>[] = [];
  const transformerIds = new Set<string>();
  const rendererKeys = new Set<string>();
  const disposers = new Set<() => void>();

  const registerItem = <T>(list: T[], item: T, onRemove: () => void) => {
    list.push(item);
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      const idx = list.indexOf(item);
      if (idx >= 0) list.splice(idx, 1);
      onRemove();
      disposers.delete(dispose);
    };
    disposers.add(dispose);
    return dispose;
  };

  const clientContext: Record<string, unknown> = {
    i18n: hostCapabilities?.i18n ?? fallbackI18n,
    paseo: hostCapabilities?.paseo ?? {},
    openScreen: (arg: unknown) => hostCapabilities?.openScreen?.(arg),
    openSurface: (id: string) => hostCapabilities?.openSurface?.(id),
    openSettings: (id: string) => hostCapabilities?.openSettings?.(id),
    composers: (sel: unknown) => (hostCapabilities?.composers ? hostCapabilities.composers(sel) : []),
    playAudio: async (src: { base64: string; mimeType: string }) => {
      await hostCapabilities?.playAudio?.(src);
    },
    rpc: async (contract: { name: string; output: ZodType }, rpcInput: unknown) => {
      if (!invokeDirectRpc) {
        throw new Error(`Direct client.rpc is unavailable outside RPC surface (${pluginId})`);
      }
      const out = await invokeDirectRpc(contract.name, rpcInput);
      return contract.output.parseAsync(out);
    },

    // Host UI contributions are already mounted once by Paseo itself; no-op here to avoid duplicates.
    addSettingsScreen: () => noopCleanup,
    addScreen: () => noopCleanup,
    addSurface: () => noopCleanup,
    addSidebarView: () => noopCleanup,
    addSidebarHeaderItem: () => noopCleanup,
    addSidebarFooterItem: () => noopCleanup,
    addSidebarItem: () => noopCleanup,
    addWorkspaceRowBadgeItem: () => noopCleanup,
    addFilePanel: () => noopCleanup,
    addComposerItem: () => noopCleanup,
    addNewWorkspaceItem: () => noopCleanup,
    addWorkspacePanel: () => noopCleanup,
    addAgentPanel: () => noopCleanup,
    addCommandCenterItem: () => noopCleanup,
    addSlashCommand: () => noopCleanup,
    addAttachmentSource: () => noopCleanup,
    addTheme: () => noopCleanup,
    addComposerPill: noopButtonRegistration,
    addHeaderButton: noopButtonRegistration,

    addTimelineTransformer(entry: Record<string, unknown>) {
      const id = validateContributionId(entry?.id, "timeline transformer id");
      if (entry.id !== id) {
        throw new Error(`Invalid timeline transformer id: ${String(entry.id)}`);
      }
      if (transformerIds.has(id)) {
        throw new Error(`Duplicate timeline transformer: ${id}`);
      }
      const query = entry.query as { itemType?: unknown } | undefined;
      if (!query || typeof query.itemType !== "string") {
        throw new Error(`Timeline transformer ${id} has no item type`);
      }
      if (!VALID_TRANSFORMER_ITEM_TYPES.has(query.itemType)) {
        throw new Error(`Timeline transformer ${id} has invalid item type: ${query.itemType}`);
      }
      if (typeof entry.transform !== "function") {
        throw new Error(`Timeline transformer ${id} has no transform`);
      }
      transformerIds.add(id);
      return registerItem(
        timelineTransformers,
        entry as unknown as TimelineTransformerLike,
        () => transformerIds.delete(id),
      );
    },

    addTimelineRenderer(entry: Record<string, unknown>) {
      const kind = validateContributionId(entry?.kind, "timeline renderer kind");
      const version = entry?.version;
      if (!Number.isInteger(version) || Number(version) < 1) {
        throw new Error(`Timeline renderer ${kind} has invalid version`);
      }
      const key = `${kind}/${String(version)}`;
      if (rendererKeys.has(key)) {
        throw new Error(`Duplicate timeline renderer: ${key}`);
      }
      const schema = entry?.schema as ZodType | undefined;
      if (!schema || typeof schema.safeParse !== "function") {
        throw new Error(`Timeline renderer ${key} has no schema`);
      }
      const comp = entry?.Component;
      const isValidComp =
        typeof comp === "function" ||
        (typeof comp === "object" && comp !== null && "$$typeof" in comp);
      if (!isValidComp) {
        throw new Error(`Timeline renderer ${key} is not a component`);
      }
      rendererKeys.add(key);
      return registerItem(
        timelineRenderers,
        {
          kind,
          version: Number(version),
          schema,
          Component: comp as ComponentShape,
        },
        () => rendererKeys.delete(key),
      );
    },
  };

  const factory = evaluateFactory(pluginId, bundleCode);
  const exportsObj = factory(requireModule);
  const contributeFn =
    exportsObj && typeof exportsObj === "object" ? Reflect.get(exportsObj, "default") : undefined;
  if (typeof contributeFn !== "function") {
    throw new Error(`Plugin ${pluginId} must default export a function`);
  }

  let userCleanup: unknown;
  try {
    userCleanup = contributeFn(clientContext);
    if (typeof userCleanup !== "function") {
      throw new Error(`Plugin ${pluginId} contribution must return a cleanup function`);
    }
  } catch (err) {
    try {
      if (typeof userCleanup === "function") {
        void Promise.resolve(userCleanup()).catch(() => {});
      }
    } finally {
      for (const dispose of disposers) dispose();
    }
    throw err;
  }

  let cleanedUp = false;
  return {
    id: pluginId,
    bundleHash,
    timelineTransformers,
    timelineRenderers,
    cleanup: async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        if (typeof userCleanup === "function") {
          await userCleanup();
        }
      } finally {
        for (const dispose of disposers) dispose();
      }
    },
  };
}
