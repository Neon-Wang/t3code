import { useAtomValue } from "@effect/atom-react";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { useI18n } from "../../i18n/useI18n";
import { makePermissionStatusAtom } from "../../lib/permissionStatusAtom";
import { SettingsSection } from "../settings/components/SettingsSection";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import { refreshInboxPushRegistration } from "./inboxPushRegistration";
import { requestAgentNotificationPermission } from "./notificationPermissions";
import { runtime } from "../../lib/runtime";
import { appAtomRegistry } from "../../state/atom-registry";

const permissionAtom = makePermissionStatusAtom({
  label: "inbox-push:permission",
  initial: false,
  read: async () => (await Notifications.getPermissionsAsync()).granted,
});

export function InboxPushNotificationSettings() {
  if (Platform.OS !== "android") return null;
  return <AndroidInboxPushSettings />;
}

function AndroidInboxPushSettings() {
  const { t } = useI18n();
  const granted = useAtomValue(permissionAtom);
  return (
    <SettingsSection title={t("inbox.push.title")}>
      <SettingsSwitchRow
        icon="bell.badge"
        label={t("inbox.push.enabled")}
        subtitle={t("inbox.push.description")}
        value={granted}
        onValueChange={async (enabled) => {
          try {
            if (enabled) {
              const permission = await runtime.runPromise(requestAgentNotificationPermission);
              if (permission.type === "denied" && !permission.canAskAgain) {
                await Linking.openSettings();
              }
              appAtomRegistry.set(
                permissionAtom,
                (await Notifications.getPermissionsAsync()).granted,
              );
              refreshInboxPushRegistration();
            } else {
              await Linking.openSettings();
            }
          } catch {
            console.warn("Could not change inbox notification permissions.");
          }
        }}
      />
    </SettingsSection>
  );
}
