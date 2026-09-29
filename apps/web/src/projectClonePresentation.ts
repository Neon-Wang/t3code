import type { ProjectCloneSnapshot } from "@t3tools/contracts";
import type { I18n } from "@t3tools/shared/i18n";

export function projectCloneProgressSummary(
  snapshot: Pick<ProjectCloneSnapshot, "stage" | "percent" | "detail">,
  t: I18n["t"],
): string {
  const labels = {
    connecting: "helpers.ui.cloneConnecting",
    counting: "helpers.ui.cloneCounting",
    receiving: "helpers.ui.cloneReceiving",
    resolving: "helpers.ui.cloneResolving",
    checkout: "helpers.ui.cloneCheckout",
  } as const;
  const parts = [t(labels[snapshot.stage])];
  if (snapshot.percent !== null) parts.push(`${snapshot.percent}%`);
  if (snapshot.detail) parts.push(snapshot.detail);
  return parts.join(" · ");
}
