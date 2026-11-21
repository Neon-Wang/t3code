import { msg } from "gt-react-native";
import { m } from "../../i18n/messages";
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
      message: m(msg("The task needs your confirmation")),
    };
  }
  if (!next.latestRunId || next.pendingRuntimeRequest) return null;
  if (previous.latestRunId === next.latestRunId && previous.status === next.status) return null;
  if (next.status === "completed")
    return {
      id: `${next.latestRunId}:completed`,
      message: m(msg("Task completed")),
    };
  if (next.status === "failed")
    return {
      id: `${next.latestRunId}:failed`,
      message: m(msg("Task failed. Open the thread for details.")),
    };
  return null;
}
