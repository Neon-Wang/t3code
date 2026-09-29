import { i18n, type I18n } from "@t3tools/shared/i18n";
import type { RelayClientDeviceRecord } from "@t3tools/contracts/relay";

const mobileClientUpdatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const NOTIFICATION_PREFERENCES = [
  ["notifyOnApproval", "account.notificationPreference.approvals"],
  ["notifyOnInput", "account.notificationPreference.inputrequests"],
  ["notifyOnCompletion", "account.notificationPreference.completions"],
  ["notifyOnFailure", "account.notificationPreference.failures"],
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

export function mobileClientNotificationDetail(
  device: RelayClientDeviceRecord,
  t: I18n["t"] = i18n.t,
): string {
  if (!device.notifications.enabled) {
    return t("account.pushDisabled");
  }

  const enabledPreferences = NOTIFICATION_PREFERENCES.flatMap(([preference, label]) =>
    device.notifications[preference] ? [t(label)] : [],
  );
  return enabledPreferences.length > 0
    ? t("account.enabledAlerts", { preferences: enabledPreferences.join(", ") })
    : t("account.noAlertTypes");
}

export function mobileClientUpdatedAtLabel(updatedAt: string, t: I18n["t"] = i18n.t): string {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime())
    ? t("account.updateUnavailable")
    : t("account.updatedAt", { date: mobileClientUpdatedAtFormatter.format(date) });
}
