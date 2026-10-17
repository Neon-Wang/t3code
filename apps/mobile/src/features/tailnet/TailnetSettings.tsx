import { useI18n } from "../../i18n/useI18n";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking } from "react-native";
import * as Notifications from "expo-notifications";
import { SettingsRow } from "../settings/components/SettingsRow";
import { SettingsSection } from "../settings/components/SettingsSection";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { readTailnetStatus, tailnetNative, type TailnetStatus } from "./native";

export function TailnetSettings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<TailnetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => setStatus(await readTailnetStatus()), []);
  useEffect(() => {
    if (!tailnetNative) return;
    let mounted = true;
    void readTailnetStatus()
      .then((value) => {
        if (mounted) setStatus(value);
      })
      .catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch(() => undefined);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [refresh]);
  if (!tailnetNative) return null;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (error) {
      Alert.alert(
        t("mobile.tailnet.settingsError"),
        error instanceof Error ? error.message : t("mobile.tailnet.failed"),
      );
    } finally {
      setBusy(false);
    }
  }
  const state =
    status?.state === "Running"
      ? t("mobile.tailnet.connected")
      : status?.state === "NeedsLogin"
        ? t("mobile.tailnet.needsLogin")
        : status?.enabled
          ? t("mobile.tailnet.connecting")
          : t("mobile.tailnet.disabled");
  return (
    <SettingsSection title={t("mobile.tailnet.section")}>
      <SettingsSwitchRow
        label={t("mobile.tailnet.enable")}
        subtitle={t("mobile.tailnet.description")}
        value={status?.enabled ?? false}
        disabled={busy}
        onValueChange={(enabled) => {
          void run(() => tailnetNative!.setEnabled(enabled));
        }}
      />
      <SettingsRow
        icon="globe"
        label={state}
        value={status?.ips?.join(" · ")}
        onPress={() => {
          void run(refresh);
        }}
      />
      {status?.enabled && status.state !== "Running" ? (
        <SettingsRow
          icon="globe"
          label={t("mobile.tailnet.signIn")}
          onPress={() => {
            void run(async () => {
              const current = await readTailnetStatus();
              if (!current.loginUrl) throw new Error(t("mobile.tailnet.loginPending"));
              const url = new URL(current.loginUrl);
              if (url.protocol !== "https:" || url.hostname !== "login.tailscale.com")
                throw new Error(t("mobile.tailnet.invalidLogin"));
              await Linking.openURL(current.loginUrl);
            });
          }}
        />
      ) : null}
      {status?.enabled ? (
        <SettingsRow
          icon="globe"
          label={t("mobile.tailnet.signOut")}
          onPress={() => {
            Alert.alert(t("mobile.tailnet.signOutTitle"), t("mobile.tailnet.signOutDescription"), [
              { text: t("action.cancel"), style: "cancel" },
              {
                text: t("mobile.tailnet.signOutAction"),
                style: "destructive",
                onPress: () => {
                  void run(() => tailnetNative!.logout());
                },
              },
            ]);
          }}
        />
      ) : null}
      <SettingsSwitchRow
        label={t("mobile.tailnet.background")}
        subtitle={t("mobile.tailnet.backgroundDescription")}
        value={status?.background ?? false}
        disabled={busy}
        onValueChange={(enabled) => {
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
              if (!permission.granted) throw new Error(t("mobile.tailnet.notificationPermission"));
            }
            await tailnetNative!.setBackgroundEnabled(enabled);
          });
        }}
      />
    </SettingsSection>
  );
}
