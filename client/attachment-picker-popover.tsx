import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useId, useState } from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Spinner } from "./spinner";
import { noOutlineInputStyle, pointerCursorStyle, popoverScopeProps, watchPopoverDismiss } from "./web";

export interface SearchableAttachmentOption {
  id: string;
  label: string;
  subtitle?: string | null;
  iconName?: string | null;
  iconSvg?: string | null;
  selected?: boolean;
  onSelect(): void;
}

export function AttachmentPickerPopover({
  open,
  title,
  searchPlaceholder,
  query,
  onChangeQuery,
  isFetching,
  errorMessage,
  searchingLabel,
  noResultsLabel,
  options,
  onClose,
  theme,
  compact,
  uiFontSize,
  panelWidth,
}: {
  open: boolean;
  title: string;
  searchPlaceholder: string;
  query: string;
  onChangeQuery(next: string): void;
  isFetching: boolean;
  errorMessage?: string | null;
  searchingLabel: string;
  noResultsLabel: string;
  options: readonly SearchableAttachmentOption[];
  onClose(): void;
  theme: PluginTheme;
  compact: boolean;
  uiFontSize: number;
  panelWidth: number;
}) {
  const scopeId = useId();
  const { width: windowWidth } = useWindowDimensions();
  const useSheet = Platform.OS !== "web" || compact || windowWidth < 520;
  const { colors } = theme;
  const [, setInputFocused] = useState(false);

  useEffect(() => {
    if (!open || useSheet) return;
    return watchPopoverDismiss(scopeId, onClose);
  }, [open, useSheet, scopeId, onClose]);

  if (!open) return null;

  const pickerWidth = Math.max(250, Math.min(340, panelWidth - 28));

  const renderContent = () => (
    <View style={{ gap: 0 }}>
      {/* Search Bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Icon name="Search" size={14} color={colors.foregroundMuted} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChangeQuery}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.foregroundMuted}
          accessibilityLabel={searchPlaceholder}
          style={[
            {
              flex: 1,
              minWidth: 0,
              padding: 0,
              fontSize: uiFontSize,
              color: colors.foreground,
            },
            noOutlineInputStyle,
          ]}
        />
        {isFetching ? <Spinner size={13} color={colors.foregroundMuted} /> : null}
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onChangeQuery("")}
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
            <Icon name="X" size={12} color={colors.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Results List */}
      <ScrollView style={{ maxHeight: 260 }}>
        <View style={{ paddingVertical: 4 }}>
          {options.length === 0 ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 14 }}>
              <Text
                style={{
                  fontSize: Math.max(11, uiFontSize - 1),
                  color: errorMessage ? colors.statusDanger : colors.foregroundMuted,
                }}
              >
                {errorMessage || (isFetching ? searchingLabel : noResultsLabel)}
              </Text>
            </View>
          ) : (
            options.map((opt) => {
              const iconColor = opt.selected ? colors.accent : colors.foregroundMuted;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="menuitem"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: Boolean(opt.selected) }}
                  onPress={() => {
                    opt.onSelect();
                    onClose();
                  }}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    {
                      minHeight: useSheet ? 44 : 34,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      marginHorizontal: 4,
                      borderRadius: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor:
                        pressed || hovered
                          ? colors.surface2
                          : opt.selected
                            ? colors.surface1
                            : "transparent",
                    },
                    pointerCursorStyle,
                  ]}
                >
                  {opt.iconSvg ? (
                    <Icon icon={{ svg: opt.iconSvg }} size={15} color={iconColor} />
                  ) : opt.iconName ? (
                    <Icon name={opt.iconName} size={15} color={iconColor} />
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: uiFontSize,
                        fontWeight: opt.selected ? "600" : "400",
                        color: colors.foreground,
                      }}
                    >
                      {opt.label}
                    </Text>
                    {opt.subtitle ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: Math.max(10, uiFontSize - 2),
                          color: colors.foregroundMuted,
                          marginTop: 1,
                        }}
                      >
                        {opt.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {opt.selected ? <Icon name="Check" size={14} color={colors.accent} /> : null}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );

  if (useSheet) {
    return (
      <Modal title={title} open={open} onOpenChange={(next) => !next && onClose()}>
        <Modal.Content contentContainerStyle={{ padding: 0 }}>{renderContent()}</Modal.Content>
      </Modal>
    );
  }

  return (
    <View
      {...popoverScopeProps(scopeId)}
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: 6,
        width: pickerWidth,
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        shadowColor: "#000",
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        overflow: "hidden",
        zIndex: 60,
      }}
    >
      <View
        style={{
          paddingHorizontal: 10,
          paddingTop: 7,
          paddingBottom: 4,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontSize: Math.max(11, uiFontSize - 1),
            fontWeight: "600",
            color: colors.foregroundMuted,
          }}
        >
          {title}
        </Text>
      </View>
      {renderContent()}
    </View>
  );
}
