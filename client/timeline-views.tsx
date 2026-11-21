import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import { copyText, Icon, Markdown, StreamedText, useToast } from "@getpaseo/plugin/client/ui";
import type {
  AgentPermissionRequest,
  AgentPermissionResponse,
} from "@getpaseo/protocol/agent-types";
import { memo, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { DerivedPalette, HostAppearanceSettings } from "../shared/appearance";
import { formatWorkSummaryLabel } from "../shared/messages";
import {
  describeSidechatToolCall,
  type ProjectedRow,
  type SidechatAssistantItem,
  type SidechatCompactionItem,
  type SidechatNotificationItem,
  type SidechatPluginItem,
  type SidechatThoughtItem,
  type SidechatTodoItem,
  type SidechatToolCallItem,
  type SidechatUserItem,
  type WorkSummaryCounts,
} from "../shared/timeline";
import {
  type EvaluatedExternalTimelinePlugin,
  ExternalPluginTimelineItemView,
} from "./external-timeline-plugins";
import type { useMessages } from "./messages";
import { Spinner } from "./spinner";
import { codeScopeProps, pointerCursorStyle } from "./web";

type TranslateFn = ReturnType<typeof useMessages>["t"];

interface SharedRowVisualProps {
  theme: PluginTheme;
  palette: DerivedPalette;
  appearance: HostAppearanceSettings;
  compact: boolean;
  locale: string;
  t: TranslateFn;
}

const USER_COLLAPSE_CHAR_LIMIT = 360;
const USER_COLLAPSE_LINE_LIMIT = 7;

const UserMessageRow = memo(function UserMessageRow({
  item,
  theme,
  palette,
  appearance,
  compact,
  t,
}: SharedRowVisualProps & { item: SidechatUserItem }) {
  const [expandedText, setExpandedText] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const { colors } = theme;

  const lineCount = item.body.split("\n").length;
  const isLong =
    item.body.length > USER_COLLAPSE_CHAR_LIMIT || lineCount > USER_COLLAPSE_LINE_LIMIT;
  const displayedText =
    isLong && !expandedText
      ? item.body
          .split("\n")
          .slice(0, USER_COLLAPSE_LINE_LIMIT)
          .join("\n")
          .slice(0, USER_COLLAPSE_CHAR_LIMIT)
          .trimEnd() + "…"
      : item.body;

  return (
    <View style={{ alignItems: "flex-end", paddingVertical: 4 }}>
      <View
        style={{
          maxWidth: "92%",
          backgroundColor: palette.userBubbleBg,
          borderWidth: 1,
          borderColor: palette.userBubbleBorder,
          borderRadius: 10,
          paddingHorizontal: 11,
          paddingVertical: 8,
          gap: 6,
          opacity: item.optimistic ? 0.82 : 1,
        }}
      >
        {item.mainContext || item.quotedSelection ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {item.mainContext ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("mainContextBadge")}
                accessibilityState={{ expanded: showContext }}
                onPress={() => setShowContext((v) => !v)}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: 5,
                    backgroundColor: pressed || hovered ? colors.surface2 : colors.surface0,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon name="Link2" size={11} color={colors.accent} />
                <Text style={{ fontSize: Math.max(11, appearance.uiBaseFontSize - 2), color: colors.foregroundMuted }}>
                  {t("mainContextBadge")}
                </Text>
                <Icon
                  name={showContext ? "ChevronDown" : "ChevronRight"}
                  size={11}
                  color={colors.foregroundMuted}
                />
              </Pressable>
            ) : null}

            {item.quotedSelection ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("quotedSelectionBadge")}
                accessibilityState={{ expanded: showQuote }}
                onPress={() => setShowQuote((v) => !v)}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: 5,
                    backgroundColor: pressed || hovered ? colors.surface2 : colors.surface0,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                  pointerCursorStyle,
                ]}
              >
                <Icon name="Quote" size={11} color={colors.accent} />
                <Text style={{ fontSize: Math.max(11, appearance.uiBaseFontSize - 2), color: colors.foregroundMuted }}>
                  {t("quotedSelectionBadge")}
                </Text>
                <Icon
                  name={showQuote ? "ChevronDown" : "ChevronRight"}
                  size={11}
                  color={colors.foregroundMuted}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showContext && item.mainContext ? (
          <View
            {...codeScopeProps}
            style={{
              backgroundColor: palette.codeBg,
              borderRadius: 6,
              padding: 8,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              selectable
              style={{
                fontFamily: appearance.monoFontFamily,
                fontSize: Math.max(11, appearance.codeFontSize - 1),
                lineHeight: appearance.codeLineHeight,
                color: colors.foregroundMuted,
              }}
            >
              {item.mainContext}
            </Text>
          </View>
        ) : null}

        {showQuote && item.quotedSelection ? (
          <View
            {...codeScopeProps}
            style={{
              backgroundColor: palette.codeBg,
              borderRadius: 6,
              padding: 8,
              borderLeftWidth: 2,
              borderLeftColor: colors.accent,
            }}
          >
            <Text
              selectable
              style={{
                fontFamily: appearance.monoFontFamily,
                fontSize: appearance.codeFontSize,
                lineHeight: appearance.codeLineHeight,
                color: colors.foreground,
              }}
            >
              {item.quotedSelection}
            </Text>
          </View>
        ) : null}

        <Text
          selectable
          style={{
            fontSize: appearance.contentFontSize,
            lineHeight: appearance.contentLineHeight,
            color: colors.foreground,
          }}
        >
          {displayedText}
        </Text>

        {isLong ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expandedText ? t("showLess") : t("showMore")}
            onPress={() => setExpandedText((v) => !v)}
            style={[
              {
                alignSelf: "flex-start",
                minHeight: compact ? 32 : 22,
                justifyContent: "center",
              },
              pointerCursorStyle,
            ]}
          >
            <Text
              style={{
                fontSize: Math.max(11, appearance.uiBaseFontSize - 1),
                fontWeight: "500",
                color: colors.accent,
              }}
            >
              {expandedText ? t("showLess") : t("showMore")}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const ThoughtRow = memo(function ThoughtRow({
  item,
  expanded,
  nested,
  onToggle,
  theme,
  palette,
  appearance,
  compact,
  t,
}: SharedRowVisualProps & {
  item: SidechatThoughtItem;
  expanded: boolean;
  nested?: boolean;
  onToggle(id: string): void;
}) {
  const { colors } = theme;
  const isStreaming = item.status === "loading";
  const lastLine =
    item.text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1) ?? "";

  return (
    <View style={{ marginLeft: nested ? 12 : 0, marginVertical: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isStreaming ? t("thinkingStreaming") : t("thinkingDone")}
        accessibilityState={{ expanded }}
        onPress={() => onToggle(item.id)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          {
            minHeight: compact ? 38 : 26,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: pressed || hovered ? colors.surface1 : "transparent",
          },
          pointerCursorStyle,
        ]}
      >
        {isStreaming ? (
          <Spinner size={13} color={colors.accent} label={t("thinkingStreaming")} />
        ) : (
          <Icon name="Brain" size={13} color={colors.foregroundMuted} />
        )}
        <Text
          numberOfLines={1}
          style={{
            fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
            fontWeight: "500",
            color: isStreaming ? colors.foreground : colors.foregroundMuted,
          }}
        >
          {isStreaming ? t("thinkingStreaming") : t("thinkingDone")}
        </Text>
        {!expanded && lastLine ? (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: Math.max(11, appearance.uiBaseFontSize - 2),
              color: colors.foregroundMuted,
              opacity: 0.8,
            }}
          >
            {lastLine.replace(/^[-*#>\s]+/, "")}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          size={13}
          color={colors.foregroundMuted}
        />
      </Pressable>

      {expanded ? (
        <View
          style={{
            marginTop: 2,
            marginLeft: 13,
            paddingLeft: 10,
            paddingRight: 8,
            paddingVertical: 6,
            borderLeftWidth: 2,
            borderLeftColor: palette.thoughtBorder,
            backgroundColor: palette.thoughtBg,
            borderTopRightRadius: 6,
            borderBottomRightRadius: 6,
          }}
        >
          {isStreaming ? (
            <StreamedText
              text={item.text}
              phase="streaming"
              style={{
                fontSize: Math.max(12, appearance.contentFontSize - 1),
                lineHeight: Math.round((appearance.contentFontSize - 1) * 1.45),
                color: colors.foregroundMuted,
              }}
            />
          ) : (
            <View style={{ opacity: 0.88 }}>
              <Markdown>{item.text}</Markdown>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
});

const ToolCallRow = memo(function ToolCallRow({
  item,
  expanded,
  nested,
  onToggle,
  theme,
  palette,
  appearance,
  compact,
}: SharedRowVisualProps & {
  item: SidechatToolCallItem;
  expanded: boolean;
  nested?: boolean;
  onToggle(id: string): void;
}) {
  const { colors } = theme;
  const info = describeSidechatToolCall(item);
  const isRunning = item.status === "running";
  const isFailed = item.status === "failed";
  const hasDetails = Boolean(info.codePreview || info.outputPreview || info.errorText);

  return (
    <View style={{ marginLeft: nested ? 12 : 0, marginVertical: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${info.title}${info.subtitle ? ` ${info.subtitle}` : ""}`}
        accessibilityState={{ expanded, disabled: !hasDetails }}
        disabled={!hasDetails}
        onPress={() => onToggle(item.id)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          {
            minHeight: compact ? 38 : 26,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor:
              pressed || hovered
                ? colors.surface2
                : expanded
                  ? colors.surface1
                  : "transparent",
          },
          hasDetails ? pointerCursorStyle : undefined,
        ]}
      >
        {isRunning ? (
          <Spinner size={13} color={colors.accent} label={info.title} />
        ) : isFailed ? (
          <Icon name="CircleAlert" size={13} color={colors.statusDanger} />
        ) : (
          <Icon name={info.icon} size={13} color={colors.foregroundMuted} />
        )}

        <Text
          style={{
            fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
            fontWeight: "500",
            color: isFailed ? colors.statusDanger : colors.foreground,
          }}
        >
          {info.title}
        </Text>

        {info.subtitle ? (
          <View {...codeScopeProps} style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: appearance.monoFontFamily,
                fontSize: Math.max(11, appearance.codeFontSize - 1),
                color: colors.foregroundMuted,
              }}
            >
              {info.subtitle}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {hasDetails ? (
          <Icon
            name={expanded ? "ChevronDown" : "ChevronRight"}
            size={13}
            color={colors.foregroundMuted}
          />
        ) : null}
      </Pressable>

      {expanded && hasDetails ? (
        <View
          {...codeScopeProps}
          style={{
            marginTop: 3,
            marginLeft: 14,
            padding: 8,
            borderRadius: 6,
            backgroundColor: palette.codeBg,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          {info.codePreview ? (
            <Text
              selectable
              style={{
                fontFamily: appearance.monoFontFamily,
                fontSize: appearance.codeFontSize,
                lineHeight: appearance.codeLineHeight,
                color: colors.foreground,
              }}
            >
              {info.codePreview}
            </Text>
          ) : null}
          {info.outputPreview ? (
            <View
              style={{
                borderTopWidth: info.codePreview ? 1 : 0,
                borderTopColor: colors.border,
                paddingTop: info.codePreview ? 6 : 0,
              }}
            >
              <Text
                selectable
                style={{
                  fontFamily: appearance.monoFontFamily,
                  fontSize: Math.max(11, appearance.codeFontSize - 1),
                  lineHeight: appearance.codeLineHeight,
                  color: colors.foregroundMuted,
                }}
              >
                {info.outputPreview}
              </Text>
            </View>
          ) : null}
          {info.errorText ? (
            <Text
              selectable
              style={{
                fontFamily: appearance.monoFontFamily,
                fontSize: Math.max(11, appearance.codeFontSize - 1),
                lineHeight: appearance.codeLineHeight,
                color: colors.statusDanger,
              }}
            >
              {info.errorText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const SummaryGroupRow = memo(function SummaryGroupRow({
  id,
  icon,
  counts,
  isLoading,
  expanded,
  onToggle,
  theme,
  appearance,
  compact,
  locale,
}: SharedRowVisualProps & {
  id: string;
  icon: "Wrench" | "Layers";
  counts: WorkSummaryCounts;
  isLoading: boolean;
  expanded: boolean;
  onToggle(id: string): void;
}) {
  const { colors } = theme;
  const label = formatWorkSummaryLabel(counts, locale, isLoading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      onPress={() => onToggle(id)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        {
          minHeight: compact ? 38 : 28,
          marginVertical: 2,
          paddingHorizontal: 9,
          paddingVertical: 5,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: expanded ? colors.border : "transparent",
          backgroundColor:
            pressed || hovered ? colors.surface2 : expanded ? colors.surface1 : colors.surface1,
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
        },
        pointerCursorStyle,
      ]}
    >
      {isLoading ? (
        <Spinner size={13} color={colors.accent} label={label} />
      ) : (
        <Icon name={icon} size={13} color={colors.foregroundMuted} />
      )}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
          color: isLoading ? colors.foreground : colors.foregroundMuted,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <Icon
        name={expanded ? "ChevronDown" : "ChevronRight"}
        size={13}
        color={colors.foregroundMuted}
      />
    </Pressable>
  );
});

function TurnResponseActionsBar({
  answerText,
  questionText,
  canInsertToMain,
  canSendToMain,
  onInsertToMain,
  onSendToMain,
  theme,
  appearance,
  compact,
  t,
}: {
  answerText: string;
  questionText: string | null;
  canInsertToMain: boolean;
  canSendToMain: boolean;
  onInsertToMain(question: string | null, answer: string): void;
  onSendToMain(question: string | null, answer: string): void;
  theme: PluginTheme;
  appearance: HostAppearanceSettings;
  compact: boolean;
  t: TranslateFn;
}) {
  const { colors } = theme;
  const toast = useToast();
  const btnHeight = compact ? 34 : 24;
  const btnFont = Math.max(11, appearance.uiBaseFontSize - 2);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 2,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("copyAnswer")}
        onPress={() => {
          void copyText(answerText).then(
            () => toast.show(t("copied"), { variant: "success" }),
            () => toast.error(t("copyFailed")),
          );
        }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          {
            minHeight: btnHeight,
            paddingHorizontal: 7,
            borderRadius: 5,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
          },
          pointerCursorStyle,
        ]}
      >
        <Icon name="Copy" size={12} color={colors.foregroundMuted} />
        <Text style={{ fontSize: btnFont, color: colors.foregroundMuted }}>
          {t("copyAnswer")}
        </Text>
      </Pressable>

      {canInsertToMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("insertToMain")}
          onPress={() => onInsertToMain(questionText, answerText)}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            {
              minHeight: btnHeight,
              paddingHorizontal: 7,
              borderRadius: 5,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
            },
            pointerCursorStyle,
          ]}
        >
          <Icon name="CornerDownLeft" size={12} color={colors.foregroundMuted} />
          <Text style={{ fontSize: btnFont, color: colors.foregroundMuted }}>
            {t("insertToMain")}
          </Text>
        </Pressable>
      ) : null}

      {canSendToMain ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sendToMain")}
          onPress={() => onSendToMain(questionText, answerText)}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            {
              minHeight: btnHeight,
              paddingHorizontal: 7,
              borderRadius: 5,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
            },
            pointerCursorStyle,
          ]}
        >
          <Icon name="Send" size={12} color={colors.foregroundMuted} />
          <Text style={{ fontSize: btnFont, color: colors.foregroundMuted }}>
            {t("sendToMain")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const AssistantMessageRow = memo(function AssistantMessageRow({
  item,
  questionText,
  showActions,
  canInsertToMain,
  canSendToMain,
  onInsertToMain,
  onSendToMain,
  theme,
  appearance,
  compact,
  t,
}: SharedRowVisualProps & {
  item: SidechatAssistantItem;
  questionText: string | null;
  showActions: boolean;
  canInsertToMain: boolean;
  canSendToMain: boolean;
  onInsertToMain(question: string | null, answer: string): void;
  onSendToMain(question: string | null, answer: string): void;
}) {
  const { colors } = theme;
  const hasBlockMarkdown = /```|^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.*\|)/m.test(item.text);

  return (
    <View style={{ paddingVertical: 4, gap: 4 }}>
      <View style={{ paddingHorizontal: 2 }}>
        {item.streaming && !hasBlockMarkdown ? (
          <StreamedText
            text={item.text}
            phase="streaming"
            style={{
              fontSize: appearance.contentFontSize,
              lineHeight: appearance.contentLineHeight,
              color: colors.foreground,
            }}
          />
        ) : (
          <Markdown>{item.text}</Markdown>
        )}
      </View>

      {showActions && !item.streaming && item.text.trim() ? (
        <TurnResponseActionsBar
          answerText={item.text}
          questionText={questionText}
          canInsertToMain={canInsertToMain}
          canSendToMain={canSendToMain}
          onInsertToMain={onInsertToMain}
          onSendToMain={onSendToMain}
          theme={theme}
          appearance={appearance}
          compact={compact}
          t={t}
        />
      ) : null}
    </View>
  );
});

const PluginTimelineRow = memo(function PluginTimelineRow({
  item,
  agentId,
  host,
  layout,
  externalPlugins,
  questionText,
  showActions,
  actionText,
  canInsertToMain,
  canSendToMain,
  onInsertToMain,
  onSendToMain,
  theme,
  appearance,
  compact,
  t,
}: SharedRowVisualProps & {
  item: SidechatPluginItem;
  agentId: string;
  host: PluginHostProps["host"];
  layout: PluginHostProps["layout"];
  externalPlugins: ReadonlyArray<EvaluatedExternalTimelinePlugin>;
  questionText: string | null;
  showActions: boolean;
  actionText: string | null;
  canInsertToMain: boolean;
  canSendToMain: boolean;
  onInsertToMain(question: string | null, answer: string): void;
  onSendToMain(question: string | null, answer: string): void;
}) {
  return (
    <View style={{ paddingVertical: 2, gap: 4 }}>
      <ExternalPluginTimelineItemView
        item={item}
        agentId={agentId}
        host={host}
        theme={theme}
        layout={layout}
        plugins={externalPlugins}
      />
      {showActions && actionText ? (
        <TurnResponseActionsBar
          answerText={actionText}
          questionText={questionText}
          canInsertToMain={canInsertToMain}
          canSendToMain={canSendToMain}
          onInsertToMain={onInsertToMain}
          onSendToMain={onSendToMain}
          theme={theme}
          appearance={appearance}
          compact={compact}
          t={t}
        />
      ) : null}
    </View>
  );
});

const TodoListRow = memo(function TodoListRow({
  item,
  theme,
  appearance,
  t,
}: SharedRowVisualProps & { item: SidechatTodoItem }) {
  const { colors } = theme;
  if (item.items.length === 0) return null;
  return (
    <View
      style={{
        marginVertical: 4,
        padding: 9,
        borderRadius: 7,
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 5,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="ListTodo" size={13} color={colors.foregroundMuted} />
        <Text
          style={{
            fontSize: Math.max(11, appearance.uiBaseFontSize - 1),
            fontWeight: "600",
            color: colors.foregroundMuted,
          }}
        >
          {t("todosTitle")}
        </Text>
      </View>
      {item.items.map((task, idx) => {
        const done = task.completed || task.status === "completed";
        const active = task.status === "in_progress";
        return (
          <View
            key={task.id ?? `${idx}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon
              name={done ? "CircleCheck" : active ? "CircleDot" : "Circle"}
              size={12}
              color={done ? colors.statusSuccess : active ? colors.accent : colors.foregroundMuted}
            />
            <Text
              style={{
                flex: 1,
                fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
                color: done ? colors.foregroundMuted : colors.foreground,
                textDecorationLine: done ? "line-through" : "none",
              }}
            >
              {task.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const NotificationRow = memo(function NotificationRow({
  item,
  theme,
  palette,
  appearance,
}: SharedRowVisualProps & { item: SidechatNotificationItem }) {
  const { colors } = theme;
  const isError = item.level === "error";
  const isWarning = item.level === "warning";
  return (
    <View
      style={{
        marginVertical: 4,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 7,
        backgroundColor: isError
          ? palette.dangerSoftBg
          : isWarning
            ? palette.warningSoftBg
            : colors.surface1,
        borderWidth: 1,
        borderColor: isError ? colors.statusDanger : isWarning ? colors.statusWarning : colors.border,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 7,
      }}
    >
      <Icon
        name={isError ? "CircleAlert" : isWarning ? "TriangleAlert" : "Info"}
        size={14}
        color={
          isError
            ? colors.statusDanger
            : isWarning
              ? colors.statusWarning
              : colors.foregroundMuted
        }
      />
      <Text
        selectable
        style={{
          flex: 1,
          fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
          lineHeight: Math.round((appearance.uiBaseFontSize - 1) * 1.45),
          color: isError ? colors.statusDanger : colors.foreground,
        }}
      >
        {item.message}
      </Text>
    </View>
  );
});

const CompactionRow = memo(function CompactionRow({
  item,
  theme,
  appearance,
  t,
}: SharedRowVisualProps & { item: SidechatCompactionItem }) {
  const { colors } = theme;
  const loading = item.status === "loading";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 6,
      }}
    >
      {loading ? (
        <Spinner size={12} color={colors.foregroundMuted} label={t("compactingContext")} />
      ) : (
        <Icon name="Minimize2" size={12} color={colors.foregroundMuted} />
      )}
      <Text style={{ fontSize: Math.max(11, appearance.uiBaseFontSize - 2), color: colors.foregroundMuted }}>
        {loading ? t("compactingContext") : t("compactedContext")}
      </Text>
    </View>
  );
});

export function SidechatTimelineRowView({
  row,
  agentId,
  host,
  layout,
  externalPlugins,
  theme,
  palette,
  appearance,
  compact,
  locale,
  t,
  canInsertToMain,
  canSendToMain,
  onToggleItem,
  onToggleGroup,
  onInsertToMain,
  onSendToMain,
}: SharedRowVisualProps & {
  row: ProjectedRow;
  agentId: string;
  host: PluginHostProps["host"];
  layout: PluginHostProps["layout"];
  externalPlugins: ReadonlyArray<EvaluatedExternalTimelinePlugin>;
  canInsertToMain: boolean;
  canSendToMain: boolean;
  onToggleItem(id: string): void;
  onToggleGroup(id: string): void;
  onInsertToMain(question: string | null, answer: string): void;
  onSendToMain(question: string | null, answer: string): void;
}) {
  const shared = { theme, palette, appearance, compact, locale, t };
  switch (row.kind) {
    case "user_message":
      return <UserMessageRow {...shared} item={row.item} />;
    case "thought":
      return (
        <ThoughtRow
          {...shared}
          item={row.item}
          expanded={row.expanded}
          nested={row.nested}
          onToggle={onToggleItem}
        />
      );
    case "tool_call":
      return (
        <ToolCallRow
          {...shared}
          item={row.item}
          expanded={row.expanded}
          nested={row.nested}
          onToggle={onToggleItem}
        />
      );
    case "tool_group":
      return (
        <SummaryGroupRow
          {...shared}
          id={row.id}
          icon="Wrench"
          counts={row.counts}
          isLoading={row.isLoading}
          expanded={row.expanded}
          onToggle={onToggleGroup}
        />
      );
    case "turn_summary":
      return (
        <SummaryGroupRow
          {...shared}
          id={row.id}
          icon="Layers"
          counts={row.counts}
          isLoading={row.isLoading}
          expanded={row.expanded}
          onToggle={onToggleGroup}
        />
      );
    case "assistant_message":
      return (
        <AssistantMessageRow
          {...shared}
          item={row.item}
          questionText={row.questionText}
          showActions={row.showActions}
          canInsertToMain={canInsertToMain}
          canSendToMain={canSendToMain}
          onInsertToMain={onInsertToMain}
          onSendToMain={onSendToMain}
        />
      );
    case "plugin":
      return (
        <PluginTimelineRow
          {...shared}
          item={row.item}
          agentId={agentId}
          host={host}
          layout={layout}
          externalPlugins={externalPlugins}
          questionText={row.questionText}
          showActions={row.showActions}
          actionText={row.actionText}
          canInsertToMain={canInsertToMain}
          canSendToMain={canSendToMain}
          onInsertToMain={onInsertToMain}
          onSendToMain={onSendToMain}
        />
      );
    case "todo_list":
      return <TodoListRow {...shared} item={row.item} />;
    case "notification":
      return <NotificationRow {...shared} item={row.item} />;
    case "compaction":
      return <CompactionRow {...shared} item={row.item} />;
  }
}

export function PermissionRequestBanner({
  requests,
  theme,
  palette,
  appearance,
  compact,
  t,
  onRespond,
}: SharedRowVisualProps & {
  requests: readonly AgentPermissionRequest[];
  onRespond(requestId: string, response: AgentPermissionResponse): void;
}) {
  if (requests.length === 0) return null;
  const req = requests[0];
  const { colors } = theme;
  const btnHeight = compact ? 38 : 28;

  return (
    <View
      style={{
        marginHorizontal: 10,
        marginBottom: 8,
        padding: 10,
        borderRadius: 8,
        backgroundColor: palette.warningSoftBg,
        borderWidth: 1,
        borderColor: colors.statusWarning,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="ShieldAlert" size={14} color={colors.statusWarning} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: appearance.uiBaseFontSize,
            fontWeight: "600",
            color: colors.foreground,
          }}
        >
          {req.title || `${t("permissionRequired")}: ${req.name}`}
        </Text>
      </View>

      {req.description ? (
        <Text
          style={{
            fontSize: Math.max(11, appearance.uiBaseFontSize - 1),
            color: colors.foregroundMuted,
          }}
        >
          {req.description}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
        {req.actions && req.actions.length > 0 ? (
          req.actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() =>
                onRespond(req.id, {
                  behavior: action.behavior,
                  selectedActionId: action.id,
                })
              }
              style={({ pressed }) => [
                {
                  minHeight: btnHeight,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor:
                    action.behavior === "allow" ? colors.accent : colors.surface1,
                  borderWidth: 1,
                  borderColor:
                    action.behavior === "allow" ? colors.accent : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
                pointerCursorStyle,
              ]}
            >
              <Text
                style={{
                  fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
                  fontWeight: "600",
                  color:
                    action.behavior === "allow"
                      ? colors.accentForeground
                      : colors.foreground,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("allowPermission")}
              onPress={() => onRespond(req.id, { behavior: "allow" })}
              style={({ pressed }) => [
                {
                  minHeight: btnHeight,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: colors.accent,
                  opacity: pressed ? 0.85 : 1,
                },
                pointerCursorStyle,
              ]}
            >
              <Text
                style={{
                  fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
                  fontWeight: "600",
                  color: colors.accentForeground,
                }}
              >
                {t("allowPermission")}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("denyPermission")}
              onPress={() => onRespond(req.id, { behavior: "deny" })}
              style={({ pressed }) => [
                {
                  minHeight: btnHeight,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: colors.surface1,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
                pointerCursorStyle,
              ]}
            >
              <Text
                style={{
                  fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
                  fontWeight: "500",
                  color: colors.foreground,
                }}
              >
                {t("denyPermission")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

export function LiveTurnStatusRow({
  phase,
  startedAtMs,
  theme,
  appearance,
  t,
}: {
  phase: "starting" | "thinking" | "working" | null;
  startedAtMs: number | null;
  theme: PluginTheme;
  appearance: HostAppearanceSettings;
  t: TranslateFn;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!phase) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(interval);
  }, [phase, startedAtMs]);

  if (!phase) return null;
  const { colors } = theme;
  const elapsedSec =
    startedAtMs !== null ? Math.max(1, Math.floor((nowMs - startedAtMs) / 1000)) : 1;

  const label =
    phase === "starting"
      ? t("startingSession")
      : phase === "working"
        ? t("analyzingElapsed", { seconds: elapsedSec })
        : t("thinkingElapsed", { seconds: elapsedSec });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginTop: 2,
      }}
    >
      <Spinner size={13} color={colors.accent} label={label} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: Math.max(12, appearance.uiBaseFontSize - 1),
          color: colors.foregroundMuted,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
