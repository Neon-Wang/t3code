import { i18n } from "@t3tools/shared/i18n";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const INTERVAL_EVERY_KEYS = {
  week: "mobile.scheduledTaskPresentation.everyWeek",
  day: "mobile.scheduledTaskPresentation.everyDay",
  hour: "mobile.scheduledTaskPresentation.everyHour",
  minute: "mobile.scheduledTaskPresentation.everyMinute",
  second: "mobile.scheduledTaskPresentation.everySecond",
  millisecond: "mobile.scheduledTaskPresentation.everyMillisecond",
} as const;

const INTERVAL_PART_KEYS = {
  week: {
    one: "mobile.scheduledTaskPresentation.week.one",
    other: "mobile.scheduledTaskPresentation.week.other",
  },
  day: {
    one: "mobile.scheduledTaskPresentation.day.one",
    other: "mobile.scheduledTaskPresentation.day.other",
  },
  hour: {
    one: "mobile.scheduledTaskPresentation.hour.one",
    other: "mobile.scheduledTaskPresentation.hour.other",
  },
  minute: {
    one: "mobile.scheduledTaskPresentation.minute.one",
    other: "mobile.scheduledTaskPresentation.minute.other",
  },
  second: {
    one: "mobile.scheduledTaskPresentation.second.one",
    other: "mobile.scheduledTaskPresentation.second.other",
  },
  millisecond: {
    one: "mobile.scheduledTaskPresentation.millisecond.one",
    other: "mobile.scheduledTaskPresentation.millisecond.other",
  },
} as const;

export function formatScheduledTaskInterval(everyMs: number): string {
  const units = [
    [7 * DAY, "week"],
    [DAY, "day"],
    [HOUR, "hour"],
    [MINUTE, "minute"],
    [1_000, "second"],
    [1, "millisecond"],
  ] as const;
  let remaining = everyMs;
  const parts: string[] = [];
  for (const [size, unit] of units) {
    const count = Math.floor(remaining / size);
    if (count === 0) continue;
    if (count === 1 && remaining === everyMs && remaining === size) {
      return i18n.t(INTERVAL_EVERY_KEYS[unit]);
    }
    parts.push(i18n.t(INTERVAL_PART_KEYS[unit][count === 1 ? "one" : "other"], { count }));
    remaining %= size;
  }
  return i18n.t("mobile.scheduledTaskPresentation.every", { parts: parts.join(" ") });
}

function localCalendarDay(date: Date): number {
  // Compare calendar days, not 24-hour spans: DST days can have 23 or 25 hours.
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY;
}

export function formatNextScheduledTaskRun(nextRunAt: string, now: number): string {
  const next = new Date(nextRunAt);
  const current = new Date(now);
  const remaining = next.getTime() - now;
  if (!Number.isFinite(remaining))
    return i18n.t("mobile.scheduledTaskPresentation.nextRunUnavailable");
  if (remaining <= 0) return i18n.t("mobile.scheduledTaskPresentation.nextRunDue");

  const days = localCalendarDay(next) - localCalendarDay(current);
  if (days === 0) {
    if (remaining < MINUTE) return i18n.t("mobile.scheduledTaskPresentation.nextRunLessThanMinute");
    const inMinutes = remaining < HOUR;
    const count = Math.round(remaining / (inMinutes ? MINUTE : HOUR));
    const key = inMinutes
      ? count === 1
        ? "mobile.scheduledTaskPresentation.nextRunMinutes.one"
        : "mobile.scheduledTaskPresentation.nextRunMinutes.other"
      : count === 1
        ? "mobile.scheduledTaskPresentation.nextRunHours.one"
        : "mobile.scheduledTaskPresentation.nextRunHours.other";
    return i18n.t(key, { count });
  }

  const calendarLocale = i18n.locale === "zh-CN" ? "zh-CN" : [];
  const time = next.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return i18n.t("mobile.scheduledTaskPresentation.nextRunTomorrow", { time });
  if (days <= 7) {
    return i18n.t("mobile.scheduledTaskPresentation.nextRunNextWeekday", {
      weekday: next.toLocaleDateString(calendarLocale, { weekday: "long" }),
      time,
    });
  }
  const date = next.toLocaleDateString(calendarLocale, {
    month: "short",
    day: "numeric",
    ...(next.getFullYear() !== current.getFullYear() ? { year: "numeric" as const } : {}),
  });
  return i18n.t("mobile.scheduledTaskPresentation.nextRunDate", { date, time });
}
