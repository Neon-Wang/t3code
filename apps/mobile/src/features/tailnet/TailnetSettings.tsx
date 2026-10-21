import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import * as Notifications from "expo-notifications";
import { AppText } from "../../components/ui/AppText";
import { Button as MaterialButton } from "../../components/ui/Button";
import { useI18n } from "../../i18n/useI18n";
import { SettingsSection } from "../settings/components/SettingsSection";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { readTailnetStatus, tailnetNative, type TailnetStatus } from "./native";

export function TailnetSettings() {
  const { t } = useI18n();
  const focused = useIsFocused();
  const [status, setStatus] = useState<TailnetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    const next = await readTailnetStatus();
    setStatus(next);
    setUnavailable(false);
  }, []);
  useEffect(() => {
    if (!tailnetNative || !focused) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let pendingRefresh = false;
    async function update() {
      if (!alive || AppState.currentState !== "active") return;
      if (refreshing) {
        pendingRefresh = true;
        return;
      }
      refreshing = true;
      clearTimeout(timer);
      await (async () => {
        const next = await readTailnetStatus();
        if (!alive) return;
        setStatus(next);
        setUnavailable(false);
        // Only an open, foreground settings page polls while login/startup is pending.
        if (next.enabled && next.state !== "Running") timer = setTimeout(() => void update(), 3000);
      })()
        .catch(() => {
          if (alive) setUnavailable(true);
        })
        .finally(() => {
          refreshing = false;
          if (pendingRefresh && alive) {
            pendingRefresh = false;
            void update();
          }
        });
    }
    void update();
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void update();
      else clearTimeout(timer);
    });
    const network = tailnetNative.addListener("onNetworkChanged", () => void update());
    return () => {
      alive = false;
      clearTimeout(timer);
      app.remove();
      network.remove();
    };
    // Manual actions restart polling even when the page stays focused.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [focused, refreshRevision]);
  if (!tailnetNative) return null;
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    await (async () => {
      await action();
      await refresh();
      setRefreshRevision((revision) => revision + 1);
    })()
      .catch((error: unknown) => {
        Alert.alert(
          t("mobile.tailnet.settingsError"),
          error instanceof Error ? error.message : t("mobile.tailnet.failed"),
        );
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
      });
  }
  const connected =
    status?.enabled && status.state === "Running" && status.uplink !== "unavailable";
  const state = unavailable
    ? t("mobile.tailnet.statusUnavailable")
    : !status
      ? t("mobile.tailnet.loading")
      : !status.enabled
        ? t("mobile.tailnet.disabled")
        : status.uplink === "unavailable"
          ? t("mobile.tailnet.waitingNetwork")
          : connected
            ? t("mobile.tailnet.connected")
            : status.state === "NeedsLogin"
              ? t("mobile.tailnet.needsLogin")
              : t("mobile.tailnet.connecting");
  const uplink =
    status?.uplink === "vpn"
      ? t("mobile.tailnet.systemVpn")
      : status?.uplink === "system"
        ? t("mobile.tailnet.systemNetwork")
        : status?.uplink === "wifi"
          ? "Wi-Fi"
          : status?.uplink === "cellular"
            ? t("mobile.tailnet.cellular")
            : status?.uplink === "ethernet"
              ? t("mobile.tailnet.ethernet")
              : t("mobile.tailnet.noNetwork");
  return (
    <View className="gap-5">
      <SettingsSection title="Tailscale" footer={t("mobile.tailnet.systemFootnote")}>
        <View className="gap-4 p-5">
          <View className="flex-row items-center gap-3">
            <View
              className={
                connected
                  ? "h-3 w-3 rounded-full bg-primary"
                  : "h-3 w-3 rounded-full bg-foreground-muted"
              }
            />
            <AppText
              accessibilityRole="header"
              className="flex-1 text-xl font-t3-semibold text-foreground"
            >
              {state}
            </AppText>
          </View>
          <AppText className="text-sm text-foreground-muted">{t("mobile.tailnet.summary")}</AppText>
          {status?.enabled ? (
            <View className="gap-2 rounded-2xl bg-subtle p-4">
              <AppText className="text-sm text-foreground-muted">
                {t("mobile.tailnet.selectedNetwork", { network: uplink })}
              </AppText>
              {status.ips?.map((ip) => (
                <AppText key={ip} selectable className="font-mono text-sm text-foreground">
                  {ip}
                </AppText>
              ))}
            </View>
          ) : null}
          {status?.enabled && !connected && status.uplink !== "unavailable" ? (
            <MaterialButton
              label={t("mobile.tailnet.signIn")}
              tone="primary"
              fullWidth
              loading={busy}
              disabled={!status.loginUrl}
              onPress={() =>
                void run(async () => {
                  const current = await readTailnetStatus();
                  if (!current.loginUrl) throw new Error(t("mobile.tailnet.loginPending"));
                  const url = new URL(current.loginUrl);
                  if (url.protocol !== "https:" || url.hostname !== "login.tailscale.com")
                    throw new Error(t("mobile.tailnet.invalidLogin"));
                  await Linking.openURL(current.loginUrl);
                })
              }
            />
          ) : null}
          {unavailable ? (
            <MaterialButton
              label={t("action.retry")}
              disabled={busy}
              onPress={() => void run(() => tailnetNative!.setEnabled(true))}
            />
          ) : null}
        </View>
        <SettingsSwitchRow
          label={t("mobile.tailnet.enable")}
          value={status?.enabled ?? false}
          disabled={busy || !status}
          onValueChange={(enabled) => void run(() => tailnetNative!.setEnabled(enabled))}
        />
      </SettingsSection>
      <SettingsSection
        title={t("mobile.tailnet.backgroundSection")}
        footer={t("mobile.tailnet.backgroundFootnote")}
      >
        <SettingsSwitchRow
          label={t("mobile.tailnet.background")}
          subtitle={t("mobile.tailnet.backgroundSummary")}
          value={status?.background ?? false}
          disabled={busy || !status}
          onValueChange={(enabled) =>
            void run(async () => {
              if (enabled) {
                await Notifications.setNotificationChannelAsync("t3-background-connection", {
                  name: t("mobile.notifications.connectionChannel"),
                  importance: Notifications.AndroidImportance.LOW,
                  sound: null,
                  enableVibrate: false,
                  showBadge: false,
                });
                const permission = await Notifications.requestPermissionsAsync();
                if (!permission.granted)
                  throw new Error(t("mobile.tailnet.notificationPermission"));
              }
              await tailnetNative!.setBackgroundEnabled(enabled);
            })
          }
        />
      </SettingsSection>
      {status?.enabled ? (
        <MaterialButton
          label={t("mobile.tailnet.signOut")}
          tone="text"
          disabled={busy}
          onPress={() =>
            Alert.alert(t("mobile.tailnet.signOutTitle"), t("mobile.tailnet.signOutDescription"), [
              { text: t("action.cancel"), style: "cancel" },
              {
                text: t("mobile.tailnet.signOutAction"),
                style: "destructive",
                onPress: () => void run(() => tailnetNative!.logout()),
              },
            ])
          }
        />
      ) : null}
    </View>
  );
}
