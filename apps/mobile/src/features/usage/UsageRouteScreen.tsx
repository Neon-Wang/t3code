import { Button } from "../../components/ui/Button";
import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../i18n/useI18n";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { ChatGptUsageSummary } from "./ChatGptUsageSummary";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { EnvironmentId, USAGE_CONTRACT_VERSION, type UsageProviderKind } from "@t3tools/contracts";
import { type RouteProp, useIsFocused, useRoute } from "@react-navigation/native";
import { cursorKeychainAccessEnvironments } from "@t3tools/client-runtime/state/usage";
import {
  updatingProvidersLabel,
  usageEnvironmentProgress,
  usageProgress,
} from "@t3tools/client-runtime/state/usage-progress";
import {
  isCompatibleUsageContractVersion,
  isModelCostUnknown,
  type DailyTotals,
  type MergedUsage,
} from "@t3tools/shared/usageMerge";
import {
  enumerateDays,
  enumerateHourStarts,
  formatCount,
  formatDayShort,
  formatHourShort,
  formatPercent,
  formatTokens,
  formatUsageContractMismatch,
  formatUsd,
  makeWindow,
  usageSourceMessages,
} from "@t3tools/shared/usageFormat";
import { useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, RefreshControl, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useReduceMotionEnabled } from "../../lib/appState";
import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { cn } from "../../lib/cn";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { useUsage, type EnvironmentUsageStatus } from "../../state/usage";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "../settings/components/SettingsSection";
import { UsageDailyChart } from "./UsageDailyChart";
import { toggleUsageEnvironment } from "./usageEnvironmentSelection";
import { useRefreshLimits } from "./UsageLimitsSection";
import { UsageLimitsSection } from "./UsageLimitsPooled";
import { Menu } from "../../components/ui/Menu";
import { SymbolView } from "../../components/ui/AppSymbol";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { withNativeGlassHeaderItem } from "../layout/native-glass-header-items";
import type { UsageChartMetric } from "./usageChartData";
import { PROVIDER_LABEL, useProviderColors, useUsageMixColors } from "./usageProviders";

type UsageView = UsageChartMetric | "limits";

const CHART_HEIGHT = 180;
const WIDE_CHART_HEIGHT = 260;
// Below this the page keeps the phone's single column.
const WIDE_WIDTH = 600;
const MAX_CONTENT_WIDTH = 1080;
const providerLabel = (provider: UsageProviderKind) => PROVIDER_LABEL[provider];

export function UsageRouteScreen(props: { readonly workspace?: boolean }) {
  const route = useRoute<RouteProp<{ Usage: { tab?: string } | undefined }, "Usage">>();
  return <UsageScreen workspace={props.workspace} tabParam={route.params?.tab} />;
}

function UsageScreen(props: {
  readonly workspace?: boolean;
  readonly tabParam: string | undefined;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const VIEW_OPTIONS = [
    { value: "cost", label: t("mobile.usageRouteScreen.cost") },
    { value: "tokens", label: t("mobile.usageRouteScreen.tokens") },
    { value: "limits", label: t("mobile.usageRouteScreen.limits") },
  ] as const satisfies readonly { value: UsageView; label: string }[];
  const WINDOW_OPTIONS = [
    {
      value: 1,
      label: t("mobile.usageRouteScreen.24h"),
      accessibilityLabel: t("mobile.usageRouteScreen.past24Hours"),
    },
    {
      value: 7,
      label: t("mobile.usageRouteScreen.7d"),
      accessibilityLabel: t("mobile.usageRouteScreen.past7Days"),
    },
    {
      value: 30,
      label: t("mobile.usageRouteScreen.30d"),
      accessibilityLabel: t("mobile.usageRouteScreen.past30Days"),
    },
    {
      value: 90,
      label: t("mobile.usageRouteScreen.90d"),
      accessibilityLabel: t("mobile.usageRouteScreen.past90Days"),
    },
  ] as const;
  const [selection, setSelection] = useState(() => ({
    params: props.tabParam,
    view: (props.tabParam === "usage" ? "cost" : "limits") as UsageView,
  }));
  if (selection.params !== props.tabParam) {
    setSelection({
      params: props.tabParam,
      view: props.tabParam === "usage" ? "cost" : "limits",
    });
  }
  const { view } = selection;
  const setView = (view: UsageView) => setSelection({ params: props.tabParam, view });
  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_WIDTH;
  const [windowSelection, setWindowSelection] = useState(() => ({
    days: 30,
    window: makeWindow(30),
  }));
  const { days: windowDays, window } = windowSelection;
  const isPast24Hours = windowDays === 1;
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] =
    useState<ReadonlySet<EnvironmentId> | null>(null);
  const { merged, environments, selectedEnvironments, isPending, refresh } = useUsage(
    window,
    selectedEnvironmentIds,
  );
  const isFocused = useIsFocused();
  const limits = useRefreshLimits(selectedEnvironmentIds, isFocused && view === "limits");
  const cursorAccessEnvironments = cursorKeychainAccessEnvironments(selectedEnvironments);
  const refreshAfterCursorEnable = () => {
    void refresh();
    void limits.refreshAfterEnable();
  };
  const sourceMessages = usageSourceMessages(
    selectedEnvironments.flatMap((environment) => environment.summary?.sources ?? []),
  );
  const canReadDiagnostics = selectedEnvironments.some(
    (environment) => environment.canReadDiagnostics,
  );

  const days = enumerateDays(window.sinceDay, window.untilDay);
  const chartDays =
    isPast24Hours && window.sinceTime !== undefined && window.untilTime !== undefined
      ? enumerateHourStarts(window.sinceTime, window.untilTime)
      : days;
  const chartTotals: readonly DailyTotals[] = isPast24Hours
    ? merged.hourly.map((hour) => ({
        day: hour.hourStart,
        costUsd: hour.costUsd,
        totalTokens: hour.totalTokens,
        byProvider: hour.byProvider,
      }))
    : merged.daily;

  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const refreshingRef = useRef(false);
  const showingLimits = view === "limits";
  const metric: UsageChartMetric = view === "tokens" ? "tokens" : "cost";
  const progress = usageProgress(selectedEnvironments, {
    refreshing: refreshingUsage,
    providerLabel,
  });
  const selectWindow = (days: number) => {
    setWindowSelection({
      days,
      window: makeWindow(days, undefined, days === 1 ? "hour" : "day"),
    });
  };
  const refreshWindow = () => {
    if (refreshingRef.current) return;
    const nextWindow = makeWindow(windowDays, undefined, isPast24Hours ? "hour" : "day");
    if (
      nextWindow.sinceDay !== window.sinceDay ||
      nextWindow.untilDay !== window.untilDay ||
      nextWindow.sinceTime !== window.sinceTime ||
      nextWindow.untilTime !== window.untilTime
    ) {
      setWindowSelection({ days: windowDays, window: nextWindow });
    }
    refreshingRef.current = true;
    setRefreshingUsage(true);
    void refresh(nextWindow).finally(() => {
      refreshingRef.current = false;
      setRefreshingUsage(false);
    });
  };

  const chart = {
    merged,
    days: chartDays,
    daily: chartTotals,
    metric,
    sinceDay: window.sinceDay,
    untilDay: window.untilDay,
    isPast24Hours,
    timeZone: window.timeZone,
  };
  const providers = (
    <ProviderSection
      merged={merged}
      metric={metric}
      cursorAccessEnvironments={cursorAccessEnvironments}
      showCursorEnvironment={selectedEnvironments.length > 1}
      onCursorEnabled={refreshAfterCursorEnable}
      compact={wide}
    />
  );

  const showEnvironmentFilter = environments.length > 0 || selectedEnvironmentIds !== null;
  const filterIcon =
    selectedEnvironmentIds === null
      ? "line.3.horizontal.decrease"
      : "line.3.horizontal.decrease.circle.fill";
  const environmentActions = [
    {
      id: "all",
      title: t("mobile.usageRouteScreen.allEnvironments"),
      subtitle: undefined,
      state: selectedEnvironmentIds === null ? ("on" as const) : ("off" as const),
    },
    ...environments.map((environment) => ({
      id: environment.environmentId,
      title: environment.label,
      subtitle: usageEnvironmentStatus(environment, refreshingUsage),
      state:
        selectedEnvironmentIds === null || selectedEnvironmentIds.has(environment.environmentId)
          ? ("on" as const)
          : ("off" as const),
    })),
  ];
  const selectEnvironment = (value: string) => {
    if (value === "all") {
      setSelectedEnvironmentIds(null);
      return;
    }
    const id = EnvironmentId.make(value);
    setSelectedEnvironmentIds((selected) => toggleUsageEnvironment(selected, environments, id));
  };
  const environmentFilter = showEnvironmentFilter ? (
    <Menu
      accessible
      accessibilityRole="button"
      accessibilityLabel={t("mobile.usageRouteScreen.filterUsageEnvironments")}
      title={t("mobile.usageRouteScreen.environments")}
      actions={environmentActions}
      onPressAction={({ nativeEvent }) => selectEnvironment(nativeEvent.event)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("mobile.usageRouteScreen.filterUsageEnvironments")}
        className={cn(
          "items-center justify-center rounded-full",
          Platform.OS === "ios" ? "size-[28px]" : "size-[44px]",
        )}
      >
        <SymbolView name={filterIcon} size={22} tintColorClassName="accent-icon" />
      </Pressable>
    </Menu>
  ) : null;

  return (
    <SettingsScreen
      title={t("mobile.usageRouteScreen.usage")}
      trailing={environmentFilter}
      workspaceRoot={props.workspace}
    >
      {Platform.OS === "ios" ? (
        <NativeStackScreenOptions
          optionsVersion={JSON.stringify({ showEnvironmentFilter, filterIcon, environmentActions })}
          options={{
            // A native menu item, unlike a custom view, moves into the Duo's vertical bar.
            unstable_headerRightItems: () =>
              showEnvironmentFilter
                ? [
                    withNativeGlassHeaderItem({
                      accessibilityLabel: t("mobile.usageRouteScreen.filterUsageEnvironments"),
                      icon: { name: filterIcon, type: "sfSymbol" },
                      label: "",
                      type: "menu",
                      menu: {
                        title: t("mobile.usageRouteScreen.environments"),
                        items: environmentActions.map((action) => ({
                          type: "action" as const,
                          label: action.title,
                          description: action.subtitle,
                          state: action.state === "on" ? ("on" as const) : undefined,
                          onPress: () => selectEnvironment(action.id),
                        })),
                      },
                    }),
                  ]
                : [],
          }}
        />
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        refreshControl={
          showingLimits || canReadDiagnostics ? (
            <RefreshControl
              refreshing={showingLimits ? limits.refreshing : refreshingUsage}
              onRefresh={showingLimits ? () => void limits.refresh() : refreshWindow}
            />
          ) : undefined
        }
      >
        <View className="w-full gap-6 self-center" style={{ maxWidth: MAX_CONTENT_WIDTH }}>
          {wide ? (
            <View className="flex-row items-center gap-3">
              {showingLimits ? (
                <View className="flex-1" />
              ) : (
                <SegmentedControl
                  options={WINDOW_OPTIONS}
                  selected={windowDays}
                  onSelect={selectWindow}
                  size="compact"
                  className="flex-1"
                />
              )}
              <SegmentedControl
                options={VIEW_OPTIONS}
                selected={view}
                onSelect={setView}
                size="compact"
                role="tab"
                className="w-60"
              />
            </View>
          ) : (
            <SegmentedControl
              options={VIEW_OPTIONS}
              selected={view}
              onSelect={setView}
              role="tab"
            />
          )}
          <Animated.View
            key={showingLimits ? "limits" : "usage"}
            entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
            className="gap-6"
          >
            {showingLimits ? (
              <UsageLimitsSection
                now={limits.now}
                failedLabels={limits.failedLabels}
                selectedEnvironmentIds={selectedEnvironmentIds}
                wide={wide}
                cursorPrompt={
                  cursorAccessEnvironments.length > 0 ? (
                    <CursorEnableLimits
                      environments={cursorAccessEnvironments}
                      onEnabled={refreshAfterCursorEnable}
                    />
                  ) : null
                }
              />
            ) : (
              <>
                {wide ? null : (
                  <SegmentedControl
                    options={WINDOW_OPTIONS}
                    selected={windowDays}
                    onSelect={selectWindow}
                    size="compact"
                  />
                )}
                <ChatGptUsageSummary selectedEnvironmentIds={selectedEnvironmentIds} />
                {merged.duplicateSources.length > 0 ? (
                  <Text className="text-sm text-foreground-muted">
                    {t(
                      "mobile.usageRouteScreen.countedOnceAcrossEnvironmentsSharingATranscriptDirectory",
                    )}{" "}
                    {merged.duplicateSources.join(", ")}
                  </Text>
                ) : null}
                {isPending ? (
                  <Text className="py-16 text-center text-base text-foreground-muted">
                    {t("mobile.usageRouteScreen.scanningProviderTranscripts")}
                  </Text>
                ) : selectedEnvironments.length === 0 ? (
                  <Text className="py-16 text-center text-base text-foreground-muted">
                    {environments.length === 0
                      ? t("usage.connectForUsage")
                      : t("usage.selectForUsage")}
                  </Text>
                ) : !canReadDiagnostics ? (
                  <View className="gap-2 py-16">
                    {selectedEnvironments.map((environment) => (
                      <Text
                        key={environment.environmentId}
                        className="text-center text-base text-foreground-muted"
                      >
                        {selectedEnvironments.length > 1 ? `${environment.label}: ` : null}
                        {environment.error}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <>
                    {sourceMessages.map((message) => (
                      <Text key={message} className="text-sm text-foreground-muted">
                        {message}
                      </Text>
                    ))}
                    <UsageUpdating dimmed={progress.dimmed} label={progress.label}>
                      {wide ? (
                        <View className="flex-row gap-6">
                          <View className="w-72 gap-6">
                            <View className="rounded-[24px] border-continuous bg-grouped-card p-4">
                              <UsageSummary merged={merged} metric={metric} />
                            </View>
                            {providers}
                          </View>
                          <View className="min-w-0 flex-1">
                            <ChartCard
                              {...chart}
                              height={WIDE_CHART_HEIGHT}
                              fill
                              title={t(
                                isPast24Hours
                                  ? metric === "cost"
                                    ? "mobile.usageRouteScreen.hourlyCost"
                                    : "mobile.usageRouteScreen.hourlyProcessedTokens"
                                  : metric === "cost"
                                    ? "mobile.usageRouteScreen.dailyCost"
                                    : "mobile.usageRouteScreen.dailyProcessedTokens",
                              )}
                            />
                          </View>
                        </View>
                      ) : (
                        <>
                          <ChartCard {...chart} height={CHART_HEIGHT} />
                          {providers}
                        </>
                      )}
                      <TotalsSection
                        merged={merged}
                        isPast24Hours={isPast24Hours}
                        columns={width >= 900 ? 6 : wide ? 3 : 2}
                      />
                      <CostSection merged={merged} wide={wide} />
                      <ModelsSection merged={merged} metric={metric} columns={wide ? 2 : 1} />
                    </UsageUpdating>
                  </>
                )}
              </>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </SettingsScreen>
  );
}

function UsageUpdating({
  dimmed,
  label,
  children,
}: {
  readonly dimmed: boolean;
  readonly label: string | null;
  readonly children: ReactNode;
}) {
  const reduceMotion = useReduceMotionEnabled();
  // The delay keeps a quick refresh from flashing the content.
  const dimStyle = {
    opacity: dimmed ? 0.5 : 1,
    transitionProperty: "opacity",
    transitionDuration: reduceMotion ? 0 : 150,
    transitionDelay: dimmed ? 150 : 0,
  } as const;

  return (
    <View>
      <Animated.View style={dimStyle} className="gap-6" accessibilityState={{ busy: dimmed }}>
        {children}
      </Animated.View>
      {label !== null ? (
        <Animated.View
          entering={FadeIn.delay(150).duration(150).reduceMotion(ReduceMotion.System)}
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          className="absolute right-4 top-4 h-5 max-w-[55%] flex-row items-center gap-1.5"
        >
          <AppActivityIndicator size="small" colorClassName="accent-adaptive-sky-600-400" />
          <Text className="shrink text-sm text-adaptive-sky-600-400" numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function CursorEnableAction({
  environmentId,
  label,
  onEnabled,
  buttonText,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly onEnabled: () => void;
  readonly buttonText?: string;
}) {
  const { t } = useI18n();
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "enable Cursor account usage",
  });
  const [pending, setPending] = useState(false);
  const enable = async () => {
    setPending(true);
    const result = await updateSettings({
      environmentId,
      input: { patch: { cursorKeychainUsageEnabled: true } },
    }).finally(() => setPending(false));
    if (result._tag === "Success") onEnabled();
  };
  return (
    <Button
      label={buttonText ?? t("settings.connections.enable")}
      tone="primary"
      accessibilityLabel={t("mobile.usageRouteScreen.enableCursorUsageFrom", { label })}
      accessibilityHint={t("usage.requiresAccessToYourCursorLoginInMacosKeychain")}
      disabled={pending}
      onPress={() => void enable()}
      loading={pending}
    />
  );
}

function CursorEnableRow({
  environmentId,
  label,
  showEnvironment,
  bordered,
  onEnabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly showEnvironment: boolean;
  readonly bordered: boolean;
  readonly onEnabled: () => void;
}) {
  const colors = useProviderColors();
  return (
    <View
      className={cn(
        "flex-row items-center justify-between gap-3 p-4",
        bordered && "border-t border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <View className="size-2.5 rounded-full" style={{ backgroundColor: colors.cursor }} />
        <Text className="shrink text-lg text-foreground">
          Cursor{showEnvironment ? ` · ${label}` : ""}
        </Text>
      </View>
      <CursorEnableAction environmentId={environmentId} label={label} onEnabled={onEnabled} />
    </View>
  );
}

function CursorEnableLimits({
  environments,
  onEnabled,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly onEnabled: () => void;
}) {
  const { t } = useI18n();
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 px-1">
        <ProviderIcon provider="cursor" size={18} />
        <Text className="text-base font-t3-medium text-foreground">Cursor</Text>
      </View>
      <View className="items-start gap-3 rounded-[24px] border-continuous bg-grouped-card p-4">
        <Text className="text-xs text-foreground-muted">
          {t("usage.requiresAccessToYourCursorLoginInMacosKeychain")}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {environments.map((environment) => (
            <CursorEnableAction
              key={environment.environmentId}
              environmentId={environment.environmentId}
              label={environment.label}
              buttonText={
                environments.length > 1
                  ? t("mobile.usageRouteScreen.enableOnLabel", { label: environment.label })
                  : t("settings.connections.enable")
              }
              onEnabled={onEnabled}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function ChartCard(props: {
  readonly merged: MergedUsage;
  readonly days: readonly string[];
  readonly daily: readonly DailyTotals[];
  readonly metric: UsageChartMetric;
  readonly sinceDay: string;
  readonly untilDay: string;
  readonly isPast24Hours: boolean;
  readonly timeZone: string;
  readonly height: number;
  /** Replaces the summary when it sits beside the chart. */
  readonly title?: string;
  /** Grows the chart past `height` to match a taller neighbouring column. */
  readonly fill?: boolean;
}) {
  const { t } = useI18n();
  const { merged, metric } = props;
  const colors = useProviderColors();
  const hasActivity = props.daily.some((period) => period.totalTokens > 0);
  const [fillHeight, setFillHeight] = useState(0);
  const height = props.fill ? Math.max(fillHeight, props.height) : props.height;
  const chart = hasActivity ? (
    <UsageDailyChart days={props.days} daily={props.daily} metric={metric} height={height} />
  ) : (
    <View style={{ height }} className="items-center justify-center">
      <Text className="text-base text-foreground-muted">
        {t("mobile.usageRouteScreen.noActivityInThisWindow")}
      </Text>
    </View>
  );

  return (
    <View
      className={`gap-4 rounded-[24px] border-continuous bg-grouped-card p-4${props.fill ? " flex-1" : ""}`}
    >
      {props.title ? (
        <Text className="text-sm font-t3-medium text-foreground">{props.title}</Text>
      ) : (
        <UsageSummary merged={merged} metric={metric} />
      )}

      {props.fill ? (
        // Absolute so the measured slot can shrink again when the neighbour gets shorter.
        <View
          className="flex-1"
          style={{ minHeight: props.height }}
          onLayout={(event) => setFillHeight(event.nativeEvent.layout.height)}
        >
          <View className="absolute inset-0">{chart}</View>
        </View>
      ) : (
        chart
      )}

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-foreground-tertiary">
            {props.isPast24Hours
              ? formatHourShort(props.days[0] ?? "", props.timeZone)
              : formatDayShort(props.sinceDay)}
          </Text>
          <Text className="text-xs text-foreground-tertiary">
            {props.isPast24Hours
              ? formatHourShort(props.days[props.days.length - 1] ?? "", props.timeZone)
              : formatDayShort(props.untilDay)}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          {merged.providers.map((provider) => (
            <View key={provider.provider} className="flex-row items-center gap-1.5">
              <View
                className="size-2 rounded-full"
                style={{ backgroundColor: colors[provider.provider] }}
              />
              <Text className="text-xs text-foreground-muted">
                {PROVIDER_LABEL[provider.provider]}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function UsageSummary(props: { readonly merged: MergedUsage; readonly metric: UsageChartMetric }) {
  const { t } = useI18n();
  const { merged, metric } = props;
  return (
    <View className="gap-0.5">
      <Text className="text-sm text-foreground-muted">
        {metric === "cost"
          ? t("mobile.usageRouteScreen.rawTokenCost")
          : t("mobile.usageRouteScreen.processedTokens")}
      </Text>
      <Text className="text-4xl font-t3-bold tabular-nums text-foreground">
        {metric === "cost" ? `${formatUsd(merged.costUsd)}*` : formatTokens(merged.totalTokens)}
      </Text>
      <Text className="text-sm text-foreground-muted">
        {metric === "cost"
          ? t("mobile.usageRouteScreen.ifBilledAtFullAPIRate")
          : t("mobile.usageRouteScreen.acrossCountSessions", {
              count: formatCount(merged.sessions),
            })}
      </Text>
    </View>
  );
}

function ProviderSection(props: {
  readonly merged: MergedUsage;
  readonly metric: UsageChartMetric;
  readonly cursorAccessEnvironments: readonly EnvironmentUsageStatus[];
  readonly showCursorEnvironment: boolean;
  readonly onCursorEnabled: () => void;
  /** Drops the share bar so the list fits beside the chart. */
  readonly compact: boolean;
}) {
  const { t } = useI18n();
  const { merged, metric } = props;
  const colors = useProviderColors();
  if (merged.providers.length === 0 && props.cursorAccessEnvironments.length === 0) return null;

  // Hermes lacks toSorted.
  const ordered = [...merged.providers].sort((a, b) =>
    metric === "cost" ? b.costUsd - a.costUsd : b.totalTokens - a.totalTokens,
  );
  const rows: Array<
    | { readonly kind: "usage"; readonly provider: (typeof ordered)[number] }
    | { readonly kind: "enable"; readonly environment: EnvironmentUsageStatus }
  > = ordered.map((provider) => ({ kind: "usage", provider }));
  const cursorInsertAt =
    Math.max(
      ordered.findIndex((provider) => provider.provider === "codex"),
      ordered.findIndex((provider) => provider.provider === "claude"),
    ) + 1;
  rows.splice(
    cursorInsertAt,
    0,
    ...props.cursorAccessEnvironments.map((environment) => ({
      kind: "enable" as const,
      environment,
    })),
  );

  return (
    <SettingsSection title={t("mobile.usageRouteScreen.providers")}>
      {rows.map((row, index) => {
        if (row.kind === "enable") {
          return (
            <CursorEnableRow
              key={`enable:${row.environment.environmentId}`}
              environmentId={row.environment.environmentId}
              label={row.environment.label}
              showEnvironment={props.showCursorEnvironment}
              bordered={index > 0}
              onEnabled={props.onCursorEnabled}
            />
          );
        }
        const provider = row.provider;
        const share = metric === "cost" ? provider.costShare : provider.tokenShare;
        return (
          <View
            key={provider.provider}
            className={cn(
              props.compact ? "gap-0.5 px-4 py-3" : "gap-2 p-4",
              index > 0 && "border-t border-border-subtle",
            )}
          >
            <View className="flex-row items-baseline justify-between gap-3">
              <View className="flex-row items-center gap-2">
                <View
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: colors[provider.provider] }}
                />
                <Text
                  className={
                    props.compact ? "text-base text-foreground" : "text-lg text-foreground"
                  }
                >
                  {PROVIDER_LABEL[provider.provider]}
                </Text>
              </View>
              <Text
                className={
                  props.compact
                    ? "text-base tabular-nums text-foreground"
                    : "text-lg tabular-nums text-foreground"
                }
              >
                {metric === "cost"
                  ? formatUsd(provider.costUsd)
                  : formatTokens(provider.totalTokens)}
              </Text>
            </View>
            {props.compact ? null : (
              <View className="h-1 flex-row overflow-hidden rounded-full bg-subtle">
                <View
                  className="h-full rounded-full"
                  style={{ flex: share, backgroundColor: colors[provider.provider] }}
                />
                <View style={{ flex: 1 - share }} />
              </View>
            )}
            <Text className="text-sm text-foreground-muted">
              {metric === "cost"
                ? t("usage.costShare", {
                    share: formatPercent(share),
                    tokens: formatTokens(provider.totalTokens),
                  })
                : t("usage.tokenShare", {
                    share: formatPercent(share),
                    cost: formatUsd(provider.costUsd),
                  })}
            </Text>
          </View>
        );
      })}
    </SettingsSection>
  );
}

function TotalsSection(props: {
  readonly merged: MergedUsage;
  readonly isPast24Hours: boolean;
  readonly columns: number;
}) {
  const { t } = useI18n();
  const { merged } = props;
  const activePeriods = (props.isPast24Hours ? merged.hourly : merged.daily).filter(
    (period) => period.totalTokens > 0,
  ).length;
  const periodAverage = activePeriods === 0 ? 0 : merged.totalTokens / activePeriods;
  const observedInput = merged.uncachedInputTokens + merged.cachedInputTokens;
  const cachedShare = observedInput === 0 ? 0 : merged.cachedInputTokens / observedInput;

  return (
    <SettingsSection title={t("mobile.usageRouteScreen.totals")}>
      <View className="flex-row flex-wrap">
        <MetricCell
          columns={props.columns}
          label={t("mobile.usageRouteScreen.processedTokens")}
          value={formatTokens(merged.totalTokens)}
          detail={t(
            props.isPast24Hours
              ? "mobile.usageRouteScreen.valuePerActiveHour"
              : "mobile.usageRouteScreen.valuePerActiveDay",
            { value: formatTokens(periodAverage) },
          )}
        />
        <MetricCell
          columns={props.columns}
          label={t("mobile.usageRouteScreen.cacheSavings")}
          value={formatUsd(merged.costQuality.cacheSavingsUsd)}
          detail={
            merged.costUsd > 0
              ? t("mobile.usageRouteScreen.ratioXTheRawCost", {
                  ratio: (merged.costQuality.cacheSavingsUsd / merged.costUsd).toFixed(1),
                })
              : t("mobile.usageRouteScreen.vsFullInputRates")
          }
        />
        <MetricCell
          columns={props.columns}
          label={t("mobile.usageRouteScreen.cachedInput")}
          value={formatTokens(merged.cachedInputTokens)}
          detail={t("mobile.usageRouteScreen.shareOfObservedInput", {
            share: formatPercent(cachedShare),
          })}
        />
        <MetricCell
          columns={props.columns}
          label={t("mobile.usageRouteScreen.uncachedInput")}
          value={formatTokens(merged.uncachedInputTokens)}
          detail={t("mobile.usageRouteScreen.valueCacheWrites", {
            value: formatTokens(merged.cacheCreationTokens),
          })}
        />
        <MetricCell
          columns={props.columns}
          label={t("mobile.usageRouteScreen.output")}
          value={formatTokens(merged.outputTokens)}
          detail={t("mobile.usageRouteScreen.inclValueReasoning", {
            value: formatTokens(merged.reasoningTokens),
          })}
        />
        <MetricCell
          columns={props.columns}
          label={t("mobile.usageRouteScreen.unpriced")}
          value={formatPercent(merged.costQuality.unpricedShare)}
          detail={t("mobile.usageRouteScreen.ofRecordsExcludedFromCost")}
        />
      </View>
    </SettingsSection>
  );
}

function CostSection(props: { readonly merged: MergedUsage; readonly wide: boolean }) {
  const { t } = useI18n();
  const { categoryCost, speedCost } = props.merged;
  const colors = useUsageMixColors();
  const byType = [
    { label: t("mobile.usageRouteScreen.input"), value: categoryCost.input, color: colors.input },
    {
      label: t("mobile.usageRouteScreen.cacheRead"),
      value: categoryCost.cacheRead,
      color: colors.cacheRead,
    },
    {
      label: t("mobile.usageRouteScreen.cacheWrite"),
      value: categoryCost.cacheWrite,
      color: colors.cacheWrite,
    },
    {
      label: t("mobile.usageRouteScreen.output"),
      value: categoryCost.output,
      color: colors.output,
    },
    // Reported cost with no rates to split it, or from older servers. Below a
    // cent it is rounding, not usage.
    {
      label: t("mobile.usageRouteScreen.other"),
      value: categoryCost.unsplit >= 0.005 ? categoryCost.unsplit : 0,
      color: colors.other,
    },
  ];
  const bySpeed = [
    {
      label: t("mobile.usageRouteScreen.standard"),
      value: speedCost.standard,
      color: colors.standard,
    },
    { label: t("mobile.usageRouteScreen.fast"), value: speedCost.fast, color: colors.fast },
    {
      label: t("mobile.usageRouteScreen.ultrafast"),
      value: speedCost.ultrafast,
      color: colors.ultrafast,
    },
  ];
  if (props.merged.costUsd <= 0) return null;

  return (
    <SettingsSection title={t("mobile.usageRouteScreen.cost")}>
      <View className={props.wide ? "flex-row" : undefined}>
        <View className={props.wide ? "min-w-0 flex-1" : undefined}>
          <ShareBar label={t("mobile.usageRouteScreen.byType")} segments={byType} />
        </View>
        {speedCost.fast + speedCost.ultrafast > 0 ? (
          <View
            className={
              props.wide
                ? "min-w-0 flex-1 border-l border-border-subtle"
                : "border-t border-border-subtle"
            }
          >
            <ShareBar
              label={t("mobile.usageRouteScreen.bySpeed")}
              segments={bySpeed}
              aside={t("mobile.usageRouteScreen.valuePremium", {
                value: formatUsd(speedCost.premium),
              })}
            />
          </View>
        ) : null}
      </View>
    </SettingsSection>
  );
}

function ShareBar(props: {
  readonly label: string;
  readonly segments: readonly { label: string; value: number; color: string }[];
  readonly aside?: string;
}) {
  const visible = props.segments.filter((segment) => segment.value > 0);
  if (visible.length === 0) return null;

  return (
    <View className="gap-3 p-4">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="text-sm text-foreground-muted">{props.label}</Text>
        {props.aside ? (
          <Text className="text-sm tabular-nums text-foreground-muted">{props.aside}</Text>
        ) : null}
      </View>
      <View className="h-2 flex-row gap-0.5">
        {visible.map((segment) => (
          <View
            key={segment.label}
            className="h-full rounded-sm"
            style={{ flex: segment.value, backgroundColor: segment.color }}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((segment) => (
          <View key={segment.label} className="flex-row items-center gap-1.5">
            <View className="size-2 rounded-sm" style={{ backgroundColor: segment.color }} />
            <Text className="text-sm text-foreground-muted">{segment.label}</Text>
            <Text className="text-sm tabular-nums text-foreground">{formatUsd(segment.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MetricCell(props: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly columns: number;
}) {
  return (
    <View className="gap-0.5 p-4" style={{ width: `${100 / props.columns}%` }}>
      <Text className="text-sm text-foreground-muted">{props.label}</Text>
      <Text className="text-xl font-t3-medium tabular-nums text-foreground">{props.value}</Text>
      <Text className="text-xs text-foreground-tertiary">{props.detail}</Text>
    </View>
  );
}

function ModelsSection(props: {
  readonly merged: MergedUsage;
  readonly metric: UsageChartMetric;
  readonly columns: 1 | 2;
}) {
  const { t } = useI18n();
  const { merged, metric } = props;
  const colors = useProviderColors();
  if (merged.models.length === 0) return null;

  // Hermes lacks toSorted.
  const ordered = [...merged.models].sort((a, b) =>
    metric === "cost"
      ? b.costUsd - a.costUsd || b.totalTokens - a.totalTokens
      : b.totalTokens - a.totalTokens || b.costUsd - a.costUsd,
  );

  return (
    <SettingsSection title={t("mobile.usageRouteScreen.byModel")}>
      <View className="flex-row flex-wrap">
        {ordered.map((model, index) => (
          <View
            key={`${model.provider}:${model.model}`}
            className={cn(
              "flex-row items-center gap-3 p-4",
              index >= props.columns && "border-t border-border-subtle",
              index % props.columns === 1 && "border-l border-border-subtle",
            )}
            style={{ width: `${100 / props.columns}%` }}
          >
            <View
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[model.provider] }}
            />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-base text-foreground" numberOfLines={1}>
                {model.model}
              </Text>
              <Text className="text-sm text-foreground-muted">
                {metric === "tokens"
                  ? t("usage.tokenShare", {
                      share: formatPercent(model.tokenShare),
                      cost: isModelCostUnknown(model)
                        ? t("mobile.usageRouteScreen.noKnownRates")
                        : formatUsd(model.costUsd),
                    })
                  : isModelCostUnknown(model)
                    ? t("mobile.usageRouteScreen.noKnownRatesTokens", {
                        tokens: formatTokens(model.totalTokens),
                      })
                    : t("usage.costShare", {
                        share: formatPercent(model.costShare),
                        tokens: formatTokens(model.totalTokens),
                      })}
              </Text>
            </View>
            <Text className="text-base tabular-nums text-foreground">
              {metric === "tokens"
                ? formatTokens(model.totalTokens)
                : isModelCostUnknown(model)
                  ? t("mobile.usageRouteScreen.unpriced")
                  : formatUsd(model.costUsd)}
            </Text>
          </View>
        ))}
      </View>
    </SettingsSection>
  );
}

function usageEnvironmentStatus(environment: EnvironmentUsageStatus, refreshing: boolean): string {
  if (
    environment.summary &&
    !isCompatibleUsageContractVersion(environment.summary.contractVersion, USAGE_CONTRACT_VERSION)
  ) {
    return formatUsageContractMismatch(environment.label, {
      direction:
        environment.summary.contractVersion < USAGE_CONTRACT_VERSION
          ? "serverBehind"
          : "clientBehind",
    });
  }
  if (environment.error)
    return environment.summary
      ? i18n.t("mobile.usageRouteScreen.errorShowingSavedTotals", { error: environment.error })
      : environment.error;
  if (!environment.isConnected)
    return environment.summary
      ? i18n.t("mobile.usageRouteScreen.disconnectedShowingSavedUsage")
      : i18n.t("mobile.usageRouteScreen.waitingForConnection");
  const progress = usageEnvironmentProgress(environment, refreshing);
  if (progress.phase === "loading") return i18n.t("mobile.usageRouteScreen.loadingUsage");
  if (progress.phase === "stale") return i18n.t("mobile.usageRouteScreen.updatingUsage");
  if (progress.phase === "partway")
    return updatingProvidersLabel(progress.providers, providerLabel);
  return i18n.t("mobile.usageRouteScreen.usageUpToDate");
}
