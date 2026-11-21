import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import * as Notifications from "expo-notifications";
import { AppText } from "../../components/ui/AppText";
import { Button as MaterialButton } from "../../components/ui/Button";
import { useGT } from "gt-react-native";
import { SettingsSection } from "../settings/components/SettingsSection";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { readTailnetStatus, tailnetNative, type TailnetStatus } from "./native";

export function TailnetSettings() {
  const gt = useGT();
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
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens for native network changes while settings are visible
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
          gt("Connection settings"),
          error instanceof Error ? error.message : gt("Operation failed. Please try again."),
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
    ? gt("Connection status unavailable")
    : !status
      ? gt("Checking connection…")
      : !status.enabled
        ? gt("Off")
        : status.uplink === "unavailable"
          ? gt("Waiting for a network")
          : connected
            ? gt("Connected")
            : status.state === "NeedsLogin"
              ? gt("Sign-in required")
              : gt("Connecting");
  const uplink =
    status?.uplink === "vpn"
      ? gt("System VPN")
      : status?.uplink === "system"
        ? gt("System network")
        : status?.uplink === "wifi"
          ? "Wi-Fi"
          : status?.uplink === "cellular"
            ? gt("Cellular")
            : status?.uplink === "ethernet"
              ? gt("Ethernet")
              : gt("No available network");
  return (
    <View className="gap-5">
      <SettingsSection
        title="Tailscale"
        footer={gt("Uses the current system network, VPN and proxy settings.")}
      >
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
          <AppText className="text-sm text-foreground-muted">
            {gt("Your private connection to T3 environments.")}
          </AppText>
          {status?.enabled ? (
            <View className="gap-2 rounded-2xl bg-subtle p-4">
              <AppText className="text-sm text-foreground-muted">
                {gt("Selected network: {network}", { network: uplink })}
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
              label={gt("Sign in to Tailscale")}
              tone="primary"
              fullWidth
              loading={busy}
              disabled={!status.loginUrl}
              onPress={() =>
                void run(async () => {
                  const current = await readTailnetStatus();
                  if (!current.loginUrl)
                    throw new Error(gt("The sign-in link is not ready. Please try again shortly."));
                  const url = new URL(current.loginUrl);
                  if (url.protocol !== "https:" || url.hostname !== "login.tailscale.com")
                    throw new Error(gt("Invalid sign-in address"));
                  await Linking.openURL(current.loginUrl);
                })
              }
            />
          ) : null}
          {unavailable ? (
            <MaterialButton
              label={gt("Retry")}
              disabled={busy}
              onPress={() => void run(() => tailnetNative!.setEnabled(true))}
            />
          ) : null}
        </View>
        <SettingsSwitchRow
          label={gt("Connect to tailnet")}
          value={status?.enabled ?? false}
          disabled={busy || !status}
          onValueChange={(enabled) => void run(() => tailnetNative!.setEnabled(enabled))}
        />
      </SettingsSection>
      <SettingsSection
        title={gt("Task notifications")}
        footer={gt(
          "Keeps one silent notification while enabled. Uses more power; deep sleep may delay task alerts.",
        )}
      >
        <SettingsSwitchRow
          label={gt("Background connection")}
          subtitle={gt("Approval, completion and failures only")}
          value={status?.background ?? false}
          disabled={busy || !status}
          onValueChange={(enabled) =>
            void run(async () => {
              if (enabled) {
                await Notifications.setNotificationChannelAsync("t3-background-connection", {
                  name: gt("T3 background connection"),
                  importance: Notifications.AndroidImportance.LOW,
                  sound: null,
                  enableVibrate: false,
                  showBadge: false,
                });
                const permission = await Notifications.requestPermissionsAsync();
                if (!permission.granted)
                  throw new Error(
                    gt("Allow notifications to show background connection status and task alerts."),
                  );
              }
              await tailnetNative!.setBackgroundEnabled(enabled);
            })
          }
        />
      </SettingsSection>
      {status?.enabled ? (
        <MaterialButton
          label={gt("Sign out of Tailscale")}
          tone="text"
          disabled={busy}
          onPress={() =>
            Alert.alert(
              gt("Sign out"),
              gt("This device will disconnect from the tailnet. Saved T3 pairings will remain."),
              [
                { text: gt("Cancel"), style: "cancel" },
                {
                  text: gt("Sign out"),
                  style: "destructive",
                  onPress: () => void run(() => tailnetNative!.logout()),
                },
              ],
            )
          }
        />
      ) : null}
    </View>
  );
}
