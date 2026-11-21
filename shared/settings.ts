import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const contextModeSchema = z.enum(["first_turn", "always", "manual"]);
export type ContextMode = z.infer<typeof contextModeSchema>;

export const defaultPermissionModeSchema = z.enum([
  "inherit",
  "auto",
  "plan",
  "default",
  "bypassPermissions",
]);
export type DefaultPermissionMode = z.infer<typeof defaultPermissionModeSchema>;

export const sidechatSettingsSchema = z.object({
  defaultContextMode: contextModeSchema.default("first_turn"),
  contextTurns: z.number().int().min(1).max(30).default(6),
  defaultPermissionMode: defaultPermissionModeSchema.default("inherit"),
  inheritMainModel: z.boolean().default(true),
  readOnlyGuard: z.boolean().default(true),
  fastStartup: z.boolean().default(true),
  showComposerPill: z.boolean().default(true),
});

export type SidechatSettingsValues = z.infer<typeof sidechatSettingsSchema>;

export const DEFAULT_SIDECHAT_SETTINGS: SidechatSettingsValues = {
  defaultContextMode: "first_turn",
  contextTurns: 6,
  defaultPermissionMode: "inherit",
  inheritMainModel: true,
  readOnlyGuard: true,
  fastStartup: true,
  showComposerPill: true,
};

export const sidechatSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 2,
  schema: sidechatSettingsSchema,
  migrate(raw) {
    const prev = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const legacyMode =
      typeof prev.defaultPermissionMode === "string"
        ? prev.defaultPermissionMode
        : typeof prev.defaultClaudeMode === "string"
          ? prev.defaultClaudeMode
          : "inherit";
    const parsedMode = defaultPermissionModeSchema.safeParse(legacyMode);
    return {
      defaultContextMode: prev.defaultContextMode ?? "first_turn",
      contextTurns: prev.contextTurns ?? 6,
      defaultPermissionMode: parsedMode.success ? parsedMode.data : "inherit",
      inheritMainModel:
        typeof prev.inheritMainModel === "boolean" ? prev.inheritMainModel : true,
      readOnlyGuard: typeof prev.readOnlyGuard === "boolean" ? prev.readOnlyGuard : true,
      fastStartup: typeof prev.fastStartup === "boolean" ? prev.fastStartup : true,
      showComposerPill:
        typeof prev.showComposerPill === "boolean" ? prev.showComposerPill : true,
    };
  },
});
