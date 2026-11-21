import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import { useEffect, useId, type ReactNode } from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { pointerCursorStyle, popoverScopeProps, watchPopoverDismiss } from "./web";

export interface MenuOption {
  id: string;
  label: string;
  subtitle?: string | null;
  section?: string | null;
  icon?: string;
  iconSvg?: string | null;
  selected?: boolean;
  danger?: boolean;
  onSelect(): void;
}

export function PopoverMenu({
  title,
  sheetTitle,
  open,
  onOpenChange,
  anchor = "left",
  placement = "bottom",
  theme,
  compact,
  uiFontSize,
  iconSize = 15,
  minWidth = 220,
  trigger,
  headerAction,
  options,
  emptyLabel,
}: {
  title?: string;
  sheetTitle?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  anchor?: "left" | "right";
  placement?: "top" | "bottom";
  theme: PluginTheme;
  compact: boolean;
  uiFontSize: number;
  iconSize?: number;
  minWidth?: number;
  trigger: ReactNode;
  headerAction?: ReactNode;
  options: readonly MenuOption[];
  emptyLabel?: string;
}) {
  const scopeId = useId();
  const { width: windowWidth } = useWindowDimensions();
  const useSheet = Platform.OS !== "web" || compact || windowWidth < 520;
  const { colors } = theme;
  const rowHeight = useSheet ? 44 : 32;

  useEffect(() => {
    if (!open || useSheet) return;
    return watchPopoverDismiss(scopeId, () => onOpenChange(false));
  }, [open, useSheet, scopeId, onOpenChange]);

  const renderRows = () => (
    <View style={{ paddingVertical: 4 }}>
      {options.length === 0 && emptyLabel ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ fontSize: uiFontSize - 1, color: colors.foregroundMuted }}>
            {emptyLabel}
          </Text>
        </View>
      ) : (
        options.map((opt, idx) => {
          const prevSection = idx > 0 ? options[idx - 1].section : null;
          const showSectionHeader = Boolean(opt.section && opt.section !== prevSection);
          const iconColor = opt.danger
            ? colors.statusDanger
            : opt.selected
              ? colors.accent
              : colors.foregroundMuted;

          return (
            <View key={opt.id}>
              {showSectionHeader ? (
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingTop: idx > 0 ? 8 : 4,
                    paddingBottom: 3,
                    ...(idx > 0
                      ? {
                          marginTop: 4,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }
                      : {}),
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: Math.max(10, uiFontSize - 2),
                      fontWeight: "600",
                      color: colors.foregroundMuted,
                    }}
                  >
                    {opt.section}
                  </Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: Boolean(opt.selected) }}
                onPress={() => {
                  onOpenChange(false);
                  opt.onSelect();
                }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    minHeight: rowHeight,
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
                  <Icon icon={{ svg: opt.iconSvg }} size={iconSize} color={iconColor} />
                ) : opt.icon ? (
                  <Icon name={opt.icon} size={iconSize} color={iconColor} />
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: uiFontSize,
                      fontWeight: opt.selected ? "600" : "400",
                      color: opt.danger ? colors.statusDanger : colors.foreground,
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
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <View {...popoverScopeProps(scopeId)} style={{ position: "relative", zIndex: open ? 40 : 1 }}>
      {trigger}
      {open && !useSheet ? (
        <View
          style={{
            position: "absolute",
            ...(placement === "top"
              ? { bottom: "100%", marginBottom: 6 }
              : { top: "100%", marginTop: 6 }),
            ...(anchor === "right" ? { right: 0 } : { left: 0 }),
            minWidth,
            maxWidth: 320,
            maxHeight: 340,
            backgroundColor: colors.surface1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          {title || headerAction ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              {title ? (
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
              ) : (
                <View />
              )}
              {headerAction}
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 290 }}>{renderRows()}</ScrollView>
        </View>
      ) : null}

      {useSheet ? (
        <Modal title={title ?? sheetTitle ?? ""} open={open} onOpenChange={onOpenChange}>
          <Modal.Content scrollable contentContainerStyle={{ padding: 8, gap: 4 }}>
            {headerAction ? (
              <View style={{ paddingHorizontal: 6, paddingBottom: 4 }}>{headerAction}</View>
            ) : null}
            {renderRows()}
          </Modal.Content>
        </Modal>
      ) : null}
    </View>
  );
}
