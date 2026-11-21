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
  skipExternalMcp: z.boolean().default(false),
  showComposerPill: z.boolean().default(true),
});

export type SidechatSettingsValues = z.infer<typeof sidechatSettingsSchema>;

export const DEFAULT_SIDECHAT_SETTINGS: SidechatSettingsValues = {
  defaultContextMode: "first_turn",
  contextTurns: 6,
  defaultPermissionMode: "inherit",
  inheritMainModel: true,
  readOnlyGuard: true,
  skipExternalMcp: false,
  showComposerPill: true,
};

export const sidechatSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 3,
  schema: sidechatSettingsSchema,
  migrate(raw, fromVersion) {
    const prev = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const rawMode =
      typeof prev.defaultPermissionMode === "string"
        ? prev.defaultPermissionMode
        : typeof prev.defaultClaudeMode === "string"
          ? prev.defaultClaudeMode
          : "inherit";
    const parsedMode = defaultPermissionModeSchema.safeParse(rawMode);
    // In v1, `defaultClaudeMode` defaulted to `"auto"` rather than `"inherit"`; upgrade `"auto"` from v1 to `"inherit"` so Sidechat matches the main session's permission mode & tool access.
    const migratedMode =
      fromVersion < 2 && parsedMode.data === "auto"
        ? "inherit"
        : parsedMode.success
          ? parsedMode.data
          : "inherit";

    return {
      defaultContextMode: prev.defaultContextMode ?? "first_turn",
      contextTurns: prev.contextTurns ?? 6,
      defaultPermissionMode: migratedMode,
      inheritMainModel:
        typeof prev.inheritMainModel === "boolean" ? prev.inheritMainModel : true,
      readOnlyGuard: typeof prev.readOnlyGuard === "boolean" ? prev.readOnlyGuard : true,
      skipExternalMcp:
        typeof prev.skipExternalMcp === "boolean" ? prev.skipExternalMcp : false,
      showComposerPill:
        typeof prev.showComposerPill === "boolean" ? prev.showComposerPill : true,
    };
  },
});
