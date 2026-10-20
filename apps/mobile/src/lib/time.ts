import { i18n } from "@t3tools/shared/i18n";
export function relativeTime(input: string): string {
  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) {
    return i18n.t("mobile.time.lessThanMinute");
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return i18n.t("mobile.time.lessThanMinute");

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return i18n.t("mobile.time.minutes", { count: deltaMinutes });

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return i18n.t("mobile.time.hours", { count: deltaHours });

  const deltaDays = Math.floor(deltaHours / 24);
  return i18n.t("mobile.time.days", { count: deltaDays });
}
