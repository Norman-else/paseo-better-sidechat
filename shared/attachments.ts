import {
  PluginAttachmentItemSchema,
  type PluginAttachmentItem,
} from "@getpaseo/plugin";
import { z } from "zod";

export const FILE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB (matches Paseo's FILE_UPLOAD_MAX_BYTES)

/**
 * Official Forge Brand SVGs (matching Paseo's `ForgeBrandIcon` paths, self-contained & validated by `findSvgIconProblem`).
 */
export const FORGE_BRAND_SVGS: Readonly<Record<string, string>> = {
  github:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m12.301 0h.093c2.242 0 4.34.613 6.137 1.68l-.055-.031c1.871 1.094 3.386 2.609 4.449 4.422l.031.058c1.04 1.769 1.654 3.896 1.654 6.166 0 5.406-3.483 10-8.327 11.658l-.087.026c-.063.02-.135.031-.209.031-.162 0-.312-.054-.433-.144l.002.001c-.128-.115-.208-.281-.208-.466 0-.005 0-.01 0-.014v.001q0-.048.008-1.226t.008-2.154c.007-.075.011-.161.011-.249 0-.792-.323-1.508-.844-2.025.618-.061 1.176-.163 1.718-.305l-.076.017c.573-.16 1.073-.373 1.537-.642l-.031.017c.508-.28.938-.636 1.292-1.058l.006-.007c.372-.476.663-1.036.84-1.645l.009-.035c.209-.683.329-1.468.329-2.281 0-.045 0-.091-.001-.136v.007c0-.022.001-.047.001-.072 0-1.248-.482-2.383-1.269-3.23l.003.003c.168-.44.265-.948.265-1.479 0-.649-.145-1.263-.404-1.814l.011.026c-.115-.022-.246-.035-.381-.035-.334 0-.649.078-.929.216l.012-.005c-.568.21-1.054.448-1.512.726l.038-.022-.609.384c-.922-.264-1.981-.416-3.075-.416s-2.153.152-3.157.436l.081-.02q-.256-.176-.681-.433c-.373-.214-.814-.421-1.272-.595l-.066-.022c-.293-.154-.64-.244-1.009-.244-.124 0-.246.01-.364.03l.013-.002c-.248.524-.393 1.139-.393 1.788 0 .531.097 1.04.275 1.509l-.01-.029c-.785.844-1.266 1.979-1.266 3.227 0 .025 0 .051.001.076v-.004c-.001.039-.001.084-.001.13 0 .809.12 1.591.344 2.327l-.015-.057c.189.643.476 1.202.85 1.693l-.009-.013c.354.435.782.793 1.267 1.062l.022.011c.432.252.933.465 1.46.614l.046.011c.466.125 1.024.227 1.595.284l.046.004c-.431.428-.718 1-.784 1.638l-.001.012c-.207.101-.448.183-.699.236l-.021.004c-.256.051-.549.08-.85.08-.022 0-.044 0-.066 0h.003c-.394-.008-.756-.136-1.055-.348l.006.004c-.371-.259-.671-.595-.881-.986l-.007-.015c-.198-.336-.459-.614-.768-.827l-.009-.006c-.225-.169-.49-.301-.776-.38l-.016-.004-.32-.048c-.023-.002-.05-.003-.077-.003-.14 0-.273.028-.394.077l.007-.003q-.128.072-.08.184c.039.086.087.16.145.225l-.001-.001c.061.072.13.135.205.19l.003.002.112.08c.283.148.516.354.693.603l.004.006c.191.237.359.505.494.792l.01.024.16.368c.135.402.38.738.7.981l.005.004c.3.234.662.402 1.057.478l.016.002c.33.064.714.104 1.106.112h.007c.045.002.097.002.15.002.261 0 .517-.021.767-.062l-.027.004.368-.064q0 .609.008 1.418t.008.873v.014c0 .185-.08.351-.208.466h-.001c-.119.089-.268.143-.431.143-.075 0-.147-.011-.214-.032l.005.001c-4.929-1.689-8.409-6.283-8.409-11.69 0-2.268.612-4.393 1.681-6.219l-.032.058c1.094-1.871 2.609-3.386 4.422-4.449l.058-.031c1.739-1.034 3.835-1.645 6.073-1.645h.098-.005z"/></svg>',
  gitlab:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.6004 9.5927l-.0337-.0862L20.3 .9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.462-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z"/></svg>',
  gitea:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4.209 4.603c-.247 0-.525.02-.84.088-.333.07-1.28.283-2.054 1.027C-.403 7.25.035 9.685.089 10.052c.065.446.263 1.687 1.21 2.768 1.749 2.141 5.513 2.092 5.513 2.092s.462 1.103 1.168 2.119c.955 1.263 1.936 2.248 2.89 2.367 2.406 0 7.212-.004 7.212-.004s.458.004 1.08-.394c.535-.324 1.013-.893 1.013-.893s.492-.527 1.18-1.73c.21-.37.385-.729.538-1.068 0 0 2.107-4.471 2.107-8.823-.042-1.318-.367-1.55-.443-1.627-.156-.156-.366-.153-.366-.153s-4.475.252-6.792.306c-.508.011-1.012.023-1.512.027v4.474l-.634-.301c0-1.39-.004-4.17-.004-4.17-1.107.016-3.405-.084-3.405-.084s-5.399-.27-5.987-.324c-.187-.011-.401-.032-.648-.032zm.354 1.832h.111s.271 2.269.6 3.597C5.549 11.147 6.22 13 6.22 13s-.996-.119-1.641-.348c-.99-.324-1.409-.714-1.409-.714s-.73-.511-1.096-1.52C1.444 8.73 2.021 7.7 2.021 7.7s.32-.859 1.47-1.145c.395-.106.863-.12 1.072-.12z"/></svg>',
  forgejo:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16.7773 0c1.6018 0 2.9004 1.2986 2.9004 2.9005s-1.2986 2.9004-2.9004 2.9004c-1.0854 0-2.0315-.596-2.5288-1.4787H12.91c-2.3322 0-4.2272 1.8718-4.2649 4.195l-.0007 2.1175a7.0759 7.0759 0 0 1 4.148-1.4205l.1176-.001 1.3385.0002c.4973-.8827 1.4434-1.4788 2.5288-1.4788 1.6018 0 2.9004 1.2986 2.9004 2.9005s-1.2986 2.9004-2.9004 2.9004c-1.0854 0-2.0315-.596-2.5288-1.4787H12.91c-2.3322 0-4.2272 1.8718-4.2649 4.195l-.0007 2.319c.8827.4973 1.4788 1.4434 1.4788 2.5287 0 1.602-1.2986 2.9005-2.9005 2.9005-1.6018 0-2.9004-1.2986-2.9004-2.9005 0-1.0853.596-2.0314 1.4788-2.5287l-.0002-9.9831c0-3.887 3.1195-7.0453 6.9915-7.108l.1176-.001h1.3385C14.7458.5962 15.692 0 16.7773 0Z"/></svg>',
  codeberg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.999.747A11.974 11.974 0 0 0 0 12.75c0 2.254.635 4.465 1.833 6.376L11.837 6.19c.072-.092.251-.092.323 0l4.178 5.402h-2.992l.065.239h3.113l.882 1.138h-3.674l.103.374h3.86l.777 1.003h-4.358l.135.483h4.593l.695.894h-5.038l.165.589h5.326l.609.785h-5.717l.182.65h6.038l.562.727h-6.397l.183.65h6.717A12.003 12.003 0 0 0 24 12.75 11.977 11.977 0 0 0 11.999.747z"/></svg>',
};

export interface ForgePresentation {
  forge: string;
  brandLabel: string;
  iconSvg: string | null;
  fallbackIconName: string;
  changeRequestAbbrev: "PR" | "MR";
  numberPrefix: "#" | "!";
  issueNumberPrefix: "#";
  isMergeRequest: boolean;
}

export function detectForgeFromRemoteUrl(remoteUrl: string | null | undefined): string {
  const raw = remoteUrl?.trim() ?? "";
  if (!raw) return "github";

  let host = "";
  const scpMatch = raw.includes("://") ? null : raw.match(/^[^@]+@([^:]+):(.+)$/u);
  if (scpMatch?.[1]) {
    host = scpMatch[1].trim().toLowerCase();
  } else {
    try {
      host = new URL(raw).hostname.trim().toLowerCase();
    } catch {
      host = "";
    }
  }

  if (!host) return "github";
  if (host === "github.com" || host === "ssh.github.com" || host.includes("github")) {
    return "github";
  }
  if (host === "gitlab.com" || host.includes("gitlab")) {
    return "gitlab";
  }
  if (host === "codeberg.org" || host.includes("codeberg")) {
    return "codeberg";
  }
  if (host.includes("forgejo")) {
    return "forgejo";
  }
  if (host === "gitea.com" || host.includes("gitea")) {
    return "gitea";
  }
  return "github";
}

export function resolveForgePresentation(forgeId: string | null | undefined): ForgePresentation {
  const normalized = (forgeId?.trim().toLowerCase() || "github");
  switch (normalized) {
    case "gitlab":
      return {
        forge: "gitlab",
        brandLabel: "GitLab",
        iconSvg: FORGE_BRAND_SVGS.gitlab,
        fallbackIconName: "GitPullRequest",
        changeRequestAbbrev: "MR",
        numberPrefix: "!",
        issueNumberPrefix: "#",
        isMergeRequest: true,
      };
    case "gitea":
      return {
        forge: "gitea",
        brandLabel: "Gitea",
        iconSvg: FORGE_BRAND_SVGS.gitea,
        fallbackIconName: "GitPullRequest",
        changeRequestAbbrev: "PR",
        numberPrefix: "#",
        issueNumberPrefix: "#",
        isMergeRequest: false,
      };
    case "forgejo":
      return {
        forge: "forgejo",
        brandLabel: "Forgejo",
        iconSvg: FORGE_BRAND_SVGS.forgejo,
        fallbackIconName: "GitPullRequest",
        changeRequestAbbrev: "PR",
        numberPrefix: "#",
        issueNumberPrefix: "#",
        isMergeRequest: false,
      };
    case "codeberg":
      return {
        forge: "codeberg",
        brandLabel: "Codeberg",
        iconSvg: FORGE_BRAND_SVGS.codeberg,
        fallbackIconName: "GitPullRequest",
        changeRequestAbbrev: "PR",
        numberPrefix: "#",
        issueNumberPrefix: "#",
        isMergeRequest: false,
      };
    case "github":
    default:
      return {
        forge: normalized || "github",
        brandLabel: normalized === "github" ? "GitHub" : normalized,
        iconSvg: FORGE_BRAND_SVGS[normalized] ?? FORGE_BRAND_SVGS.github,
        fallbackIconName: "GitPullRequest",
        changeRequestAbbrev: "PR",
        numberPrefix: "#",
        issueNumberPrefix: "#",
        isMergeRequest: false,
      };
  }
}

export const forgeSearchItemSchema = z.object({
  kind: z.enum(["issue", "change_request"]),
  forge: z.string().default("github"),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  body: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  projectPath: z.string().nullable().optional(),
  baseRefName: z.string().nullable().optional(),
  headRefName: z.string().nullable().optional(),
});

export type ForgeSearchItem = z.infer<typeof forgeSearchItemSchema>;

export const uploadedFileAttachmentSchema = z.object({
  type: z.literal("uploaded_file"),
  id: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  path: z.string().min(1),
});

export type UploadedFileAttachmentData = z.infer<typeof uploadedFileAttachmentSchema>;

export const discoveredAttachmentSourceSchema = z.object({
  key: z.string().min(1),
  pluginId: z.string().min(1),
  sourceId: z.string().min(1),
  title: z.string().min(1),
  menuLabel: z.string().min(1),
  pickerTitle: z.string().min(1),
  searchPlaceholder: z.string(),
  iconName: z.string().nullable().optional(),
  iconSvg: z.string().nullable().optional(),
  searchMethod: z.string().min(1),
});

export type DiscoveredAttachmentSource = z.infer<typeof discoveredAttachmentSourceSchema>;

export { PluginAttachmentItemSchema, type PluginAttachmentItem };

export type SidechatComposerAttachment =
  | {
      kind: "image";
      id: string;
      fileName: string;
      mimeType: string;
      size: number;
      dataBase64: string;
    }
  | {
      kind: "file";
      id: string;
      attachment: UploadedFileAttachmentData;
    }
  | {
      kind: "forge";
      id: string;
      item: ForgeSearchItem;
    }
  | {
      kind: "plugin_resource";
      id: string;
      pluginId: string;
      sourceId: string;
      sourceTitle: string;
      iconName?: string | null;
      iconSvg?: string | null;
      item: PluginAttachmentItem;
    };

export type SidechatWireAgentAttachment =
  | {
      type: "forge_change_request";
      mimeType: "application/paseo-forge-change-request";
      forge: string;
      number: number;
      title: string;
      url: string;
      body?: string;
      projectPath?: string;
      baseRefName?: string;
      headRefName?: string;
    }
  | {
      type: "forge_issue";
      mimeType: "application/paseo-forge-issue";
      forge: string;
      number: number;
      title: string;
      url: string;
      body?: string;
      projectPath?: string;
    }
  | {
      type: "text";
      mimeType: "text/plain";
      title: string;
      text: string;
      externalResource: {
        provider: string;
        providerLabel: string;
        resourceType: string;
        id: string;
        identifier: string;
        title: string;
        url: string;
      };
    }
  | UploadedFileAttachmentData;

export function toggleForgeComposerAttachment(
  current: readonly SidechatComposerAttachment[],
  item: ForgeSearchItem,
): SidechatComposerAttachment[] {
  const matches = (entry: SidechatComposerAttachment) =>
    entry.kind === "forge" &&
    entry.item.kind === item.kind &&
    entry.item.number === item.number &&
    entry.item.forge === item.forge;

  if (current.some(matches)) {
    return current.filter((entry) => !matches(entry));
  }
  return [
    ...current,
    {
      kind: "forge",
      id: `forge:${item.forge}:${item.kind}:${item.number}`,
      item,
    },
  ];
}

export function togglePluginResourceComposerAttachment(
  current: readonly SidechatComposerAttachment[],
  next: Omit<Extract<SidechatComposerAttachment, { kind: "plugin_resource" }>, "kind" | "id">,
): SidechatComposerAttachment[] {
  const matches = (entry: SidechatComposerAttachment) =>
    entry.kind === "plugin_resource" &&
    entry.pluginId === next.pluginId &&
    entry.sourceId === next.sourceId &&
    entry.item.id === next.item.id;

  if (current.some(matches)) {
    return current.filter((entry) => !matches(entry));
  }
  return [
    ...current,
    {
      kind: "plugin_resource",
      id: `plugin:${next.pluginId}:${next.sourceId}:${next.item.id}`,
      ...next,
    },
  ];
}

/**
 * Converts Sidechat composer attachments into Paseo's exact wire `images` & `attachments`
 * payload (matching `splitComposerAttachmentsForSubmit` in Paseo's composer).
 */
export function splitSidechatAttachmentsForSubmit(
  attachments: readonly SidechatComposerAttachment[],
): {
  images: Array<{ data: string; mimeType: string }>;
  attachments: SidechatWireAgentAttachment[];
} {
  const images: Array<{ data: string; mimeType: string }> = [];
  const wireAttachments: SidechatWireAgentAttachment[] = [];

  for (const entry of attachments) {
    if (entry.kind === "image") {
      images.push({
        data: entry.dataBase64,
        mimeType: entry.mimeType,
      });
      continue;
    }

    if (entry.kind === "file") {
      wireAttachments.push(entry.attachment);
      continue;
    }

    if (entry.kind === "plugin_resource") {
      wireAttachments.push({
        type: "text",
        mimeType: "text/plain",
        title: `${entry.item.identifier} ${entry.item.title}`,
        text: entry.item.text,
        externalResource: {
          provider: entry.pluginId,
          providerLabel: entry.sourceTitle,
          resourceType: entry.item.resourceType,
          id: entry.item.id,
          identifier: entry.item.identifier,
          title: entry.item.title,
          url: entry.item.url,
        },
      });
      continue;
    }

    if (entry.kind === "forge") {
      const item = entry.item;
      if (item.kind === "change_request") {
        wireAttachments.push({
          type: "forge_change_request",
          mimeType: "application/paseo-forge-change-request",
          forge: item.forge || "github",
          number: item.number,
          title: item.title,
          url: item.url,
          ...(item.body ? { body: item.body } : {}),
          ...(item.projectPath ? { projectPath: item.projectPath } : {}),
          ...(item.baseRefName ? { baseRefName: item.baseRefName } : {}),
          ...(item.headRefName ? { headRefName: item.headRefName } : {}),
        });
      } else {
        wireAttachments.push({
          type: "forge_issue",
          mimeType: "application/paseo-forge-issue",
          forge: item.forge || "github",
          number: item.number,
          title: item.title,
          url: item.url,
          ...(item.body ? { body: item.body } : {}),
          ...(item.projectPath ? { projectPath: item.projectPath } : {}),
        });
      }
    }
  }

  return { images, attachments: wireAttachments };
}

export function formatAttachmentBadgeLabel(entry: SidechatComposerAttachment): string {
  switch (entry.kind) {
    case "image":
      return entry.fileName;
    case "file":
      return entry.attachment.fileName;
    case "forge": {
      const pres = resolveForgePresentation(entry.item.forge);
      const prefix =
        entry.item.kind === "change_request" ? pres.numberPrefix : pres.issueNumberPrefix;
      return `${prefix}${entry.item.number} ${entry.item.title}`;
    }
    case "plugin_resource":
      return `${entry.item.identifier} ${entry.item.title}`;
  }
}

export function formatFileSizeCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function deriveEffectivePromptLabel(
  rawText: string,
  attachments: readonly SidechatComposerAttachment[],
): string {
  const trimmed = rawText.trim();
  if (trimmed) return trimmed;
  if (attachments.length === 0) return "";
  return attachments.map(formatAttachmentBadgeLabel).join(", ");
}
