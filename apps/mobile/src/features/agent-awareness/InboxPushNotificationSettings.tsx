import { useAtomValue } from "@effect/atom-react";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { useGT } from "gt-react-native";
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
  const gt = useGT();
  const granted = useAtomValue(permissionAtom);
  return (
    <SettingsSection title={gt("Inbox push")}>
      <SettingsSwitchRow
        icon="bell.badge"
        label={gt("Enable inbox push")}
        subtitle={gt("Receive pending questions on Android when the app is closed.")}
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
