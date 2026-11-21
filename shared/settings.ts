import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const contextModeSchema = z.enum(["first_turn", "always", "manual"]);
export type ContextMode = z.infer<typeof contextModeSchema>;

export const defaultClaudeModeSchema = z.enum(["auto", "plan", "default", "inherit"]);
export type DefaultClaudeMode = z.infer<typeof defaultClaudeModeSchema>;

export const sidechatSettingsSchema = z.object({
  defaultContextMode: contextModeSchema.default("first_turn"),
  contextTurns: z.number().int().min(1).max(30).default(6),
  defaultClaudeMode: defaultClaudeModeSchema.default("auto"),
  readOnlyGuard: z.boolean().default(true),
  preferClaudeProvider: z.boolean().default(true),
  showComposerPill: z.boolean().default(true),
});

export type SidechatSettingsValues = z.infer<typeof sidechatSettingsSchema>;

export const DEFAULT_SIDECHAT_SETTINGS: SidechatSettingsValues = {
  defaultContextMode: "first_turn",
  contextTurns: 6,
  defaultClaudeMode: "auto",
  readOnlyGuard: true,
  preferClaudeProvider: true,
  showComposerPill: true,
};

export const sidechatSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: sidechatSettingsSchema,
});
