import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Icon, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import type {
  AgentOptionControl,
  AgentUsage,
  JsonValue,
} from "@getpaseo/protocol/agent-types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  type DerivedPalette,
  type HostAppearanceSettings,
  mixColor,
} from "../shared/appearance";
import {
  FILE_UPLOAD_MAX_BYTES,
  formatFileSizeCompact,
  resolveForgePresentation,
  toggleForgeComposerAttachment,
  togglePluginResourceComposerAttachment,
  type DiscoveredAttachmentSource,
  type SidechatComposerAttachment,
} from "../shared/attachments";
import {
  formatShortModelLabel,
  formatShortModeLabel,
  formatShortThinkingLabel,
  resolveModeIconName,
  resolveProviderIconSvg,
  resolveToolbarDensity,
} from "../shared/composer-controls";
import {
  forgeInfoRpc,
  forgeSearchRpc,
  listAttachmentSourcesRpc,
  searchAttachmentSourceRpc,
  uploadFileRpc,
} from "../shared/contracts";
import {
  AttachmentPickerPopover,
  type SearchableAttachmentOption,
} from "./attachment-picker-popover";
import { ContextWindowPopover } from "./context-window-popover";
import type { useMessages } from "./messages";
import { type MenuOption, PopoverMenu } from "./popover-menu";
import { Spinner } from "./spinner";
import {
  codeScopeProps,
  composerPasteImageProps,
  composerWebKeyProps,
  noOutlineInputStyle,
  pickWebFiles,
  type PickedWebFile,
  pointerCursorStyle,
} from "./web";

function normalizeLucideIconName(raw: string | undefined | null, fallback: string): string {
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

type ActiveAttachmentPickerState =
  | { kind: "forge" }
  | { kind: "plugin"; source: DiscoveredAttachmentSource }
  | null;

export interface SidechatComposerBarProps {
  hostId: string;
  cwd: string;
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

  // Paseo Attachments (`+` menu & attachment tray)
  attachments: readonly SidechatComposerAttachment[];
  onChangeAttachments(next: SidechatComposerAttachment[]): void;
  onUploadingCountChange?(count: number): void;

  // Main session context & quote selection
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
  cwd,
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
  attachments,
  onChangeAttachments,
  onUploadingCountChange,
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
  const toast = useToast();

  const callForgeInfo = useRpc(forgeInfoRpc);
  const callForgeSearch = useRpc(forgeSearchRpc);
  const callListSources = useRpc(listAttachmentSourcesRpc);
  const callSearchSource = useRpc(searchAttachmentSourceRpc);
  const callUploadFile = useRpc(uploadFileRpc);

  const [inputFocused, setInputFocused] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<ActiveAttachmentPickerState>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [pendingUploadNames, setPendingUploadNames] = useState<string[]>([]);

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [openSelectOptionKey, setOpenSelectOptionKey] = useState<string | null>(null);

  useEffect(() => {
    onUploadingCountChange?.(pendingUploadNames.length);
  }, [pendingUploadNames.length, onUploadingCountChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(pickerQuery.trim());
    }, 180);
    return () => clearTimeout(timer);
  }, [pickerQuery]);

  // Paseo exact toolbar geometry tokens
  const discSize = isTouch ? 36 : 28;
  const glyphSize = isTouch ? 18 : 15;
  const caretSize = 12;
  const ringSize = isTouch ? 18 : 16;
  const labelFontSize = Math.max(12, appearance.uiBaseFontSize);
  const density = resolveToolbarDensity(panelWidth, isTouch);
  const compact = isTouch || panelWidth < 460;

  // Detect repository forge (`github` / `gitlab` / `gitea` / `forgejo` / `codeberg`)
  const forgeInfoQuery = useQuery({
    queryKey: ["sidechat-forge-info", hostId, cwd],
    enabled: Boolean(cwd),
    staleTime: 120_000,
    queryFn: () => callForgeInfo({ cwd }),
  });
  const forgePresentation = useMemo(
    () => resolveForgePresentation(forgeInfoQuery.data?.forge ?? "github"),
    [forgeInfoQuery.data?.forge],
  );

  // Dynamically load installed Paseo plugin attachment sources (e.g. `paseo-jira` -> `Attach Jira ticket`)
  const pluginSourcesQuery = useQuery({
    queryKey: ["sidechat-plugin-attachment-sources", hostId, locale],
    staleTime: 30_000,
    queryFn: () => callListSources({ locale }),
  });
  const pluginSources = pluginSourcesQuery.data?.sources ?? [];

  // Searchable Issue / PR query (only runs while Forge picker is open)
  const forgeSearchQuery = useQuery({
    queryKey: ["sidechat-forge-search", hostId, cwd, debouncedQuery],
    enabled: activePicker?.kind === "forge" && Boolean(cwd),
    staleTime: 20_000,
    queryFn: () => callForgeSearch({ cwd, query: debouncedQuery }),
  });

  // Searchable Plugin Attachment Source query (e.g. `jira.search`, only runs while Plugin picker is open)
  const activePluginSource = activePicker?.kind === "plugin" ? activePicker.source : null;
  const pluginSearchQuery = useQuery({
    queryKey: [
      "sidechat-plugin-source-search",
      hostId,
      activePluginSource?.pluginId ?? "",
      activePluginSource?.searchMethod ?? "",
      debouncedQuery,
    ],
    enabled: Boolean(activePluginSource),
    staleTime: 20_000,
    queryFn: () =>
      callSearchSource({
        pluginId: activePluginSource!.pluginId,
        searchMethod: activePluginSource!.searchMethod,
        query: debouncedQuery,
      }),
  });

  const handleAddPickedImages = useCallback(
    (picked: PickedWebFile[]) => {
      if (picked.length === 0) return;
      const valid: SidechatComposerAttachment[] = [];
      for (const file of picked) {
        if (file.size > FILE_UPLOAD_MAX_BYTES) {
          toast.error(t("fileTooLarge", { name: file.fileName }));
          continue;
        }
        valid.push({
          kind: "image",
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.fileName,
          mimeType: file.mimeType || "image/png",
          size: file.size,
          dataBase64: file.dataBase64,
        });
      }
      if (valid.length > 0) {
        onChangeAttachments([...attachments, ...valid]);
      }
    },
    [attachments, onChangeAttachments, t, toast],
  );

  const handlePickImagesFromMenu = useCallback(async () => {
    try {
      const picked = await pickWebFiles({
        accept: "image/*",
        multiple: true,
        fallbackMime: "image/png",
      });
      handleAddPickedImages(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add image");
    }
  }, [handleAddPickedImages, toast]);

  const handlePickAndUploadFiles = useCallback(async () => {
    try {
      const picked = await pickWebFiles({
        multiple: true,
        fallbackMime: "application/octet-stream",
      });
      if (picked.length === 0) return;

      const accepted: PickedWebFile[] = [];
      for (const file of picked) {
        if (file.size > FILE_UPLOAD_MAX_BYTES) {
          toast.error(t("fileTooLarge", { name: file.fileName }));
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length === 0) return;

      setPendingUploadNames((prev) => [...prev, ...accepted.map((f) => f.fileName)]);
      const uploadedAttachments: SidechatComposerAttachment[] = [];

      for (const file of accepted) {
        try {
          const res = await callUploadFile({
            fileName: file.fileName,
            mimeType: file.mimeType,
            dataBase64: file.dataBase64,
          });
          uploadedAttachments.push({
            kind: "file",
            id: res.attachment.id,
            attachment: res.attachment,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Failed to upload ${file.fileName}`);
        } finally {
          setPendingUploadNames((prev) => {
            const idx = prev.indexOf(file.fileName);
            if (idx === -1) return prev;
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          });
        }
      }

      if (uploadedAttachments.length > 0) {
        onChangeAttachments([...attachments, ...uploadedAttachments]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload file");
    }
  }, [attachments, callUploadFile, onChangeAttachments, t, toast]);

  // Exact Paseo `+` Attachment Menu (`Add image`, `Add issue or PR`, `...pluginAttachmentSources`, `Upload file`)
  const plusMenuOptions = useMemo<MenuOption[]>(() => {
    const items: MenuOption[] = [
      {
        id: "image",
        label: t("addImage"),
        icon: "Image",
        onSelect: () => {
          void handlePickImagesFromMenu();
        },
      },
      {
        id: "forge",
        label: forgePresentation.isMergeRequest ? t("addIssueOrMr") : t("addIssueOrPr"),
        iconSvg: forgePresentation.iconSvg,
        icon: forgePresentation.fallbackIconName,
        onSelect: () => {
          setPickerQuery("");
          setDebouncedQuery("");
          setActivePicker({ kind: "forge" });
        },
      },
      ...pluginSources.map((src): MenuOption => ({
        id: `plugin:${src.key}`,
        label: src.menuLabel,
        iconSvg: src.iconSvg ?? null,
        icon: normalizeLucideIconName(src.iconName, "Ticket"),
        onSelect: () => {
          setPickerQuery("");
          setDebouncedQuery("");
          setActivePicker({ kind: "plugin", source: src });
        },
      })),
      {
        id: "file",
        label: t("uploadFile"),
        icon: "Paperclip",
        onSelect: () => {
          void handlePickAndUploadFiles();
        },
      },
    ];
    return items;
  }, [
    t,
    forgePresentation,
    pluginSources,
    handlePickImagesFromMenu,
    handlePickAndUploadFiles,
  ]);

  const pickerOptions = useMemo<SearchableAttachmentOption[]>(() => {
    if (!activePicker) return [];
    if (activePicker.kind === "forge") {
      const items = forgeSearchQuery.data?.items ?? [];
      return items.map((item) => {
        const pres = resolveForgePresentation(item.forge);
        const prefix = item.kind === "change_request" ? pres.numberPrefix : pres.issueNumberPrefix;
        const selected = attachments.some(
          (a) =>
            a.kind === "forge" &&
            a.item.kind === item.kind &&
            a.item.number === item.number &&
            a.item.forge === item.forge,
        );
        const kindLabel =
          item.kind === "change_request" ? pres.changeRequestAbbrev : "Issue";
        return {
          id: `${item.kind}:${item.number}`,
          label: `${prefix}${item.number} ${item.title}`,
          subtitle: item.state ? `${kindLabel} · ${item.state}` : kindLabel,
          iconSvg: pres.iconSvg,
          iconName: pres.fallbackIconName,
          selected,
          onSelect: () => {
            onChangeAttachments(toggleForgeComposerAttachment(attachments, item));
          },
        };
      });
    }

    const src = activePicker.source;
    const items = pluginSearchQuery.data?.items ?? [];
    return items.map((item) => {
      const selected = attachments.some(
        (a) =>
          a.kind === "plugin_resource" &&
          a.pluginId === src.pluginId &&
          a.sourceId === src.sourceId &&
          a.item.id === item.id,
      );
      return {
        id: item.id,
        label: `${item.identifier} ${item.title}`,
        subtitle: item.subtitle ?? null,
        iconSvg: src.iconSvg ?? null,
        iconName: normalizeLucideIconName(src.iconName, "Ticket"),
        selected,
        onSelect: () => {
          onChangeAttachments(
            togglePluginResourceComposerAttachment(attachments, {
              pluginId: src.pluginId,
              sourceId: src.sourceId,
              sourceTitle: src.title,
              iconName: src.iconName,
              iconSvg: src.iconSvg,
              item,
            }),
          );
        },
      };
    });
  }, [
    activePicker,
    forgeSearchQuery.data?.items,
    pluginSearchQuery.data?.items,
    attachments,
    onChangeAttachments,
  ]);

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

  const hasTrayItems =
    attachments.length > 0 ||
    pendingUploadNames.length > 0 ||
    (hasMainAgent && shouldAttachMainContext) ||
    Boolean(attachedQuote) ||
    Boolean(candidateSelection && !attachedQuote);

  const hasSendableInput = draft.trim().length > 0 || attachments.length > 0;

  const removeAttachmentById = useCallback(
    (id: string) => {
      onChangeAttachments(attachments.filter((item) => item.id !== id));
    },
    [attachments, onChangeAttachments],
  );

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
        {/* Paseo Attachment & Context Pill Tray */}
        {hasTrayItems ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {/* Pending file upload pills */}
            {pendingUploadNames.map((name, idx) => (
              <View
                key={`uploading-${idx}-${name}`}
                style={{
                  minHeight: 24,
                  paddingHorizontal: 8,
                  borderRadius: 999,
                  backgroundColor: colors.surface2,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Spinner size={11} color={colors.accent} />
                <Text
                  numberOfLines={1}
                  style={{
                    maxWidth: 180,
                    fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                    color: colors.foregroundMuted,
                  }}
                >
                  {t("uploadingFile", { name })}
                </Text>
              </View>
            ))}

            {/* Attached Images, Files, Issues/PRs, and Plugin Resources (e.g. Jira tickets) */}
            {attachments.map((att) => {
              let pillTitle = "";
              let pillSubtitle: string | null = null;
              let pillIconName: string | null = null;
              let pillIconSvg: string | null = null;
              let externalUrl: string | null = null;

              if (att.kind === "image") {
                pillTitle = att.fileName;
                pillSubtitle = formatFileSizeCompact(att.size);
                pillIconName = "Image";
              } else if (att.kind === "file") {
                pillTitle = att.attachment.fileName;
                pillSubtitle = formatFileSizeCompact(att.attachment.size);
                pillIconName = "Paperclip";
              } else if (att.kind === "forge") {
                const pres = resolveForgePresentation(att.item.forge);
                const prefix =
                  att.item.kind === "change_request" ? pres.numberPrefix : pres.issueNumberPrefix;
                pillTitle = `${prefix}${att.item.number} ${att.item.title}`;
                pillIconSvg = pres.iconSvg;
                pillIconName = pres.fallbackIconName;
                externalUrl = att.item.url;
              } else if (att.kind === "plugin_resource") {
                pillTitle = att.item.title;
                pillSubtitle = `${att.sourceTitle} ${att.item.identifier}`;
                pillIconSvg = att.iconSvg ?? null;
                pillIconName = normalizeLucideIconName(att.iconName, "Ticket");
                externalUrl = att.item.url;
              }

              const labelContent = (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingVertical: 2,
                    flexShrink: 1,
                  }}
                >
                  {pillIconSvg ? (
                    <Icon icon={{ svg: pillIconSvg }} size={12} color={colors.foregroundMuted} />
                  ) : pillIconName ? (
                    <Icon name={pillIconName} size={12} color={colors.foregroundMuted} />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={{
                      maxWidth: 165,
                      fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
                      fontWeight: "500",
                      color: colors.foreground,
                    }}
                  >
                    {pillTitle}
                  </Text>
                  {pillSubtitle ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        maxWidth: 110,
                        fontSize: Math.max(10, appearance.uiBaseFontSize - 3),
                        color: colors.foregroundMuted,
                      }}
                    >
                      {pillSubtitle}
                    </Text>
                  ) : null}
                </View>
              );

              return (
                <View
                  key={att.id}
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
                    gap: 4,
                  }}
                >
                  {externalUrl ? (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={pillTitle}
                      onPress={() => {
                        void openExternalUrl(externalUrl!).catch(() => {});
                      }}
                      style={[{ flexShrink: 1 }, pointerCursorStyle]}
                    >
                      {labelContent}
                    </Pressable>
                  ) : (
                    labelContent
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("removeAttachment", { name: pillTitle })}
                    onPress={() => removeAttachmentById(att.id)}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: pressed || hovered ? colors.surface0 : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon name="X" size={11} color={colors.foregroundMuted} />
                  </Pressable>
                </View>
              );
            })}

            {/* Main Session Context Pill */}
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

            {/* Quoted Selection Pill */}
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
          {...composerPasteImageProps(handleAddPickedImages)}
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
            {/* 1. Paseo `+` Attachment Menu + Searchable Issue/PR & Plugin Resource Picker */}
            <View style={{ position: "relative", zIndex: plusMenuOpen || activePicker ? 55 : 1 }}>
              <PopoverMenu
                sheetTitle={t("addAttachment")}
                open={plusMenuOpen}
                onOpenChange={setPlusMenuOpen}
                placement="top"
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                iconSize={16}
                minWidth={204}
                options={plusMenuOptions}
                trigger={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("addAttachment")}
                    onPress={() => {
                      setActivePicker(null);
                      setPlusMenuOpen((v) => !v);
                    }}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                      {
                        width: discSize,
                        height: discSize,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          plusMenuOpen || Boolean(activePicker) || pressed || hovered
                            ? colors.surface2
                            : "transparent",
                      },
                      pointerCursorStyle,
                    ]}
                  >
                    <Icon
                      name="Plus"
                      size={glyphSize + 1}
                      color={
                        plusMenuOpen || Boolean(activePicker) || attachments.length > 0
                          ? colors.foreground
                          : colors.foregroundMuted
                      }
                    />
                  </Pressable>
                }
              />

              <AttachmentPickerPopover
                open={Boolean(activePicker)}
                title={
                  activePicker?.kind === "plugin"
                    ? activePicker.source.pickerTitle
                    : forgePresentation.isMergeRequest
                      ? t("addIssueOrMr")
                      : t("addIssueOrPr")
                }
                searchPlaceholder={
                  activePicker?.kind === "plugin"
                    ? activePicker.source.searchPlaceholder
                    : forgePresentation.isMergeRequest
                      ? t("searchIssueOrMrPlaceholder")
                      : t("searchIssueOrPrPlaceholder")
                }
                query={pickerQuery}
                onChangeQuery={setPickerQuery}
                isFetching={
                  activePicker?.kind === "plugin"
                    ? pluginSearchQuery.isFetching
                    : forgeSearchQuery.isFetching
                }
                errorMessage={
                  activePicker?.kind === "plugin"
                    ? (pluginSearchQuery.data?.error ??
                        (pluginSearchQuery.error instanceof Error
                          ? pluginSearchQuery.error.message
                          : null))
                    : (forgeSearchQuery.data?.error ??
                        (forgeSearchQuery.error instanceof Error
                          ? forgeSearchQuery.error.message
                          : null))
                }
                searchingLabel={t("pickerSearching")}
                noResultsLabel={t("pickerNoResults")}
                options={pickerOptions}
                onClose={() => {
                  setActivePicker(null);
                  setPickerQuery("");
                  setDebouncedQuery("");
                }}
                theme={theme}
                compact={compact}
                uiFontSize={appearance.uiBaseFontSize}
                panelWidth={panelWidth}
              />
            </View>

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

            {/* 4. Mode Ghost Pill */}
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

            {/* 5b. Compact Main Session Context Toggle Icon */}
            {hasMainAgent ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={
                  shouldAttachMainContext ? t("mainContextAttached") : t("mainContextOff")
                }
                accessibilityState={{ checked: shouldAttachMainContext }}
                onPress={onToggleMainContext}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    width: discSize,
                    height: discSize,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: shouldAttachMainContext
                      ? palette.accentSoftBg
                      : pressed || hovered
                        ? colors.surface2
                        : "transparent",
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon
                  name="Link2"
                  size={glyphSize}
                  color={shouldAttachMainContext ? colors.accent : colors.foregroundMuted}
                />
              </Pressable>
            ) : null}
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
            {isBusy && !hasSendableInput ? (
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
