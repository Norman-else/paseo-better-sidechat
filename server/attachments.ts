import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import vm from "node:vm";
import { createHostClient } from "@getpaseo/client/node";
import {
  findSvgIconProblem,
  PluginAttachmentItemSchema,
  PluginAttachmentSearchPayloadSchema,
  type PluginAttachmentItem,
} from "@getpaseo/plugin";
import { execCommand } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  detectForgeFromRemoteUrl,
  FILE_UPLOAD_MAX_BYTES,
  type DiscoveredAttachmentSource,
  type ForgeSearchItem,
  type UploadedFileAttachmentData,
} from "../shared/attachments";

type HostClientInstance = ReturnType<typeof createHostClient>;

interface RawExtractedSource {
  id: string;
  title: unknown;
  pickerTitle: unknown;
  searchPlaceholder: unknown;
  icon: unknown;
  searchMethod: string;
}

interface PaseoStatusJson {
  home?: string;
  listen?: string;
}

function sanitizeUploadFileName(rawName: string): string {
  const base = basename(rawName.trim() || "attachment").replace(/[\0/\\]/g, "_");
  const cleaned = base.replace(/^\.+/, "");
  if (!cleaned) return "attachment";
  if (cleaned.length <= 180) return cleaned;
  const ext = extname(cleaned).slice(0, 24);
  return `${cleaned.slice(0, 180 - ext.length)}${ext}`;
}

function lookupNestedString(
  obj: Record<string, unknown> | undefined,
  dottedKey: string,
): string | null {
  if (!obj) return null;
  let cursor: unknown = obj;
  for (const part of dottedKey.split(".")) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : null;
}

function resolvePluginTextValue(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).__paseoMsg === true
  ) {
    const msg = value as {
      resources?: Record<string, Record<string, unknown>>;
      key?: string;
      options?: Record<string, unknown>;
    };
    const key = msg.key ?? "";
    const resources = msg.resources ?? {};
    const baseLang = locale.split(/[-_]/)[0] ?? "en";
    const raw =
      lookupNestedString(resources[locale], key) ??
      lookupNestedString(resources[baseLang], key) ??
      lookupNestedString(resources.en, key) ??
      key;
    if (!msg.options) return raw;
    return raw.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_m, k: string) => {
      const replacement = msg.options?.[k];
      return replacement === undefined ? "" : String(replacement);
    });
  }
  return "";
}

function createNoopModuleProxy(): Record<string, unknown> {
  const noopFn = () => null;
  return new Proxy(
    {
      Platform: {
        OS: "web",
        select: (spec: Record<string, unknown>) => spec?.web ?? spec?.default,
      },
      StyleSheet: {
        create: <T>(styles: T) => styles,
        hairlineWidth: 1,
        flatten: <T>(style: T) => style,
      },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        if (prop === "__esModule") return true;
        return noopFn;
      },
    },
  );
}

/**
 * Evaluates a Paseo plugin client bundle inside an isolated VM context solely to capture
 * declarative `client.addAttachmentSource(...)` registrations (`id`, `title`, `icon`, `search.name`),
 * matching Paseo's own `PluginRegistry` discovery without touching plugin credentials or state.
 */
export function extractAttachmentSourcesFromClientBundle(
  pluginId: string,
  clientBundle: string,
): RawExtractedSource[] {
  if (!clientBundle || !clientBundle.includes("addAttachmentSource")) {
    return [];
  }

  const collected: RawExtractedSource[] = [];
  const noopProxy = createNoopModuleProxy();
  const noopCleanup = () => {};
  const noopButtonReg = { update: noopCleanup, remove: noopCleanup };

  const pluginRootStub = {
    defineAttachmentSource: <T>(def: T) => def,
    defineRpc: <T>(def: T) => def,
    defineSubscription: <T>(def: T) => def,
    defineSettings: <T>(def: T) => def,
    settingsRpc: (id: string) => ({
      read: { name: `settings.${id}.read` },
      write: { name: `settings.${id}.write` },
      reset: { name: `settings.${id}.reset` },
    }),
    PluginAttachmentItemSchema,
    PluginAttachmentSearchPayloadSchema,
    findSvgIconProblem,
  };

  const pluginClientStub = {
    defineTranslations: (def: { resources?: Record<string, Record<string, unknown>> }) => ({
      resources: def?.resources ?? {},
      message: (key: string, options?: Record<string, unknown>) => ({
        __paseoMsg: true,
        resources: def?.resources ?? {},
        key,
        options,
      }),
    }),
    useTranslation: () => ({ t: (k: string) => k, locale: "en" }),
    usePaseo: () => ({}),
    useRpc: () => async () => ({}),
    useSubscription: () => ({ status: "closed" }),
    useSettings: () => ({ status: "loading" }),
    useWorkspace: () => null,
    useAgent: () => null,
    useProject: () => null,
    useTerminal: () => null,
    useWorkspaces: () => [],
    useAgents: () => [],
    useProjects: () => [],
    useTerminals: () => [],
    useComposer: () => ({}),
    useComposers: () => [],
    useNewWorkspace: () => ({}),
    useTabState: () => [null, noopCleanup],
    useHosts: () => [],
    getPaseoClient: () => ({}),
    openExternalUrl: async () => {},
  };

  const reactStub = {
    createElement: () => null,
    Fragment: Symbol.for("react.fragment"),
    createContext: (def: unknown) => ({ Provider: () => null, Consumer: () => null, _currentValue: def }),
    forwardRef: (fn: unknown) => fn,
    memo: (fn: unknown) => fn,
    useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, noopCleanup],
    useEffect: noopCleanup,
    useLayoutEffect: noopCleanup,
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useRef: (init: unknown) => ({ current: init }),
    useContext: () => null,
    useId: () => "id",
    useSyncExternalStore: (_sub: unknown, getSnap: () => unknown) => getSnap(),
  };

  const jsxRuntimeStub = {
    jsx: () => null,
    jsxs: () => null,
    Fragment: Symbol.for("react.fragment"),
  };

  const reactQueryStub = {
    QueryClient: class {},
    QueryClientProvider: () => null,
    useQuery: () => ({ data: undefined, isLoading: false, isFetching: false, error: null }),
    useMutation: () => ({ mutate: noopCleanup, mutateAsync: async () => ({}), isPending: false }),
    useQueryClient: () => ({ invalidateQueries: async () => {} }),
  };

  const mockRequire = (specifier: string): unknown => {
    switch (specifier) {
      case "@getpaseo/plugin":
        return pluginRootStub;
      case "@getpaseo/plugin/client":
        return pluginClientStub;
      case "@getpaseo/plugin/client/ui":
      case "@getpaseo/plugin/client/react-native":
      case "react-native":
        return noopProxy;
      case "react":
        return reactStub;
      case "react/jsx-runtime":
        return jsxRuntimeStub;
      case "@tanstack/react-query":
        return reactQueryStub;
      case "zod":
        return { z, ...z };
      default:
        return noopProxy;
    }
  };

  const mockClientContext = new Proxy(
    {
      i18n: {
        locale: "en",
        t: (messages: { message: (k: string, o?: Record<string, unknown>) => unknown }, key: string, opts?: Record<string, unknown>) =>
          resolvePluginTextValue(messages.message(key, opts), "en"),
        resolve: (val: unknown) => resolvePluginTextValue(val, "en"),
        subscribe: () => noopCleanup,
      },
      addAttachmentSource(source: Record<string, unknown>) {
        if (!source || typeof source !== "object") return noopCleanup;
        const id = typeof source.id === "string" ? source.id.trim() : "";
        const searchObj =
          source.search && typeof source.search === "object"
            ? (source.search as Record<string, unknown>)
            : null;
        const searchMethod =
          searchObj && typeof searchObj.name === "string" ? searchObj.name.trim() : "";
        if (id && searchMethod) {
          collected.push({
            id,
            title: source.title,
            pickerTitle: source.pickerTitle,
            searchPlaceholder: source.searchPlaceholder,
            icon: source.icon,
            searchMethod,
          });
        }
        return noopCleanup;
      },
      addHeaderButton: () => noopButtonReg,
      addComposerPill: () => noopButtonReg,
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        return () => noopCleanup;
      },
    },
  );

  let cleanupFn: unknown = null;
  try {
    const factory = vm.runInNewContext(
      clientBundle,
      {
        console: { log: noopCleanup, warn: noopCleanup, error: noopCleanup, info: noopCleanup, debug: noopCleanup },
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        setTimeout,
        clearTimeout,
      },
      { timeout: 1_500, filename: `${pluginId}.client.bundle.js` },
    );

    if (typeof factory !== "function") return [];
    const exported = factory(mockRequire) as { default?: unknown } | null;
    const contribute = exported && typeof exported === "object" ? exported.default : null;
    if (typeof contribute !== "function") return [];
    cleanupFn = (contribute as (ctx: unknown) => unknown)(mockClientContext);
  } catch {
    return collected;
  } finally {
    try {
      if (typeof cleanupFn === "function") {
        void Promise.resolve((cleanupFn as () => unknown)()).catch(() => {});
      }
    } catch {
      // Ignore cleanup errors from stubbed hooks
    }
  }

  return collected;
}

export class SidechatAttachmentService {
  private hostClient: HostClientInstance | null = null;
  private connectingPromise: Promise<HostClientInstance | null> | null = null;
  private paseoHomeDir: string = join(homedir(), ".paseo");
  private readonly bundleCache = new Map<
    string,
    { hash: string; sources: RawExtractedSource[] }
  >();

  constructor(private readonly resolvePaseoBin: () => string) {}

  private async getConnectedHostClient(): Promise<HostClientInstance | null> {
    if (this.hostClient && this.hostClient.isConnected) {
      return this.hostClient;
    }
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      try {
        const res = await execCommand(this.resolvePaseoBin(), ["status", "--json"], {
          timeout: 6_000,
        });
        if (!res.stdout.trim()) return null;
        const parsed = JSON.parse(res.stdout) as PaseoStatusJson;
        if (parsed.home && typeof parsed.home === "string") {
          this.paseoHomeDir = parsed.home;
        }
        const listen = typeof parsed.listen === "string" ? parsed.listen.trim() : "";
        if (!listen) return null;

        if (this.hostClient) {
          await this.hostClient.close().catch(() => {});
          this.hostClient = null;
        }

        const client = createHostClient(listen, {
          clientId: `paseo-better-sidechat-${randomUUID().slice(0, 8)}`,
          clientType: "cli",
          password: process.env.PASEO_PASSWORD,
          connectTimeoutMs: 6_000,
          reconnect: { enabled: true },
        });
        await client.connect();
        this.hostClient = client;
        return client;
      } catch {
        return null;
      } finally {
        this.connectingPromise = null;
      }
    })();

    return this.connectingPromise;
  }

  async getForgeInfo(cwd: string): Promise<{ forge: string; remoteUrl: string | null }> {
    let remoteUrl: string | null = null;
    const client = await this.getConnectedHostClient();
    if (client) {
      try {
        const status = await client.getCheckoutStatus(cwd);
        remoteUrl = status.remoteUrl ?? null;
      } catch {
        remoteUrl = null;
      }
    }

    if (!remoteUrl) {
      try {
        const gitRes = await execCommand("git", ["remote", "get-url", "origin"], {
          cwd,
          timeout: 4_000,
        });
        if (gitRes.stdout.trim()) {
          remoteUrl = gitRes.stdout.trim();
        }
      } catch {
        remoteUrl = null;
      }
    }

    return {
      forge: detectForgeFromRemoteUrl(remoteUrl),
      remoteUrl,
    };
  }

  async searchForge(input: {
    cwd: string;
    query: string;
  }): Promise<{
    forge: string;
    items: ForgeSearchItem[];
    authState: string | null;
    error: string | null;
  }> {
    const info = await this.getForgeInfo(input.cwd);
    const client = await this.getConnectedHostClient();

    if (client) {
      try {
        const res = await client.searchForge({
          cwd: input.cwd,
          query: input.query,
          limit: 25,
        });
        const rawItems: unknown[] = Array.isArray(res.items) ? res.items : [];
        const items: ForgeSearchItem[] = [];
        for (const entry of rawItems) {
          if (!entry || typeof entry !== "object") continue;
          const rec = entry as Record<string, unknown>;
          if (
            typeof rec.number !== "number" ||
            typeof rec.title !== "string" ||
            typeof rec.url !== "string"
          ) {
            continue;
          }
          items.push({
            kind: rec.kind === "change_request" ? "change_request" : "issue",
            forge: typeof rec.forge === "string" && rec.forge ? rec.forge : info.forge,
            number: rec.number,
            title: rec.title,
            url: rec.url,
            body: typeof rec.body === "string" ? rec.body : null,
            state: typeof rec.state === "string" ? rec.state : null,
            projectPath: typeof rec.projectPath === "string" ? rec.projectPath : null,
            baseRefName: typeof rec.baseRefName === "string" ? rec.baseRefName : null,
            headRefName: typeof rec.headRefName === "string" ? rec.headRefName : null,
          });
        }
        return {
          forge: items[0]?.forge ?? info.forge,
          items,
          authState: typeof res.authState === "string" ? res.authState : null,
          error: typeof res.error === "string" ? res.error : null,
        };
      } catch (err) {
        // Fall through to CLI fallback if daemon RPC failed
        void err;
      }
    }

    return this.searchForgeViaCliFallback(input.cwd, info.forge, input.query);
  }

  private async searchForgeViaCliFallback(
    cwd: string,
    forge: string,
    query: string,
  ): Promise<{
    forge: string;
    items: ForgeSearchItem[];
    authState: string | null;
    error: string | null;
  }> {
    const trimmed = query.trim();
    if (forge === "gitlab") {
      try {
        const [issuesRes, mrsRes] = await Promise.all([
          execCommand(
            "glab",
            ["issue", "list", "-F", "json", "-P", "15", ...(trimmed ? ["--search", trimmed] : [])],
            { cwd, timeout: 10_000 },
          ).catch(() => null),
          execCommand(
            "glab",
            ["mr", "list", "-F", "json", "-P", "15", ...(trimmed ? ["--search", trimmed] : [])],
            { cwd, timeout: 10_000 },
          ).catch(() => null),
        ]);
        const items: ForgeSearchItem[] = [];
        if (mrsRes?.stdout.trim()) {
          const parsed = JSON.parse(mrsRes.stdout) as Array<Record<string, unknown>>;
          for (const mr of parsed) {
            if (typeof mr.iid === "number" && typeof mr.title === "string" && typeof mr.web_url === "string") {
              items.push({
                kind: "change_request",
                forge: "gitlab",
                number: mr.iid,
                title: mr.title,
                url: mr.web_url,
                body: typeof mr.description === "string" ? mr.description : null,
                baseRefName: typeof mr.target_branch === "string" ? mr.target_branch : null,
                headRefName: typeof mr.source_branch === "string" ? mr.source_branch : null,
              });
            }
          }
        }
        if (issuesRes?.stdout.trim()) {
          const parsed = JSON.parse(issuesRes.stdout) as Array<Record<string, unknown>>;
          for (const issue of parsed) {
            if (typeof issue.iid === "number" && typeof issue.title === "string" && typeof issue.web_url === "string") {
              items.push({
                kind: "issue",
                forge: "gitlab",
                number: issue.iid,
                title: issue.title,
                url: issue.web_url,
                body: typeof issue.description === "string" ? issue.description : null,
              });
            }
          }
        }
        return { forge, items, authState: "authenticated", error: null };
      } catch (error) {
        return {
          forge,
          items: [],
          authState: "error",
          error: error instanceof Error ? error.message : "GitLab search failed",
        };
      }
    }

    // Default GitHub (`gh`) CLI fallback
    try {
      const searchArgs = trimmed ? ["--search", trimmed] : [];
      const [prsRes, issuesRes] = await Promise.all([
        execCommand(
          "gh",
          [
            "pr",
            "list",
            "--limit",
            "15",
            "--state",
            "all",
            ...searchArgs,
            "--json",
            "number,title,url,body,state,baseRefName,headRefName",
          ],
          { cwd, timeout: 10_000 },
        ).catch(() => null),
        execCommand(
          "gh",
          [
            "issue",
            "list",
            "--limit",
            "15",
            "--state",
            "all",
            ...searchArgs,
            "--json",
            "number,title,url,body,state",
          ],
          { cwd, timeout: 10_000 },
        ).catch(() => null),
      ]);

      const items: ForgeSearchItem[] = [];
      if (prsRes?.stdout.trim()) {
        const parsed = JSON.parse(prsRes.stdout) as Array<Record<string, unknown>>;
        for (const pr of parsed) {
          if (typeof pr.number === "number" && typeof pr.title === "string" && typeof pr.url === "string") {
            items.push({
              kind: "change_request",
              forge: "github",
              number: pr.number,
              title: pr.title,
              url: pr.url,
              body: typeof pr.body === "string" ? pr.body : null,
              state: typeof pr.state === "string" ? pr.state : null,
              baseRefName: typeof pr.baseRefName === "string" ? pr.baseRefName : null,
              headRefName: typeof pr.headRefName === "string" ? pr.headRefName : null,
            });
          }
        }
      }
      if (issuesRes?.stdout.trim()) {
        const parsed = JSON.parse(issuesRes.stdout) as Array<Record<string, unknown>>;
        for (const issue of parsed) {
          if (typeof issue.number === "number" && typeof issue.title === "string" && typeof issue.url === "string") {
            items.push({
              kind: "issue",
              forge: "github",
              number: issue.number,
              title: issue.title,
              url: issue.url,
              body: typeof issue.body === "string" ? issue.body : null,
              state: typeof issue.state === "string" ? issue.state : null,
            });
          }
        }
      }
      return { forge: "github", items, authState: "authenticated", error: null };
    } catch (error) {
      return {
        forge,
        items: [],
        authState: "error",
        error: error instanceof Error ? error.message : "Forge search failed",
      };
    }
  }

  async listPluginAttachmentSources(locale: string): Promise<DiscoveredAttachmentSource[]> {
    const client = await this.getConnectedHostClient();
    if (!client) return [];

    try {
      const catalog = await client.getPluginCatalog();
      const results: DiscoveredAttachmentSource[] = [];

      for (const plugin of catalog) {
        if (plugin.id === "paseo-better-sidechat" || !plugin.clientBundle) continue;

        const hash =
          plugin.clientBundleHash ||
          createHash("sha256").update(plugin.clientBundle).digest("hex");
        let cached = this.bundleCache.get(plugin.id);
        if (!cached || cached.hash !== hash) {
          const extracted = extractAttachmentSourcesFromClientBundle(
            plugin.id,
            plugin.clientBundle,
          );
          cached = { hash, sources: extracted };
          this.bundleCache.set(plugin.id, cached);
        }

        for (const src of cached.sources) {
          const title = resolvePluginTextValue(src.title, locale).trim() || src.id;
          const pickerTitle =
            resolvePluginTextValue(src.pickerTitle, locale).trim() || `Attach ${title}`;
          const searchPlaceholder =
            resolvePluginTextValue(src.searchPlaceholder, locale).trim() ||
            `Search ${title}…`;

          // Paseo's native `usePluginAttachmentPicker` renders `Attach ${resolvedTitle}` in the `+` menu!
          const menuLabel = `Attach ${title}`;

          let iconName: string | null = null;
          let iconSvg: string | null = null;
          if (typeof src.icon === "string" && src.icon.trim()) {
            iconName = src.icon.trim();
          } else if (
            src.icon &&
            typeof src.icon === "object" &&
            typeof (src.icon as { svg?: unknown }).svg === "string"
          ) {
            const candidateSvg = (src.icon as { svg: string }).svg.trim();
            if (findSvgIconProblem(candidateSvg) === null) {
              iconSvg = candidateSvg;
            }
          }

          results.push({
            key: `${plugin.id}/${src.id}`,
            pluginId: plugin.id,
            sourceId: src.id,
            title,
            menuLabel,
            pickerTitle,
            searchPlaceholder,
            iconName: iconName ?? (iconSvg ? null : "Paperclip"),
            iconSvg,
            searchMethod: src.searchMethod,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  async searchPluginAttachmentSource(input: {
    pluginId: string;
    searchMethod: string;
    query: string;
  }): Promise<{ items: PluginAttachmentItem[]; error: string | null }> {
    const client = await this.getConnectedHostClient();
    if (!client) {
      return { items: [], error: "Plugin host is offline" };
    }

    try {
      const raw = await client.invokePluginRpc(input.pluginId, input.searchMethod, {
        query: input.query.trim(),
      });
      const parsed = PluginAttachmentSearchPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        return { items: [], error: "Invalid attachment search response" };
      }
      return { items: parsed.data.items, error: null };
    } catch (error) {
      return {
        items: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async uploadFile(input: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<UploadedFileAttachmentData> {
    const bytes = Buffer.from(input.dataBase64, "base64");
    if (bytes.byteLength > FILE_UPLOAD_MAX_BYTES) {
      throw new Error(`File exceeds maximum upload size (50 MB): ${input.fileName}`);
    }

    const safeName = sanitizeUploadFileName(input.fileName);
    const mimeType = input.mimeType.trim() || "application/octet-stream";

    const client = await this.getConnectedHostClient();
    if (client) {
      try {
        const uploaded = await client.uploadFile({
          fileName: safeName,
          mimeType,
          bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        });
        if (uploaded.file && !uploaded.error) {
          return {
            type: "uploaded_file",
            id: uploaded.file.id,
            fileName: uploaded.file.fileName,
            mimeType: uploaded.file.mimeType,
            size: uploaded.file.size,
            path: uploaded.file.path,
          };
        }
      } catch {
        // Fall back to direct Paseo uploads directory staging
      }
    }

    const id = `upload_${randomUUID()}`;
    const targetDir = join(this.paseoHomeDir, "uploads", id);
    await mkdir(targetDir, { recursive: true });
    const targetPath = join(targetDir, safeName);
    await writeFile(targetPath, bytes);

    return {
      type: "uploaded_file",
      id,
      fileName: safeName,
      mimeType,
      size: bytes.byteLength,
      path: targetPath,
    };
  }

  async close(): Promise<void> {
    const current = this.hostClient;
    this.hostClient = null;
    if (current) {
      await current.close().catch(() => {});
    }
  }
}

export function resolveDefaultPaseoCliBin(): string {
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
