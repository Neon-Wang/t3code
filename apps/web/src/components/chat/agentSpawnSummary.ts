import { i18n } from "@t3tools/shared/i18n";
import {
  isActiveSubagentStatus,
  isTerminalSubagentStatus,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

/** Summarize observed states without treating idle or missing agents as completed. */
export function deriveAgentSpawnSummary({
  agents,
  agentCount,
  coordinatorStatus,
}: {
  agents: ReadonlyArray<Pick<RuntimeSubagent, "kind" | "status">>;
  agentCount: number;
  coordinatorStatus?: RuntimeSubagent["status"] | undefined;
}) {
  const working = agents.filter((agent) => isActiveSubagentStatus(agent.status)).length;
  const failed = agents.filter((agent) => agent.status === "failed").length;
  const idle = agents.filter((agent) => agent.status === "idle").length;
  const stopped = agents.filter(
    (agent) => agent.status === "cancelled" || agent.status === "interrupted",
  ).length;
  const batches = agents.filter((agent) => agent.kind === "subagent_batch").length;
  const individuals = agentCount - batches;
  // Workflow coordinators can keep running between dynamic member launches.
  const live =
    coordinatorStatus !== undefined ? !isTerminalSubagentStatus(coordinatorStatus) : working > 0;
  const subjects = [
    individuals > 0
      ? i18n.t(individuals === 1 ? "v2.chat.subagentCount.one" : "v2.chat.subagentCount.other", {
          count: individuals,
        })
      : null,
    batches > 0
      ? i18n.t(
          individuals > 0
            ? batches === 1
              ? "v2.chat.batchCount.one"
              : "v2.chat.batchCount.other"
            : batches === 1
              ? "v2.chat.subagentBatchCount.one"
              : "v2.chat.subagentBatchCount.other",
          { count: batches },
        )
      : null,
  ]
    .filter(Boolean)
    .join(i18n.t("v2.chat.and"));
  const lead = `${batches > 0 ? i18n.t("v2.chat.launched") : live ? i18n.t("v2.chat.kickedOff") : i18n.t("v2.chat.ran")} ${subjects || i18n.t("v2.chat.subagents")}`;

  const status = live
    ? working > 0
      ? i18n.t("chat.timeline.agentsWorking", { count: working })
      : i18n.t("chat.timeline.agentWorking")
    : coordinatorStatus === "failed"
      ? i18n.t("chat.ui.workflowFailed")
      : coordinatorStatus === "cancelled" || coordinatorStatus === "interrupted"
        ? i18n.t("chat.ui.workflowStopped")
        : failed > 0
          ? i18n.t("chat.timeline.agentsFailed", { count: failed })
          : stopped > 0
            ? i18n.t("chat.timeline.agentsStopped", { count: stopped })
            : idle > 0
              ? i18n.t("agents.countIdle", { count: idle })
              : coordinatorStatus !== "completed" &&
                  (agents.length === 0 || agents.length < agentCount)
                ? i18n.t("chat.ui.statusUnavailable")
                : i18n.t("chat.ui.completedMessage");
  const tone = live
    ? "working"
    : failed > 0 || coordinatorStatus === "failed"
      ? "failed"
      : status === i18n.t("chat.ui.completedMessage")
        ? "completed"
        : "inactive";
  return { live, lead, status, tone };
}
