import { type MessageKey } from "@t3tools/shared/i18n";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import type { UsageChartMetric } from "./UsageProviderChart";
import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = UsageChartMetric | "limits";
export const METRIC_OPTIONS = [
  { value: "cost", labelKey: "usage.cost", command: "usage.cost" },
  { value: "tokens", labelKey: "usage.tokens", command: "usage.tokens" },
  { value: "limits", labelKey: "usage.limits", command: "usage.limits" },
] as const satisfies readonly {
  value: UsageMetric;
  labelKey: MessageKey;
  command: KeybindingCommand;
}[];

export const WINDOW_OPTIONS = [
  { days: 1, labelKey: "usage.past24h", command: "usage.period.day" },
  { days: 7, labelKey: "usage.7Days", command: "usage.period.week" },
  { days: 30, labelKey: "usage.30Days", command: "usage.period.month" },
  { days: 90, labelKey: "usage.90Days", command: "usage.period.quarter" },
] as const;

/** Resolves page shortcuts without taking letters from fields or popup controls. */
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
