import {
  Button,
  Column,
  getMaterialColors,
  LinearProgressIndicator,
  Text,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { SubscriptionUsageSnapshot as SubscriptionUsageProps } from "./subscriptionUsageSnapshot";

export function SubscriptionUsage(props: SubscriptionUsageProps, environment: WidgetEnvironment) {
  "widget";
  // This function runs outside React and the app module graph. Its snapshot
  // carries templates so no hooks or live catalog imports reach the widget.
  const fallback: Record<string, Record<string, string>> = {
    en: {
      "mobile.subscriptionUsage.openT3ToConnect": "Open T3 to connect",
      "mobile.widget.refresh": "Open T3 to refresh",
      "mobile.SubscriptionUsage.left": "{label} · {percent}% left",
      "mobile.SubscriptionUsage.moreInT3": "{count} more in T3",
      "mobile.widget.asOf": "As of {time}",
      "mobile.widget.connect": "Tap to connect in T3",
    },
    "zh-CN": {
      "mobile.subscriptionUsage.openT3ToConnect": "打开 T3 以连接",
      "mobile.widget.refresh": "打开 T3 刷新",
      "mobile.SubscriptionUsage.left": "{label} · 剩余 {percent}%",
      "mobile.SubscriptionUsage.moreInT3": "在 T3 中查看其余 {count} 项",
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
  // The widget runtime evaluates this function without the app's module scope.
  const now = Date.now();
  const limit = 2;
  const mode = props.theme?.mode;
  const appearance =
    mode === "light" || mode === "dark"
      ? mode
      : environment.colorScheme === "dark"
        ? "dark"
        : "light";
  const palette = props.theme?.[appearance];
  const colors = palette
    ? {
        surface: palette.background,
        onSurface: palette.foreground,
        onSurfaceVariant: palette.secondary,
        surfaceVariant: palette.track,
        primary: palette.accent,
        error: palette.danger,
      }
    : getMaterialColors({ scheme: appearance });
  const muted = colors.onSurfaceVariant;
  const providers = props.providers ?? [
    {
      name: "Codex",
      detail: t("mobile.subscriptionUsage.openT3ToConnect"),
      windows: [],
      expiresAt: 0,
      totalWindows: 0,
    },
    {
      name: "Claude",
      detail: t("mobile.subscriptionUsage.openT3ToConnect"),
      windows: [],
      expiresAt: 0,
      totalWindows: 0,
    },
  ];
  return (
    // The card is one Button so a tap reaches the app's interaction listener,
    // which opens props.url. expo-widgets has no Android counterpart to widgetURL.
    <Button
      colors={{ containerColor: colors.surface }}
      modifiers={[fillMaxSize()]}
      onClick={() => {}}
    >
      <Column modifiers={[fillMaxSize(), paddingAll(16)]}>
        {providers.map((provider, index) => {
          const stale =
            provider.windows.length > 0 && provider.expiresAt > 0 && now >= provider.expiresAt;
          const shown = stale ? [] : provider.windows.slice(0, limit);
          const hidden = stale ? 0 : (provider.totalWindows ?? provider.windows.length) - limit;
          return (
            <Column
              key={provider.name}
              modifiers={[fillMaxWidth(), padding(0, index === 0 ? 0 : 10, 0, 0)]}
            >
              <Text
                color={colors.onSurface}
                maxLines={1}
                style={{ fontSize: 13, fontWeight: "bold" }}
              >
                {provider.name}
              </Text>
              {shown.length === 0 ? (
                <Text color={muted} maxLines={1} style={{ fontSize: 11 }}>
                  {stale ? t("mobile.widget.refresh") : provider.detail}
                </Text>
              ) : null}
              {shown.map((window) => {
                const low = window.remaining <= 10;
                return (
                  <Column key={window.label} modifiers={[fillMaxWidth(), padding(0, 4, 0, 0)]}>
                    <Text
                      color={low ? colors.error : colors.onSurface}
                      maxLines={1}
                      style={{ fontSize: 11 }}
                    >
                      {t("mobile.SubscriptionUsage.left", {
                        label: window.label,
                        percent: window.remaining,
                      })}
                    </Text>
                    <Column modifiers={[fillMaxWidth(), padding(0, 3, 0, 3)]}>
                      <LinearProgressIndicator
                        progress={window.remaining / 100}
                        color={low ? colors.error : colors.primary}
                        trackColor={colors.surfaceVariant}
                        modifiers={[fillMaxWidth(), height(6)]}
                      />
                    </Column>
                    <Text color={muted} maxLines={1} style={{ fontSize: 10 }}>
                      {window.reset}
                    </Text>
                  </Column>
                );
              })}
              {hidden > 0 ? (
                <Text color={muted} maxLines={1} style={{ fontSize: 10 }}>
                  {t("mobile.SubscriptionUsage.moreInT3", { count: hidden })}
                </Text>
              ) : null}
            </Column>
          );
        })}
        <Text
          color={muted}
          maxLines={1}
          style={{ fontSize: 10 }}
          modifiers={[padding(0, 10, 0, 0)]}
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
      </Column>
    </Button>
  );
}

export default createWidget("SubscriptionUsage", SubscriptionUsage);
