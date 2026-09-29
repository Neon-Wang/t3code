import { i18n } from "@t3tools/shared/i18n";
import { readLocalApi } from "~/localApi";

let pendingConfirmations = 0;

/** Whether a terminal-close confirmation is currently waiting on the user. */
export function isTerminalCloseConfirmPending(): boolean {
  return pendingConfirmations > 0;
}

/**
 * Confirmation for individual terminal close actions: drawer buttons, panel
 * buttons, the `terminal.close` keybinding, and closing a terminal surface from
 * the tab strip. Auto-exit cleanup and bulk tab closes skip this path and close
 * directly.
 */
export async function confirmTerminalClose(
  labels: readonly [string, ...string[]],
  t: typeof i18n.t = i18n.t,
): Promise<boolean> {
  const localApi = readLocalApi();
  if (!localApi) return true;
  pendingConfirmations += 1;
  try {
    return await localApi.dialogs.confirm(
      labels.length === 1
        ? [
            t("helpers.closeTerminalValue", { arg0: labels[0] }),
            t("helpers.thisStopsTheRunningProcessAndClearsItsHistory"),
          ].join("\n")
        : [
            t("helpers.closeValueTerminals", { arg0: labels.length }),
            t("helpers.thisStopsTheirRunningProcessesAndClearsTheirHistoriesValue", {
              arg0: labels.map((label) => `"${label}"`).join(", "),
            }),
          ].join("\n"),
      { variant: "destructive" },
    );
  } catch {
    return false;
  } finally {
    pendingConfirmations -= 1;
  }
}
