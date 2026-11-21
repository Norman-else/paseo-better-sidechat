import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  ScrollView,
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { isDarkSurface } from "../shared/appearance";
import {
  type ContextMode,
  DEFAULT_SIDECHAT_SETTINGS,
  type DefaultPermissionMode,
  sidechatSettings,
  type SidechatSettingsValues,
  type StarterModelMode,
} from "../shared/settings";
import { notifyComposerPillPreference } from "./handoff";
import { useMessages } from "./messages";
import { stableScrollbarStyle, useHostAppearance } from "./web";

export function SidechatSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(sidechatSettings);
  const appearance = useHostAppearance();
  const { t, locale } = useMessages();
  const { colors } = theme;
  const dark = useMemo(() => isDarkSurface(colors.surface0), [colors.surface0]);

  if (settings.status === "loading") {
    return <Loading />;
  }

  const values: SidechatSettingsValues =
    settings.status === "ready" ? settings.values : DEFAULT_SIDECHAT_SETTINGS;
  const revision = settings.status === "ready" || settings.status === "invalid" ? settings.revision : "";
  const disabled = settings.saving || settings.status === "error";

  const update = (patch: Partial<SidechatSettingsValues>) => {
    if (!revision) return;
    const next = { ...values, ...patch };
    void settings.save(next, revision).then((saved) => {
      if (saved && patch.showComposerPill !== undefined) {
        notifyComposerPillPreference(patch.showComposerPill);
      }
    });
  };

  const collapseText =
    appearance.chatDisplay === "collapseTurns"
      ? t("hostCollapseTurns")
      : appearance.chatDisplay === "collapseToolCalls"
        ? t("hostCollapseTools")
        : t("hostCollapseFull");

  const shortcutLabel =
    appearance.sendShortcut === "mod-enter" ? t("modEnterShortcut") : t("enterShortcut");

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: colors.surface0 }, stableScrollbarStyle]}
      contentContainerStyle={{ padding: 20, gap: 24, maxWidth: 720 }}
    >
      {/* Live Synced Paseo Host Settings */}
      <SettingsSection
        title={t("settingsHostSyncSection")}
        info={
          <Text style={{ fontSize: 12, color: colors.foregroundMuted }}>
            {t("settingsHostSyncInfo")}
          </Text>
        }
      >
        <SettingsCard>
          <SettingsRow label={t("hostLanguageLabel")}>
            <Text style={{ fontSize: 13, color: colors.foregroundMuted }}>
              {locale}
            </Text>
          </SettingsRow>

          <SettingsRow label={t("hostThemeLabel")}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {[colors.surface0, colors.surface1, colors.accent].map((swatch, idx) => (
                  <View
                    key={idx}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: swatch,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                ))}
              </View>
              <Text style={{ fontSize: 13, color: colors.foregroundMuted }}>
                {`${appearance.themePreference} (${dark ? t("darkMode") : t("lightMode")})`}
              </Text>
            </View>
          </SettingsRow>

          <SettingsRow label={t("hostReasoningLabel")}>
            <Text style={{ fontSize: 13, color: colors.foregroundMuted }}>
              {appearance.autoExpandReasoning
                ? t("hostReasoningExpanded")
                : t("hostReasoningCollapsed")}
            </Text>
          </SettingsRow>

          <SettingsRow label={t("hostCollapseLabel")}>
            <Text style={{ fontSize: 13, color: colors.foregroundMuted }}>
              {collapseText}
            </Text>
          </SettingsRow>

          <SettingsRow label={t("hostTypographyLabel")}>
            <Text style={{ fontSize: 13, color: colors.foregroundMuted }}>
              {t("hostTypographyValue", {
                content: appearance.contentFontSize,
                code: appearance.codeFontSize,
                shortcut: shortcutLabel,
              })}
            </Text>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {/* Plugin Preferences */}
      <SettingsSection title={t("settingsBehaviorSection")}>
        <SettingsCard>
          <SettingsSelect<ContextMode>
            label={t("settingContextModeLabel")}
            hint={t("settingContextModeHint")}
            value={values.defaultContextMode}
            disabled={disabled}
            options={[
              { label: t("contextModeFirstTurn"), value: "first_turn" },
              { label: t("contextModeAlways"), value: "always" },
              { label: t("contextModeManual"), value: "manual" },
            ]}
            onValueChange={(defaultContextMode) => update({ defaultContextMode })}
          />

          <SettingsSelect<string>
            label={t("settingContextTurnsLabel")}
            hint={t("settingContextTurnsHint")}
            value={String(values.contextTurns)}
            disabled={disabled}
            options={[
              { label: "3", value: "3" },
              { label: "6", value: "6" },
              { label: "10", value: "10" },
              { label: "20", value: "20" },
            ]}
            onValueChange={(raw) => update({ contextTurns: Number(raw) || 6 })}
          />

          <SettingsSelect<DefaultPermissionMode>
            label={t("settingDefaultModeLabel")}
            hint={t("settingDefaultModeHint")}
            value={values.defaultPermissionMode}
            disabled={disabled}
            options={[
              { label: t("defaultModeInherit"), value: "inherit" },
              { label: t("defaultModeAuto"), value: "auto" },
              { label: t("defaultModePlan"), value: "plan" },
              { label: t("defaultModeAsk"), value: "default" },
              { label: t("defaultModeBypass"), value: "bypassPermissions" },
            ]}
            onValueChange={(defaultPermissionMode) => update({ defaultPermissionMode })}
          />

          <SettingsSwitch
            label={t("settingInheritModelLabel")}
            hint={t("settingInheritModelHint")}
            value={values.inheritMainModel}
            disabled={disabled}
            onValueChange={(inheritMainModel) => update({ inheritMainModel })}
          />

          <SettingsSwitch
            label={t("settingReadOnlyGuardLabel")}
            hint={t("settingReadOnlyGuardHint")}
            value={values.readOnlyGuard}
            disabled={disabled}
            onValueChange={(readOnlyGuard) => update({ readOnlyGuard })}
          />

          <SettingsSwitch
            label={t("settingFastStartupLabel")}
            hint={t("settingFastStartupHint")}
            value={values.skipExternalMcp}
            disabled={disabled}
            onValueChange={(skipExternalMcp) => update({ skipExternalMcp })}
          />

          <SettingsSwitch
            label={t("settingComposerPillLabel")}
            hint={t("settingComposerPillHint")}
            value={values.showComposerPill}
            disabled={disabled}
            onValueChange={(showComposerPill) => update({ showComposerPill })}
          />

          <SettingsSelect<StarterModelMode>
            label={t("settingStarterModelLabel")}
            hint={t("settingStarterModelHint")}
            value={values.starterModelMode}
            disabled={disabled}
            options={[
              { label: t("starterModelSmart"), value: "smart" },
              { label: t("starterModelInherit"), value: "inherit" },
              { label: t("starterModelFast"), value: "fast" },
              { label: t("starterModelOff"), value: "off" },
            ]}
            onValueChange={(starterModelMode) => update({ starterModelMode })}
          />

          <SettingsAction
            label={t("resetDefaultsLabel")}
            hint={t("resetDefaultsHint")}
            actionLabel={t("resetAction")}
            disabled={disabled}
            onPress={() => {
              void settings.reset().then((ok) => {
                if (ok) notifyComposerPillPreference(DEFAULT_SIDECHAT_SETTINGS.showComposerPill);
              });
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
