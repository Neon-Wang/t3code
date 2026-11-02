import { useI18n } from "../../hooks/useI18n";
import { i18n } from "@t3tools/shared/i18n";
import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";
import { isOrchestrationV2WorkActive } from "@t3tools/contracts";
import { deriveSubagentElapsedMs } from "@t3tools/shared/orchestrationTiming";
import { tickTextContent } from "~/lib/tickTextContent";

function formatElapsedSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) {
    return i18n.t("sidebar.secondsS", { seconds: seconds });
  }
  const hours = Math.floor(minutes / 60);
  if (hours === 0) {
    return i18n.t("sidebar.minutesMSecondsS", {
      minutes: minutes,
      seconds: String(seconds % 60).padStart(2, "0"),
    });
  }
  return i18n.t("sidebar.hoursHMinutesM", {
    hours: hours,
    minutes: String(minutes % 60).padStart(2, "0"),
  });
}

function formatCompactElapsedSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return i18n.t("sidebar.secondsS", { seconds: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return i18n.t("sidebar.minutesM", { minutes: minutes });
  if (minutes >= 600) return i18n.t("sidebar.countH", { count: Math.floor(minutes / 60) });
  return i18n.t("sidebar.countH", { count: Math.floor(minutes / 6) / 10 });
}

export function AgentElapsed({
  agent,
  compact = false,
}: {
  agent: Pick<RuntimeSubagent, "status" | "startedAt" | "completedAt">;
  compact?: boolean;
}) {
  useI18n();
  const format = compact ? formatCompactElapsedSeconds : formatElapsedSeconds;
  const live = isOrchestrationV2WorkActive(agent.status);
  const { status, startedAt, completedAt } = agent;
  if (deriveSubagentElapsedMs(agent, 0) === null) {
    return null;
  }
  return (
    <span
      ref={tickTextContent((nowMs) => {
        const elapsedMs = deriveSubagentElapsedMs({ status, startedAt, completedAt }, nowMs);
        return elapsedMs === null ? "" : format(elapsedMs / 1000);
      }, live)}
      className="tabular-nums"
    />
  );
}
