import { i18n } from "@t3tools/shared/i18n";
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

type ObservedTask = Pick<
  OrchestrationV2ThreadShell,
  "status" | "latestRunId" | "pendingRuntimeRequest"
>;

/** The first snapshot establishes a baseline; reconnects must not replay old alerts. */
export function changedTaskNotification(previous: ObservedTask | undefined, next: ObservedTask) {
  if (!previous) return null;
  if (
    next.pendingRuntimeRequest &&
    next.pendingRuntimeRequest.id !== previous.pendingRuntimeRequest?.id
  ) {
    return {
      id: `request:${next.pendingRuntimeRequest.id}`,
      message: i18n.t("mobile.notifications.needsInput"),
    };
  }
  if (!next.latestRunId || next.pendingRuntimeRequest) return null;
  if (previous.latestRunId === next.latestRunId && previous.status === next.status) return null;
  if (next.status === "completed")
    return {
      id: `${next.latestRunId}:completed`,
      message: i18n.t("mobile.notifications.completed"),
    };
  if (next.status === "failed")
    return { id: `${next.latestRunId}:failed`, message: i18n.t("mobile.notifications.failed") };
  return null;
}
