import { i18n } from "@t3tools/shared/i18n";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import type { UsageChartMetric } from "./UsageProviderChart";
import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = UsageChartMetric | "limits";
export const METRIC_OPTIONS = [
  {
    value: "cost",
    get label() {
      return i18n.t("usage.cost");
    },
    command: "usage.cost",
  },
  {
    value: "tokens",
    get label() {
      return i18n.t("usage.tokens");
    },
    command: "usage.tokens",
  },
  {
    value: "limits",
    get label() {
      return i18n.t("usage.limits");
    },
    command: "usage.limits",
  },
] as const satisfies readonly { value: UsageMetric; label: string; command: KeybindingCommand }[];

export const WINDOW_OPTIONS = [
  {
    days: 1,
    get label() {
      return i18n.t("usage.past24h");
    },
    command: "usage.period.day",
  },
  {
    days: 7,
    get label() {
      return i18n.t("usage.7Days");
    },
    command: "usage.period.week",
  },
  {
    days: 30,
    get label() {
      return i18n.t("usage.30Days");
    },
    command: "usage.period.month",
  },
  {
    days: 90,
    get label() {
      return i18n.t("usage.90Days");
    },
    command: "usage.period.quarter",
  },
] as const;

export function resolveUsageShortcut(
  event: ShortcutEventLike & { target: EventTarget | null },
  keybindings: ResolvedKeybindingsConfig,
) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable ||
      target.closest('[role="dialog"], [aria-modal="true"], [data-slot$="popup"]'))
  ) {
    return null;
  }

  return resolveShortcutCommand(event, keybindings, {
    context: { usagePageOpen: true },
  });
}
