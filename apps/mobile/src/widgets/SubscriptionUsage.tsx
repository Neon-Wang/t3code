import { i18n } from "@t3tools/shared/i18n";
import { HStack, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityLabel,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  progressViewStyle,
  tint,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { SubscriptionUsageSnapshot as SubscriptionUsageProps } from "./subscriptionUsageSnapshot";

type UsageConfiguration = {
  codexPeriod?: "auto" | "session" | "weekly";
  claudePeriod?: "auto" | "session" | "weekly";
};

function SubscriptionUsage(
  props: SubscriptionUsageProps,
  environment: WidgetEnvironment<UsageConfiguration>,
) {
  "widget";
  // This function runs outside React and the app module graph. Its snapshot
  // carries templates so no hooks or live catalog imports reach the widget.
  const fallback: Record<string, Record<string, string>> = {
    en: {
      "mobile.subscriptionUsage.openT3ToConnect": i18n.t(
        "mobile.subscriptionUsage.openT3ToConnect",
      ),
      "mobile.widget.refresh": i18n.t("mobile.widget.refresh"),
      "mobile.widget.remaining": "{percent}% left",
      "mobile.widget.open": i18n.t("mobile.widget.open"),
      "mobile.subscriptionUsage.noSubscriptionLimitsAvailable": i18n.t(
        "mobile.subscriptionUsage.noSubscriptionLimitsAvailable",
      ),
      "mobile.widget.asOf": "As of {time}",
      "mobile.widget.connect": i18n.t("mobile.widget.connect"),
    },
    "zh-CN": {
      "mobile.subscriptionUsage.openT3ToConnect": "打开 T3 以连接",
      "mobile.widget.refresh": "打开 T3 刷新",
      "mobile.widget.remaining": "剩余 {percent}%",
      "mobile.widget.open": "打开 T3",
      "mobile.subscriptionUsage.noSubscriptionLimitsAvailable": "暂无订阅用量上限。",
      "mobile.widget.asOf": "更新于 {time}",
      "mobile.widget.connect": "点击打开 T3 连接",
    },
  };
  const t = (key: string, params: Record<string, string | number> = {}) => {
    let text = props.labels?.[key] ?? fallback[props.locale ?? "zh-CN"]?.[key] ?? key;
    for (const [name, value] of Object.entries(params))
      text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
  // The extension evaluates this function without the app's module scope.
  const family = environment.widgetFamily;
  // Gallery snapshots can render an old timeline entry after it has expired.
  const now = Math.max(environment.date?.getTime() ?? 0, Date.now());
  const accessory = family === "accessoryRectangular";
  const compact =
    family === "systemSmall" || accessory || environment.levelOfDetail === "simplified";
  const dense = family === "systemSmall" || family === "systemMedium";
  const limit = family === "systemExtraLarge" ? 6 : family === "systemLarge" ? 4 : 2;
  const monochrome =
    environment.widgetRenderingMode !== "fullColor" || environment.isLuminanceReduced;
  const providers = props.providers ?? [
    {
      name: "Codex",
      detail: t("mobile.subscriptionUsage.openT3ToConnect"),
      windows: [],
      expiresAt: 0,
    },
    {
      name: "Claude",
      detail: t("mobile.subscriptionUsage.openT3ToConnect"),
      windows: [],
      expiresAt: 0,
    },
  ];
  const columns = providers.map((provider) => {
    const stale = provider.windows.length > 0 && now >= provider.expiresAt;
    const period =
      environment.configuration?.[provider.name === "Claude" ? "claudePeriod" : "codexPeriod"] ??
      "auto";
    const windows = stale
      ? []
      : provider.windows.filter((window) => period === "auto" || window.kind === period);
    const tightest = windows.reduce<(typeof windows)[number] | undefined>(
      (result, window) => (!result || window.remaining < result.remaining ? window : result),
      undefined,
    );
    const compactWindows = [
      windows.find((window) => window.kind === "session"),
      windows.find((window) => window.kind === "weekly"),
    ].filter((window) => window !== undefined);
    const shown =
      accessory || environment.levelOfDetail === "simplified"
        ? tightest
          ? [tightest]
          : []
        : family === "systemSmall" && compactWindows.length > 0
          ? compactWindows
          : period === "auto" && compactWindows.length > 0
            ? [
                ...compactWindows,
                ...windows.filter((window) => !compactWindows.includes(window)),
              ].slice(0, limit)
            : windows.slice(0, limit);
    const detail = stale
      ? t("mobile.widget.refresh")
      : period !== "auto" && windows.length === 0 && provider.windows.length > 0
        ? `No ${period} limit reported`
        : provider.detail;
    const barModifiers = [
      progressViewStyle("linear"),
      frame({ height: 4 }),
      ...(monochrome ? [] : [tint(provider.name === "Claude" ? "#d97757" : "#8e8e93")]),
    ];
    if (accessory) {
      return (
        <VStack
          key={provider.name}
          alignment="leading"
          spacing={2}
          modifiers={[
            accessibilityElement("ignore"),
            accessibilityLabel(
              tightest
                ? `${provider.name}, ${tightest.label}, ${tightest.remaining} percent remaining. ${tightest.reset}. ${provider.detail}.`
                : `${provider.name}. ${detail}.`,
            ),
          ]}
        >
          <HStack spacing={4}>
            <Text
              modifiers={[
                font({ textStyle: "caption", weight: "semibold" }),
                lineLimit(1),
                foregroundStyle("primary"),
              ]}
            >
              {provider.name}
              {tightest ? ` · ${tightest.label}` : ""}
            </Text>
            <Spacer />
            <Text
              modifiers={[
                font({ textStyle: "caption", weight: "semibold" }),
                lineLimit(1),
                layoutPriority(1),
                foregroundStyle("primary"),
              ]}
            >
              {tightest
                ? t("mobile.widget.remaining", { percent: tightest.remaining })
                : period !== "auto" && !stale && provider.windows.length > 0
                  ? "N/A"
                  : t("mobile.widget.open")}
            </Text>
          </HStack>
          {tightest ? (
            <ProgressView value={tightest.remaining / 100} modifiers={barModifiers} />
          ) : null}
        </VStack>
      );
    }
    return (
      <VStack
        key={provider.name}
        alignment="leading"
        spacing={dense ? 1 : compact ? 2 : 4}
        modifiers={[
          frame({ maxWidth: Infinity, alignment: "leading" }),
          fixedSize({ horizontal: false, vertical: true }),
        ]}
      >
        <Text
          modifiers={[
            font({ textStyle: compact ? "caption" : "headline", weight: "bold" }),
            lineLimit(1),
            foregroundStyle("primary"),
          ]}
        >
          {provider.name}
        </Text>
        {!compact || shown.length === 0 ? (
          <Text
            modifiers={[
              font({ textStyle: "caption2" }),
              foregroundStyle("secondary"),
              lineLimit(1),
            ]}
          >
            {detail === "Subscription remaining" ? " " : detail}
          </Text>
        ) : null}
        {shown.map((window) => (
          <VStack
            key={window.label}
            alignment="leading"
            spacing={dense ? 1 : 2}
            modifiers={[
              accessibilityElement("ignore"),
              accessibilityLabel(
                `${provider.name}, ${window.label}, ${window.remaining} percent remaining. ${window.reset}. ${provider.detail}.`,
              ),
            ]}
          >
            <HStack spacing={4}>
              <Text
                modifiers={[
                  font({ textStyle: compact || dense ? "caption2" : "caption" }),
                  foregroundStyle("secondary"),
                  lineLimit(1),
                ]}
              >
                {window.label}
              </Text>
              <Spacer />
              <Text
                modifiers={[
                  font({
                    textStyle: compact || dense ? "caption2" : "caption",
                    weight: "semibold",
                  }),
                  lineLimit(1),
                  layoutPriority(1),
                  foregroundStyle(
                    window.remaining <= 10 && !monochrome
                      ? environment.colorScheme === "light"
                        ? "#dc2626"
                        : "#fca5a5"
                      : "primary",
                  ),
                ]}
              >
                {t("mobile.widget.remaining", { percent: window.remaining })}
              </Text>
            </HStack>
            <ProgressView value={window.remaining / 100} modifiers={barModifiers} />
            {!compact ? (
              <Text modifiers={[font({ size: 10 }), foregroundStyle("secondary"), lineLimit(1)]}>
                {window.reset}
              </Text>
            ) : null}
          </VStack>
        ))}
        {!compact &&
        !stale &&
        (period === "auto" ? (provider.totalWindows ?? windows.length) : windows.length) > limit ? (
          <Text
            modifiers={[
              font({ textStyle: "caption2" }),
              foregroundStyle("secondary"),
              lineLimit(1),
            ]}
          >
            {(period === "auto" ? (provider.totalWindows ?? windows.length) : windows.length) -
              limit}{" "}
            more in T3
          </Text>
        ) : null}
      </VStack>
    );
  });
  return (
    <VStack
      alignment="leading"
      spacing={accessory || dense ? 2 : 6}
      modifiers={props.url ? [widgetURL(props.url)] : []}
    >
      {providers.length === 0 ? (
        <Text modifiers={[font({ textStyle: "caption" }), foregroundStyle("secondary")]}>
          {t("mobile.subscriptionUsage.noSubscriptionLimitsAvailable")}
        </Text>
      ) : compact ? (
        <VStack alignment="leading" spacing={accessory || dense ? 4 : 8}>
          {columns}
        </VStack>
      ) : (
        <HStack alignment="top" spacing={16}>
          {columns}
        </HStack>
      )}
      {!accessory ? <Spacer /> : null}
      {!accessory ? (
        <Text
          modifiers={[font({ textStyle: "caption2" }), foregroundStyle("secondary"), lineLimit(1)]}
        >
          {props.checkedAt
            ? t("mobile.widget.asOf", {
                time: new Date(props.checkedAt).toLocaleString(props.locale ?? "zh-CN", {
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                }),
              })
            : t("mobile.widget.connect")}
        </Text>
      ) : null}
    </VStack>
  );
}

export default createWidget("SubscriptionUsage", SubscriptionUsage);
