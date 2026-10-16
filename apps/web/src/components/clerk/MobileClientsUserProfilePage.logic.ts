import { i18n } from "@t3tools/shared/i18n";
import type { RelayClientDeviceRecord } from "@t3tools/contracts/relay";

const mobileClientUpdatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const NOTIFICATION_PREFERENCES = [
  ["notifyOnApproval", "approvals"],
  ["notifyOnInput", "input requests"],
  ["notifyOnCompletion", "completions"],
  ["notifyOnFailure", "failures"],
] as const satisfies ReadonlyArray<
  readonly [keyof RelayClientDeviceRecord["notifications"], string]
>;

export function mobileClientPlatformLabel(device: RelayClientDeviceRecord): string {
  const platform =
    device.platform === "android"
      ? "Android"
      : device.iosMajorVersion === null
        ? "iOS"
        : `iOS ${device.iosMajorVersion}`;
  return `${platform}${device.appVersion ? ` · T3 Code ${device.appVersion}` : ""}`;
}

export function mobileClientNotificationDetail(device: RelayClientDeviceRecord): string {
  if (!device.notifications.enabled) {
    return i18n.t("account.pushDisabled");
  }

  const enabledPreferences = NOTIFICATION_PREFERENCES.flatMap(([preference, label]) =>
    device.notifications[preference] ? [label] : [],
  );
  return enabledPreferences.length > 0
    ? i18n.t("account.enabledAlerts", { preferences: enabledPreferences.join(", ") })
    : i18n.t("account.noAlertTypes");
}

export function mobileClientUpdatedAtLabel(updatedAt: string): string {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime())
    ? i18n.t("account.updateUnavailable")
    : i18n.t("account.updatedAt", { date: mobileClientUpdatedAtFormatter.format(date) });
}
