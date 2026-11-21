import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import { Spinner } from "./spinner";
import { pointerCursorStyle } from "./web";

export interface ComposerAutocompleteOption {
  id: string;
  label: string;
  argumentHint?: string;
  description?: string;
  tag?: string;
  iconName: "File" | "Folder" | "SquareSlash" | "Sparkles" | "SquarePen" | "Archive";
  onSelect(): void;
}

export function ComposerAutocompletePopover({
  visible,
  options,
  selectedIndex,
  isLoading,
  loadingLabel,
  emptyLabel,
  theme,
  isTouch,
  uiFontSize,
}: {
  visible: boolean;
  options: readonly ComposerAutocompleteOption[];
  selectedIndex: number;
  isLoading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  theme: PluginTheme;
  isTouch: boolean;
  uiFontSize: number;
}) {
  if (!visible) return null;

  const { colors } = theme;
  const rowHeight = isTouch ? 40 : 34;

  return (
    <View
      style={{
        position: "absolute",
        bottom: "100%",
        left: 12,
        right: 12,
        marginBottom: 6,
        maxHeight: 224,
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        shadowColor: "#000",
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        overflow: "hidden",
        zIndex: 65,
      }}
    >
      {options.length === 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 11,
          }}
        >
          {isLoading ? <Spinner size={13} color={colors.foregroundMuted} /> : null}
          <Text
            numberOfLines={1}
            style={{
              fontSize: Math.max(11, uiFontSize - 1),
              color: colors.foregroundMuted,
            }}
          >
            {isLoading ? loadingLabel : emptyLabel}
          </Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 222 }}>
          <View style={{ paddingVertical: 4 }}>
            {options.map((opt, idx) => {
              const active = idx === selectedIndex;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="menuitem"
                  accessibilityLabel={
                    opt.description ? `${opt.label}, ${opt.description}` : opt.label
                  }
                  accessibilityState={{ selected: active }}
                  onPress={opt.onSelect}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    {
                      minHeight: rowHeight,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      marginHorizontal: 4,
                      borderRadius: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      backgroundColor:
                        pressed || hovered || active ? colors.surface2 : "transparent",
                    },
                    pointerCursorStyle,
                  ]}
                >
                  <Icon
                    name={opt.iconName}
                    size={14}
                    color={
                      opt.iconName === "Sparkles"
                        ? colors.accent
                        : active
                          ? colors.foreground
                          : colors.foregroundMuted
                    }
                  />

                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 0,
                      maxWidth: 210,
                      fontSize: uiFontSize,
                      fontWeight: "500",
                      color: colors.foreground,
                    }}
                  >
                    {opt.label}
                  </Text>

                  {opt.argumentHint ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        flexShrink: 1,
                        maxWidth: 120,
                        fontSize: Math.max(11, uiFontSize - 1),
                        color: colors.foregroundMuted,
                      }}
                    >
                      {opt.argumentHint}
                    </Text>
                  ) : null}

                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: Math.max(11, uiFontSize - 1),
                      color: colors.foregroundMuted,
                    }}
                  >
                    {opt.description ?? ""}
                  </Text>

                  {opt.tag ? (
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 1.5,
                        borderRadius: 5,
                        backgroundColor: colors.surface0,
                        borderWidth: 1,
                        borderColor: colors.border,
                        flexShrink: 0,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: Math.max(10, uiFontSize - 3),
                          fontWeight: "600",
                          color: colors.foregroundMuted,
                        }}
                      >
                        {opt.tag}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
