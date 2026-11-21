import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import type { AgentUsage } from "@getpaseo/protocol/agent-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import type { HostAppearanceSettings } from "../shared/appearance";
import {
  buildContextRingSvg,
  formatContextUsageSummary,
  formatPaseoTokenCount,
  formatSessionCostUsd,
  formatUsageResetCountdown,
  resolveContextUsageRatio,
  resolveUsageWindowMetrics,
} from "../shared/composer-controls";
import {
  type UsageReportCardData,
  usageReportsRpc,
} from "../shared/contracts";
import type { useMessages } from "./messages";
import { Spinner } from "./spinner";
import { pointerCursorStyle, popoverScopeProps, watchPopoverDismiss } from "./web";

type TranslateFn = ReturnType<typeof useMessages>["t"];

export interface ContextWindowPopoverProps {
  hostId: string;
  effectiveProvider: string;
  activeSideAgentId: string | null;
  lastUsage: AgentUsage | null;
  modelMaxTokens: number | null;
  theme: PluginTheme;
  appearance: HostAppearanceSettings;
  panelWidth: number;
  discSize: number;
  ringSize: number;
  isTouch: boolean;
  locale: string;
  t: TranslateFn;
}

export function ContextWindowPopover({
  hostId,
  effectiveProvider,
  activeSideAgentId,
  lastUsage,
  modelMaxTokens,
  theme,
  appearance,
  panelWidth,
  discSize,
  ringSize,
  isTouch,
  locale,
  t,
}: ContextWindowPopoverProps) {
  const { colors } = theme;
  const scopeId = useId();
  const queryClient = useQueryClient();
  const callUsageReports = useRpc(usageReportsRpc);
  const { width: windowWidth } = useWindowDimensions();
  const useSheet = Platform.OS !== "web" || isTouch || windowWidth < 460;

  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open || useSheet) return;
    return watchPopoverDismiss(scopeId, () => setOpen(false));
  }, [open, useSheet, scopeId]);

  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [open]);

  const queryKey = useMemo(
    () => ["sidechat-usage-reports", hostId, effectiveProvider, activeSideAgentId ?? "draft"] as const,
    [hostId, effectiveProvider, activeSideAgentId],
  );

  // Pre-warm cache quietly and keep fresh when opened
  const usageQuery = useQuery({
    queryKey,
    enabled: Boolean(effectiveProvider),
    staleTime: 45_000,
    queryFn: () =>
      callUsageReports({
        provider: effectiveProvider,
        agentId: activeSideAgentId,
        forceRefresh: false,
      }),
  });

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await callUsageReports({
        provider: effectiveProvider,
        agentId: activeSideAgentId,
        forceRefresh: true,
      });
      queryClient.setQueryData(queryKey, fresh);
      setNowMs(Date.now());
    } catch {
      // Keep existing cached report on transient refresh error
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, callUsageReports, effectiveProvider, activeSideAgentId, queryClient, queryKey]);

  const usageMetrics = useMemo(
    () => resolveContextUsageRatio(lastUsage, modelMaxTokens),
    [lastUsage, modelMaxTokens],
  );

  const hasContextData =
    lastUsage !== null &&
    (usageMetrics.usedTokens > 0 ||
      (typeof lastUsage.totalCostUsd === "number" && lastUsage.totalCostUsd > 0));

  const ringProgressColor =
    usageMetrics.ratio >= 0.9
      ? colors.statusDanger
      : usageMetrics.ratio >= 0.7
        ? colors.statusWarning
        : colors.foregroundMuted;

  const contextRingSvg = useMemo(
    () =>
      buildContextRingSvg({
        ratio: hasContextData ? usageMetrics.ratio : 0,
        trackColor: colors.foregroundMuted,
        progressColor: ringProgressColor,
      }),
    [hasContextData, usageMetrics.ratio, colors.foregroundMuted, ringProgressColor],
  );

  const sessionCostLabel = formatSessionCostUsd(lastUsage?.totalCostUsd);
  const reports = usageQuery.data?.reports ?? [];
  const baseFont = appearance.uiBaseFontSize;
  const smFont = Math.max(11, baseFont - 1);
  const popoverWidth = Math.max(240, Math.min(300, panelWidth - 24));

  const renderReportCard = (card: UsageReportCardData) => (
    <View key={card.id} style={{ gap: 10 }}>
      {/* Provider Header: `[✳ Claude] [Pro ai]  ...  [↻]` */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        {card.iconSvg ? (
          <Icon icon={{ svg: card.iconSvg }} size={14} color={colors.foreground} />
        ) : (
          <Icon name="Cpu" size={14} color={colors.foreground} />
        )}
        <Text
          numberOfLines={1}
          style={{
            fontSize: baseFont,
            fontWeight: "500",
            color: colors.foreground,
          }}
        >
          {card.sourceLabel}
        </Text>
        {card.planLabel ? (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 1.5,
              borderRadius: 5,
              backgroundColor: colors.surface2,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: Math.max(10, smFont - 1),
                fontWeight: "500",
                color: colors.foregroundMuted,
              }}
            >
              {card.planLabel}
            </Text>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("usageRefresh")}
          disabled={refreshing}
          onPress={() => {
            void handleRefresh();
          }}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            {
              width: 24,
              height: 24,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
            },
            pointerCursorStyle,
          ]}
        >
          {refreshing ? (
            <Spinner size={12} color={colors.foregroundMuted} label={t("usageRefresh")} />
          ) : (
            <Icon name="RotateCw" size={13} color={colors.foregroundMuted} />
          )}
        </Pressable>
      </View>

      {/* Quota Windows (`Session`, `Weekly`, etc.) */}
      {card.status === "available" && card.windows.length > 0 ? (
        <View style={{ gap: 10 }}>
          {card.windows.map((win) => {
            const { barPercent, displayPercent, severity } = resolveUsageWindowMetrics(
              win,
              appearance.usageDisplayAs,
            );
            const barColor =
              severity === "danger"
                ? colors.statusDanger
                : severity === "warning"
                  ? colors.statusWarning
                  : colors.statusSuccess;
            const pctLabel =
              displayPercent !== null
                ? appearance.usageDisplayAs === "remaining"
                  ? t("usageLeft", { percentage: displayPercent })
                  : t("usageUsed", { percentage: displayPercent })
                : "—";
            const resetInfo = formatUsageResetCountdown(win.resetsAt, nowMs, locale);

            return (
              <View key={win.id} style={{ gap: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: smFont,
                      fontWeight: "500",
                      color: colors.foreground,
                    }}
                  >
                    {win.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: smFont,
                      color: colors.foreground,
                    }}
                  >
                    {pctLabel}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View
                  style={{
                    height: 5,
                    borderRadius: 999,
                    backgroundColor: colors.surface2,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${Math.max(0, Math.min(100, barPercent))}%`,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: barColor,
                    }}
                  />
                </View>

                {/* Reset Countdown (`resets in 2h 8m · 13:30`) */}
                {resetInfo ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: Math.max(11, smFont - 1),
                      color: colors.foregroundMuted,
                    }}
                  >
                    {`${t("usageResetsIn", { countdown: resetInfo.countdown })}${
                      resetInfo.exactTime ? ` · ${resetInfo.exactTime}` : ""
                    }`}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Detail Rows (`Extra usage` ... `Disabled`) */}
      {card.details.length > 0 ? (
        <View style={{ gap: 4 }}>
          {card.details.map((detail) => (
            <View
              key={detail.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: smFont,
                  color: colors.foregroundMuted,
                }}
              >
                {detail.label}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: smFont,
                  color: colors.foreground,
                }}
              >
                {detail.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Error / Unavailable Notice */}
      {card.status !== "available" && card.errorMessage ? (
        <Text
          style={{
            fontSize: smFont,
            color: card.status === "error" ? colors.statusDanger : colors.foregroundMuted,
          }}
        >
          {card.errorMessage}
        </Text>
      ) : null}

      {/* Account Email Footer (`oli.where@anydream.dev`) */}
      {card.accountLabel ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: smFont,
            color: colors.foregroundMuted,
          }}
        >
          {card.accountLabel}
        </Text>
      ) : null}
    </View>
  );

  const renderDetailsBody = (showTitle: boolean) => (
    <View style={{ gap: 12 }}>
      {/* Context Window Section */}
      <View style={{ gap: 3 }}>
        {showTitle ? (
          <Text
            style={{
              fontSize: baseFont,
              color: colors.foreground,
            }}
          >
            {t("contextWindowTitle")}
          </Text>
        ) : null}

        {hasContextData ? (
          <>
            <Text
              style={{
                fontSize: baseFont,
                fontWeight: "500",
                color: colors.foreground,
              }}
            >
              {t("contextWindowUsed", {
                percentage: Math.round(usageMetrics.ratio * 100),
              })}
            </Text>
            <Text
              style={{
                fontSize: smFont,
                color: colors.foregroundMuted,
              }}
            >
              {t("contextWindowTokens", {
                used: formatPaseoTokenCount(usageMetrics.usedTokens),
                max: formatPaseoTokenCount(usageMetrics.maxTokens),
              })}
            </Text>
            {sessionCostLabel ? (
              <Text
                style={{
                  fontSize: smFont,
                  color: colors.foregroundMuted,
                }}
              >
                {t("contextWindowSessionCost", { cost: sessionCostLabel })}
              </Text>
            ) : null}
          </>
        ) : (
          <Text
            style={{
              fontSize: smFont,
              color: colors.foregroundMuted,
            }}
          >
            {t("contextWindowNoData")}
          </Text>
        )}
      </View>

      {/* Provider Plan Usage Section */}
      {usageQuery.isLoading ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <Text style={{ fontSize: smFont, color: colors.foregroundMuted }}>
            {t("usageLoading")}
          </Text>
        </>
      ) : reports.length > 0 ? (
        reports.map((card) => (
          <View key={card.id} style={{ gap: 12 }}>
            <View style={{ height: 1, backgroundColor: colors.border }} />
            {renderReportCard(card)}
          </View>
        ))
      ) : null}
    </View>
  );

  return (
    <View {...popoverScopeProps(scopeId)} style={{ position: "relative", zIndex: open ? 45 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={formatContextUsageSummary(lastUsage, modelMaxTokens)}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          {
            width: discSize,
            height: discSize,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: open || pressed || hovered ? colors.surface2 : "transparent",
          },
          pointerCursorStyle,
        ]}
      >
        <Icon icon={{ svg: contextRingSvg }} size={ringSize} color={ringProgressColor} />
      </Pressable>

      {open && !useSheet ? (
        <View
          style={{
            position: "absolute",
            bottom: "100%",
            right: 0,
            marginBottom: 8,
            width: popoverWidth,
            maxHeight: 380,
            backgroundColor: colors.surface1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            shadowColor: "#000",
            shadowOpacity: 0.24,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            overflow: "hidden",
            zIndex: 60,
          }}
        >
          <ScrollView
            style={{ maxHeight: 380 }}
            contentContainerStyle={{ padding: 14 }}
          >
            {renderDetailsBody(true)}
          </ScrollView>
        </View>
      ) : null}

      {useSheet ? (
        <Modal title={t("contextWindowTitle")} open={open} onOpenChange={setOpen}>
          <Modal.Content scrollable contentContainerStyle={{ padding: 16 }}>
            {renderDetailsBody(false)}
          </Modal.Content>
        </Modal>
      ) : null}
    </View>
  );
}
