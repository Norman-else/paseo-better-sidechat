import { defineRpc, PluginAttachmentItemSchema } from "@getpaseo/plugin";
import { z } from "zod";
import {
  discoveredAttachmentSourceSchema,
  forgeSearchItemSchema,
  uploadedFileAttachmentSchema,
} from "./attachments";
import { sidechatSettingsSchema } from "./settings";

export const preferencesRpc = defineRpc({
  name: "sidechat.preferences.get",
  input: z.object({}),
  output: sidechatSettingsSchema,
});

export const sidechatThreadStatusSchema = z.enum([
  "initializing",
  "idle",
  "running",
  "error",
  "closed",
]);

export const sidechatThreadSchema = z.object({
  agentId: z.string().min(1),
  workspaceId: z.string().min(1),
  parentAgentId: z.string().nullable(),
  title: z.string(),
  cwd: z.string(),
  provider: z.string(),
  model: z.string().nullable(),
  modeId: z.string().nullable(),
  thinkingOptionId: z.string().nullable(),
  status: sidechatThreadStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SidechatThread = z.infer<typeof sidechatThreadSchema>;

export const mainContextDigestSchema = z.object({
  agentId: z.string(),
  title: z.string().nullable(),
  turnCount: z.number().int().nonnegative(),
  touchedFiles: z.array(z.string()),
  recentPrompts: z.array(z.string()),
  summaryPreview: z.string(),
  digest: z.string(),
});

export const listThreadsRpc = defineRpc({
  name: "sidechat.threads.list",
  input: z.object({
    workspaceId: z.string().min(1),
    parentAgentId: z.string().optional(),
  }),
  output: z.object({
    threads: z.array(sidechatThreadSchema),
  }),
});

export const createThreadRpc = defineRpc({
  name: "sidechat.threads.create",
  input: z.object({
    workspaceId: z.string().min(1),
    parentAgentId: z.string().nullable().optional(),
    cwd: z.string().min(1),
    prompt: z.string(),
    titleSeed: z.string().optional(),
    clientMessageId: z.string().optional(),
    providerModel: z.string().optional(),
    modeId: z.string().nullable().optional(),
    thinkingOptionId: z.string().nullable().optional(),
    fastMode: z.boolean().optional(),
    providerOptions: z.record(z.string(), z.unknown()).optional(),
    attachMainContext: z.boolean().default(false),
    quotedSelection: z.string().nullable().optional(),
    deferInitialSend: z.boolean().default(false),
  }),
  output: z.object({
    thread: sidechatThreadSchema,
    sentPrompt: z.string(),
  }),
});

export const updateThreadRpc = defineRpc({
  name: "sidechat.threads.update",
  input: z.object({
    agentId: z.string().min(1),
    workspaceId: z.string().min(1),
    action: z.enum(["rename", "archive", "touch"]),
    title: z.string().max(120).optional(),
  }),
  output: z.object({
    ok: z.boolean(),
  }),
});

export const mainContextRpc = defineRpc({
  name: "sidechat.context.preview",
  input: z.object({
    agentId: z.string().min(1),
    maxTurns: z.number().int().min(1).max(30).optional(),
  }),
  output: z.object({
    available: z.boolean(),
    digest: mainContextDigestSchema.optional(),
    error: z.string().optional(),
  }),
});

export const usageWindowToneSchema = z.enum(["default", "warning", "danger", "ok"]);

export const usageReportWindowSchema = z.object({
  id: z.string(),
  label: z.string(),
  shortLabel: z.string().optional(),
  usedPct: z.number().nullable().optional(),
  remainingPct: z.number().nullable().optional(),
  resetsAt: z.string().nullable().optional(),
  runsOutAt: z.string().nullable().optional(),
  tone: usageWindowToneSchema.optional(),
});

export const usageReportBalanceSchema = z.object({
  id: z.string(),
  label: z.string(),
  used: z.number().nullable().optional(),
  remaining: z.number().nullable().optional(),
  limit: z.number().nullable().optional(),
  unit: z.enum(["tokens", "usd", "credits", "requests"]),
  resetsAt: z.string().nullable().optional(),
  tone: usageWindowToneSchema.optional(),
});

export const usageReportDetailSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  tone: usageWindowToneSchema.optional(),
});

export const usageReportCardSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceLabel: z.string(),
  iconSvg: z.string().nullable().optional(),
  accountLabel: z.string().nullable().optional(),
  status: z.enum(["available", "unavailable", "error"]),
  planLabel: z.string().nullable().optional(),
  windows: z.array(usageReportWindowSchema).default([]),
  balances: z.array(usageReportBalanceSchema).default([]),
  details: z.array(usageReportDetailSchema).default([]),
  errorMessage: z.string().nullable().optional(),
  fetchedAt: z.string().nullable().optional(),
});

export type UsageReportCardData = z.infer<typeof usageReportCardSchema>;

export const usageReportsRpc = defineRpc({
  name: "sidechat.usage.reports",
  input: z.object({
    provider: z.string().min(1),
    agentId: z.string().nullable().optional(),
    forceRefresh: z.boolean().default(false),
  }),
  output: z.object({
    reports: z.array(usageReportCardSchema),
  }),
});

export const forgeInfoRpc = defineRpc({
  name: "sidechat.attachments.forge_info",
  input: z.object({
    cwd: z.string().min(1),
  }),
  output: z.object({
    forge: z.string(),
    remoteUrl: z.string().nullable(),
  }),
});

export const forgeSearchRpc = defineRpc({
  name: "sidechat.attachments.forge_search",
  input: z.object({
    cwd: z.string().min(1),
    query: z.string().default(""),
  }),
  output: z.object({
    forge: z.string(),
    items: z.array(forgeSearchItemSchema),
    authState: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
  }),
});

export const listAttachmentSourcesRpc = defineRpc({
  name: "sidechat.attachments.sources",
  input: z.object({
    locale: z.string().default("en"),
  }),
  output: z.object({
    sources: z.array(discoveredAttachmentSourceSchema),
  }),
});

export const searchAttachmentSourceRpc = defineRpc({
  name: "sidechat.attachments.source_search",
  input: z.object({
    pluginId: z.string().min(1),
    searchMethod: z.string().min(1),
    query: z.string().default(""),
  }),
  output: z.object({
    items: z.array(PluginAttachmentItemSchema),
    error: z.string().nullable().optional(),
  }),
});

export const uploadFileRpc = defineRpc({
  name: "sidechat.attachments.upload_file",
  input: z.object({
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    dataBase64: z.string(),
  }),
  output: z.object({
    attachment: uploadedFileAttachmentSchema,
  }),
});
