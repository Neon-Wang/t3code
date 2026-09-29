import { i18n, type MessageKey } from "@t3tools/shared/i18n";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import {
  resolveSnoozePresets as resolveSharedSnoozePresets,
  snoozeWakeLabel as sharedSnoozeWakeLabel,
  type SnoozePreset,
} from "@t3tools/client-runtime/state/thread-settled";

import { formatShortTimestamp, parseTimestampDate } from "../timestampFormat";

export { type SnoozePreset };

const DAY_MS = 24 * 60 * 60 * 1_000;

function timeOfDayLabel(date: Date, timestampFormat: TimestampFormat): string {
  return formatShortTimestamp(date.toISOString(), timestampFormat);
}

export function resolveSnoozePresets(
  now: Date,
  timestampFormat: TimestampFormat,
  t = i18n.t,
): ReadonlyArray<SnoozePreset> {
  return resolveSharedSnoozePresets(now).map((preset) => {
    const wake = parseTimestampDate(preset.snoozedUntil);
    if (wake === null) return preset;
    const time = timeOfDayLabel(wake, timestampFormat);
    return {
      ...preset,
      label: getSnoozePresetLabel(preset, t),
      whenLabel:
        preset.id === "next-week"
          ? `${wake.toLocaleDateString(i18n.locale, { weekday: "short" })} ${time}`
          : time,
    };
  });
}

/**
 * Human wake time for menus and toasts: "tomorrow 9:00", "Mon 9:00",
 * "17:30" (today).
 */
export function snoozeWakeDescription(
  snoozedUntil: string,
  now: Date,
  timestampFormat: TimestampFormat,
  t = i18n.t,
): string {
  const wake = parseTimestampDate(snoozedUntil);
  if (wake === null) return "";
  const time = timeOfDayLabel(wake, timestampFormat);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayDelta = Math.floor((wake.getTime() - startOfToday.getTime()) / DAY_MS);
  if (dayDelta === 0) return time;
  if (dayDelta === 1) return t("sidebar.tomorrowTime", { time });
  const weekday = wake.toLocaleDateString(i18n.locale, { weekday: "short" });
  if (dayDelta < 7) return `${weekday} ${time}`;
  const date = wake.toLocaleDateString(i18n.locale, { month: "short", day: "numeric" });
  return `${date}, ${time}`;
}

const SNOOZE_PRESET_KEYS: Partial<Record<string, MessageKey>> = {
  hour: "sidebar.in1Hour",
  "three-hours": "sidebar.in3Hours",
  evening: "sidebar.thisEvening",
  tomorrow: "sidebar.tomorrow",
  "next-week": "sidebar.nextWeek",
};
export function getSnoozePresetLabel(preset: SnoozePreset, t = i18n.t): string {
  const key = SNOOZE_PRESET_KEYS[preset.id];
  return key ? t(key) : preset.label;
}
export function snoozeWakeLabel(
  snoozedUntil: string,
  options: { readonly now: string },
  t = i18n.t,
): string {
  const label = sharedSnoozeWakeLabel(snoozedUntil, options);
  if (label === "now") return t("sidebar.now");
  const match = /^(\d+)([mhd])$/.exec(label);
  if (!match) return label;
  return t(
    match[2] === "m" ? "sidebar.countM" : match[2] === "h" ? "sidebar.countH" : "sidebar.countD",
    { count: match[1]! },
  );
}
