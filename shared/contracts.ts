import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
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
    prompt: z.string().min(1),
    clientMessageId: z.string().optional(),
    providerModel: z.string().optional(),
    modeId: z.string().nullable().optional(),
    thinkingOptionId: z.string().nullable().optional(),
    fastMode: z.boolean().optional(),
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
