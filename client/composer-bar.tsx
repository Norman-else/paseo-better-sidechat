import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import type {
  AgentOptionControl,
  AgentUsage,
  JsonValue,
} from "@getpaseo/protocol/agent-types";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  type DerivedPalette,
  type HostAppearanceSettings,
  mixColor,
} from "../shared/appearance";
import {
  formatShortModelLabel,
  formatShortModeLabel,
  formatShortThinkingLabel,
  resolveModeIconName,
  resolveProviderIconSvg,
  resolveToolbarDensity,
} from "../shared/composer-controls";
import { ContextWindowPopover } from "./context-window-popover";
import type { useMessages } from "./messages";
import { type MenuOption, PopoverMenu } from "./popover-menu";
import {
  codeScopeProps,
  composerWebKeyProps,
  noOutlineInputStyle,
  pointerCursorStyle,
} from "./web";

function normalizeLucideIconName(raw: string | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (/^[A-Z]/.test(trimmed) && !trimmed.includes("-") && !trimmed.includes("_")) {
    return trimmed;
  }
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

type TranslateFn = ReturnType<typeof useMessages>["t"];

export interface SidechatComposerBarProps {
  hostId: string;
  activeSideAgentId: string | null;
  locale: string;
  theme: PluginTheme;
  palette: DerivedPalette;
  appearance: HostAppearanceSettings;
  panelWidth: number;
  isTouch: boolean;
  t: TranslateFn;

  draft: string;
  onChangeDraft(text: string): void;
  onSubmit(): void;
  onStop(): void;
  isBusy: boolean;
  canSubmit: boolean;
  shortcutLabel: string;

  // Context & quote attachments (`+` menu & attachment tray)
  hasMainAgent: boolean;
  shouldAttachMainContext: boolean;
  isAutoFirstTurnContext: boolean;
  onToggleMainContext(): void;
  onPreviewMainContext(): void;
  candidateSelection: string | null;
  attachedQuote: string | null;
  onAttachCandidateSelection(): void;
  onClearQuote(): void;

  // Universal Multi-Provider Agent Controls
  effectiveProvider: string;
  providerIconSvg: string | null;
  selectedModelRawLabel: string | null;
  modelMaxTokens: number | null;
  modelMenuOptions: readonly MenuOption[];
  selectedThinkingRawLabel: string | null;
  thinkingMenuOptions: readonly MenuOption[];
  effectiveModeId: string | null;
  selectedModeRawLabel: string | null;
  selectedModeIconName: string | null;
  modeMenuOptions: readonly MenuOption[];
  optionControls: readonly AgentOptionControl[];
  effectiveOptions: Readonly<Record<string, JsonValue>>;
  onSetOption(key: string, value: JsonValue): void;
  lastUsage: AgentUsage | null;
}

export function SidechatComposerBar({
  hostId,
  activeSideAgentId,
  locale,
  theme,
  palette,
  appearance,
  panelWidth,
  isTouch,
  t,
  draft,
  onChangeDraft,
  onSubmit,
  onStop,
  isBusy,
  canSubmit,
  shortcutLabel,
  hasMainAgent,
  shouldAttachMainContext,
  isAutoFirstTurnContext,
  onToggleMainContext,
  onPreviewMainContext,
  candidateSelection,
  attachedQuote,
  onAttachCandidateSelection,
  onClearQuote,
  effectiveProvider,
  providerIconSvg,
  selectedModelRawLabel,
  modelMaxTokens,
  modelMenuOptions,
  selectedThinkingRawLabel,
  thinkingMenuOptions,
  effectiveModeId,
  selectedModeRawLabel,
  selectedModeIconName,
  modeMenuOptions,
  optionControls,
  effectiveOptions,
  onSetOption,
  lastUsage,
}: SidechatComposerBarProps) {
  const { colors } = theme;
  const [inputFocused, setInputFocused] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [openSelectOptionKey, setOpenSelectOptionKey] = useState<string | null>(null);

  // Paseo exact toolbar geometry tokens
  const discSize = isTouch ? 36 : 28;
  const glyphSize = isTouch ? 18 : 15;
  const caretSize = 12;
  const ringSize = isTouch ? 18 : 16;
  const labelFontSize = Math.max(12, appearance.uiBaseFontSize);
  const density = resolveToolbarDensity(panelWidth, isTouch);
  const compact = isTouch || panelWidth < 460;

  const resolvedProviderSvg = useMemo(
    () => resolveProviderIconSvg(effectiveProvider, providerIconSvg),
    [effectiveProvider, providerIconSvg],
  );
  const shortModel = formatShortModelLabel(selectedModelRawLabel, t("modelLabel"));
  const shortThinking = formatShortThinkingLabel(selectedThinkingRawLabel, t("thinkingDefault"));
  const shortMode = formatShortModeLabel(effectiveModeId, selectedModeRawLabel);
  const modeIcon = resolveModeIconName(effectiveModeId, selectedModeIconName);

  const showThinkingLabel = density === "full";
  const showModeLabel = density !== "iconOnly";

  // `+` attachment & context menu options
  const plusMenuOptions = useMemo<MenuOption[]>(() => {
    const items: MenuOption[] = [];
    if (hasMainAgent) {
      items.push({
        id: "toggle-main-context",
        label: shouldAttachMainContext ? t("mainContextAttached") : t("mainContextOff"),
        icon: "Link2",
        selected: shouldAttachMainContext,
        onSelect: onToggleMainContext,
      });
      items.push({
        id: "preview-main-context",
        label: t("previewMainContext"),
        icon: "Eye",
        onSelect: onPreviewMainContext,
      });
    }
    if (candidateSelection && !attachedQuote) {
      items.push({
        id: "quote-selection",
        label: t("quoteSelectionChip"),
        icon: "Quote",
        onSelect: onAttachCandidateSelection,
      });
    }
    return items;
  }, [
    hasMainAgent,
    shouldAttachMainContext,
    candidateSelection,
    attachedQuote,
    t,
    onToggleMainContext,
    onPreviewMainContext,
    onAttachCandidateSelection,
  ]);

  const hasTrayItems =
    (hasMainAgent && shouldAttachMainContext) ||
    Boolean(attachedQuote) ||
    Boolean(candidateSelection && !attachedQuote);

  const hasDraft = draft.trim().length > 0;

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingBottom: 12,
        paddingTop: 4,
        backgroundColor: colors.surface0,
        zIndex: 20,
      }}
    >
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: inputFocused
            ? mixColor(colors.accent, colors.border, 0.35)
            : colors.border,
          backgroundColor: colors.surface1,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 8,
          gap: 8,
        }}
      >
        {/* Paseo-style Attachment & Context Pill Tray (only rendered when active) */}
        {hasTrayItems ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {hasMainAgent && shouldAttachMainContext ? (
              <View
                style={{
                  minHeight: 24,
                  paddingLeft: 8,
                  paddingRight: 4,
                  borderRadius: 999,
                  backgroundColor: palette.accentSoftBg,
                  borderWidth: 1,
                  borderColor: palette.accentSoftBorder,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("previewMainContext")}
                  onPress={onPreviewMainContext}
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 2,
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon name="Link2" size={11} color={colors.accent} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                      fontWeight: "500",
                      color: colors.foreground,
                    }}
                  >
                    {isAutoFirstTurnContext ? t("mainContextAuto") : t("mainContextAttached")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("mainContextOff")}
                  onPress={onToggleMainContext}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    {
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon name="X" size={11} color={colors.foregroundMuted} />
                </Pressable>
              </View>
            ) : null}

            {attachedQuote ? (
              <View
                {...codeScopeProps}
                style={{
                  minHeight: 24,
                  maxWidth: "100%",
                  paddingLeft: 8,
                  paddingRight: 4,
                  borderRadius: 999,
                  backgroundColor: colors.surface2,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon name="Quote" size={11} color={colors.accent} />
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    maxWidth: 200,
                    fontFamily: appearance.monoFontFamily,
                    fontSize: Math.max(11, appearance.codeFontSize - 1),
                    color: colors.foreground,
                  }}
                >
                  {attachedQuote.replace(/\s+/g, " ")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("clearQuote")}
                  onPress={onClearQuote}
                  style={[
                    {
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon name="X" size={11} color={colors.foregroundMuted} />
                </Pressable>
              </View>
            ) : null}

            {candidateSelection && !attachedQuote ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("quoteSelectionChip")}
                onPress={onAttachCandidateSelection}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    minHeight: 24,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    backgroundColor: pressed || hovered ? colors.surface2 : colors.surface0,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon name="Plus" size={11} color={colors.accent} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                    color: colors.foregroundMuted,
                  }}
                >
                  {t("quoteSelectionChip")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Prompt Input */}
        <TextInput
          multiline
          value={draft}
          onChangeText={onChangeDraft}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder={t("composerPlaceholder", { shortcut: shortcutLabel })}
          placeholderTextColor={colors.foregroundMuted}
          accessibilityLabel={t("composerPlaceholder", { shortcut: shortcutLabel })}
          {...composerWebKeyProps(appearance.sendShortcut, () => {
            if (canSubmit) onSubmit();
          })}
          style={[
            {
              minHeight: isTouch ? 42 : 34,
              maxHeight: 150,
              padding: 0,
              fontSize: appearance.contentFontSize,
              lineHeight: appearance.contentLineHeight,
              color: colors.foreground,
            },
            noOutlineInputStyle,
          ]}
        />

        {/* Paseo Bottom Toolbar Row */}
        <View
          style={{
            minHeight: discSize,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          {/* Left Controls */}
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: isTouch ? 2 : 4,
            }}
          >
            {/* 1. `+` Context / Attachment Button */}
            {plusMenuOptions.length > 0 ? (
              <PopoverMenu
                title={t("mainContextBadge")}
                open={plusMenuOpen}
                onOpenChange={setPlusMenuOpen}
                placement="top"
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                options={plusMenuOptions}
                trigger={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add context"
                    onPress={() => setPlusMenuOpen((v) => !v)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        width: discSize,
                        height: discSize,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          plusMenuOpen || pressed || hovered ? colors.surface2 : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon
                      name="Plus"
                      size={glyphSize + 1}
                      color={
                        plusMenuOpen || shouldAttachMainContext
                          ? colors.foreground
                          : colors.foregroundMuted
                      }
                    />
                  </Pressable>
                }
              />
            ) : null}

            {/* 2. Universal Provider + Model Selector Pill */}
            {modelMenuOptions.length > 0 ? (
              <PopoverMenu
                title={t("modelLabel")}
                open={modelMenuOpen}
                onOpenChange={setModelMenuOpen}
                placement="top"
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                options={modelMenuOptions}
                trigger={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("modelLabel")}: ${shortModel}`}
                    onPress={() => setModelMenuOpen((v) => !v)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        height: discSize,
                        maxWidth: density === "iconOnly" ? 115 : 152,
                        paddingHorizontal: 9,
                        borderRadius: 999,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        backgroundColor:
                          modelMenuOpen || pressed || hovered
                            ? mixColor(colors.foreground, colors.surface2, 0.08)
                            : colors.surface2,
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    {resolvedProviderSvg ? (
                      <Icon
                        icon={{ svg: resolvedProviderSvg }}
                        size={glyphSize - 1}
                        color={colors.foregroundMuted}
                      />
                    ) : (
                      <Icon name="Cpu" size={glyphSize - 1} color={colors.foregroundMuted} />
                    )}
                    <Text
                      numberOfLines={1}
                      style={{
                        flexShrink: 1,
                        fontSize: labelFontSize,
                        color: modelMenuOpen ? colors.foreground : colors.foregroundMuted,
                      }}
                    >
                      {shortModel}
                    </Text>
                    <Icon name="ChevronDown" size={caretSize} color={colors.foregroundMuted} />
                  </Pressable>
                }
              />
            ) : null}

            {/* 3. Thinking Effort Ghost Pill */}
            {thinkingMenuOptions.length > 0 ? (
              <PopoverMenu
                title={t("thinkingLabel")}
                open={thinkingMenuOpen}
                onOpenChange={setThinkingMenuOpen}
                placement="top"
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                options={thinkingMenuOptions}
                trigger={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("thinkingLabel")}: ${shortThinking}`}
                    onPress={() => setThinkingMenuOpen((v) => !v)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        height: discSize,
                        paddingHorizontal: showThinkingLabel ? 8 : 6,
                        borderRadius: 999,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor:
                          thinkingMenuOpen || pressed || hovered
                            ? colors.surface2
                            : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon
                      name="Brain"
                      size={glyphSize}
                      color={thinkingMenuOpen ? colors.foreground : colors.foregroundMuted}
                    />
                    {showThinkingLabel ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: labelFontSize,
                          color: thinkingMenuOpen ? colors.foreground : colors.foregroundMuted,
                        }}
                      >
                        {shortThinking}
                      </Text>
                    ) : null}
                    <Icon name="ChevronDown" size={caretSize} color={colors.foregroundMuted} />
                  </Pressable>
                }
              />
            ) : null}

            {/* 4. Mode Ghost Pill (automatically hidden if provider has no modes) */}
            {modeMenuOptions.length > 0 ? (
              <PopoverMenu
                title={t("modeLabel")}
                open={modeMenuOpen}
                onOpenChange={setModeMenuOpen}
                placement="top"
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                options={modeMenuOptions}
                trigger={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("modeLabel")}: ${shortMode}`}
                    onPress={() => setModeMenuOpen((v) => !v)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        height: discSize,
                        paddingHorizontal: showModeLabel ? 8 : 6,
                        borderRadius: 999,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor:
                          modeMenuOpen || pressed || hovered ? colors.surface2 : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon
                      name={modeIcon}
                      size={glyphSize}
                      color={modeMenuOpen ? colors.foreground : colors.foregroundMuted}
                    />
                    {showModeLabel ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: labelFontSize,
                          color: modeMenuOpen ? colors.foreground : colors.foregroundMuted,
                        }}
                      >
                        {shortMode}
                      </Text>
                    ) : null}
                    <Icon name="ChevronDown" size={caretSize} color={colors.foregroundMuted} />
                  </Pressable>
                }
              />
            ) : null}

            {/* 5. Provider Option Controls (e.g. Claude Fast Mode `⚡`, Codex controls, etc.) */}
            {optionControls.map((ctrl) => {
              if (ctrl.type === "toggle") {
                const rawVal = effectiveOptions[ctrl.key];
                const checked =
                  typeof rawVal === "boolean" ? rawVal : Boolean(ctrl.defaultValue);
                const iconName = normalizeLucideIconName(
                  ctrl.icon,
                  ctrl.key === "fast_mode" ? "Zap" : "SlidersHorizontal",
                );
                return (
                  <Pressable
                    key={ctrl.key}
                    accessibilityRole="checkbox"
                    accessibilityLabel={ctrl.label}
                    accessibilityState={{ checked }}
                    onPress={() => onSetOption(ctrl.key, !checked)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        width: discSize,
                        height: discSize,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: checked
                          ? palette.warningSoftBg
                          : pressed || hovered
                            ? colors.surface2
                            : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon
                      name={iconName}
                      size={glyphSize}
                      color={checked ? colors.statusWarning : colors.foregroundMuted}
                    />
                  </Pressable>
                );
              }

              // Select control
              const rawVal = effectiveOptions[ctrl.key];
              const activeVal =
                typeof rawVal === "string"
                  ? rawVal
                  : (ctrl.defaultValue ?? ctrl.choices[0]?.value ?? "");
              const activeChoice = ctrl.choices.find((c) => c.value === activeVal);
              const isOpen = openSelectOptionKey === ctrl.key;
              const showSelectLabel =
                ctrl.desktopTrigger !== "icon" && density === "full";
              const selectOptions: MenuOption[] = ctrl.choices.map((ch) => ({
                id: ch.value,
                label: ch.label,
                subtitle: ch.description,
                selected: ch.value === activeVal,
                onSelect: () => onSetOption(ctrl.key, ch.value),
              }));

              return (
                <PopoverMenu
                  key={ctrl.key}
                  title={ctrl.label}
                  open={isOpen}
                  onOpenChange={(next) => setOpenSelectOptionKey(next ? ctrl.key : null)}
                  placement="top"
                  theme={theme}
                  compact={compact}
                  uiFontSize={appearance.uiBaseFontSize}
                  options={selectOptions}
                  trigger={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${ctrl.label}: ${activeChoice?.label ?? activeVal}`}
                      onPress={() =>
                        setOpenSelectOptionKey((prev) => (prev === ctrl.key ? null : ctrl.key))
                      }
                      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                        {
                          height: discSize,
                          paddingHorizontal: showSelectLabel ? 8 : 6,
                          borderRadius: 999,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor:
                            isOpen || pressed || hovered ? colors.surface2 : "transparent",
                        },
                        pointerCursorStyle,
                      ]}
                    >
                      <Icon
                        name={normalizeLucideIconName(ctrl.icon, "SlidersHorizontal")}
                        size={glyphSize}
                        color={isOpen ? colors.foreground : colors.foregroundMuted}
                      />
                      {showSelectLabel ? (
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: labelFontSize,
                            color: isOpen ? colors.foreground : colors.foregroundMuted,
                          }}
                        >
                          {activeChoice?.label ?? ctrl.label}
                        </Text>
                      ) : null}
                      <Icon name="ChevronDown" size={caretSize} color={colors.foregroundMuted} />
                    </Pressable>
                  }
                />
              );
            })}
          </View>

          {/* Right Controls: Context Window Meter Popover + Always-Visible Send / Stop Disc */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {/* 6. Context Window Progress Ring + Paseo Context/Quota Popover */}
            <ContextWindowPopover
              hostId={hostId}
              effectiveProvider={effectiveProvider}
              activeSideAgentId={activeSideAgentId}
              lastUsage={lastUsage}
              modelMaxTokens={modelMaxTokens}
              theme={theme}
              appearance={appearance}
              panelWidth={panelWidth}
              discSize={discSize}
              ringSize={ringSize}
              isTouch={isTouch}
              locale={locale}
              t={t}
            />

            {/* 7. Circular Stop / Always-Visible Send Disc */}
            {isBusy && !hasDraft ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("stopButton")}
                onPress={onStop}
                style={({ pressed }) => [
                  {
                    width: discSize,
                    height: discSize,
                    borderRadius: 999,
                    backgroundColor: "#dc2626",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.72 : 1,
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon name="Square" size={isTouch ? 13 : 11} color="#ffffff" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("sendButton")}
                accessibilityState={{ disabled: !canSubmit }}
                disabled={!canSubmit}
                onPress={onSubmit}
                style={({ pressed }) => [
                  {
                    width: discSize,
                    height: discSize,
                    borderRadius: 999,
                    backgroundColor: canSubmit ? colors.accent : colors.surface2,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: !canSubmit ? 0.45 : pressed ? 0.72 : 1,
                  },
                  canSubmit ? pointerCursorStyle : undefined,
                ]}
              >
                <Icon
                  name="ArrowUp"
                  size={isTouch ? 18 : 15}
                  color={canSubmit ? colors.accentForeground : colors.foregroundMuted}
                />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
