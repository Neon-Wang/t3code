import { i18n, type I18n } from "@t3tools/shared/i18n";
import {
  isActiveSubagentStatus,
  isTerminalSubagentStatus,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

/** Summarize observed states without treating idle or missing agents as completed. */
export function deriveAgentSpawnSummary(
  {
    agents,
    agentCount,
    coordinatorStatus,
  }: {
    agents: ReadonlyArray<Pick<RuntimeSubagent, "kind" | "status">>;
    agentCount: number;
    coordinatorStatus?: RuntimeSubagent["status"] | undefined;
  },
  t: I18n["t"] = i18n.t,
) {
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
      ? t(individuals === 1 ? "chat.timeline.subagentOne" : "chat.timeline.subagentMany", {
          count: individuals,
        })
      : null,
    batches > 0
      ? t(
          individuals > 0
            ? batches === 1
              ? "chat.timeline.batchOne"
              : "chat.timeline.batchMany"
            : batches === 1
              ? "chat.timeline.agentBatchOne"
              : "chat.timeline.agentBatchMany",
          { count: batches },
        )
      : null,
  ]
    .filter(Boolean)
    .join(t("chat.timeline.tools.and"));
  const lead = t(
    batches > 0
      ? "chat.timeline.launchedAgents"
      : live
        ? "chat.timeline.startedAgents"
        : "chat.timeline.ranAgents",
    { subjects: subjects || t("chat.timeline.subagents") },
  );

  const status = live
    ? working > 0
      ? t("chat.timeline.agentsWorking", { count: working })
      : t("chat.timeline.agentWorking")
    : coordinatorStatus === "failed"
      ? t("chat.ui.workflowFailed")
      : coordinatorStatus === "cancelled" || coordinatorStatus === "interrupted"
        ? t("chat.ui.workflowStopped")
        : failed > 0
          ? t("chat.timeline.agentsFailed", { count: failed })
          : stopped > 0
            ? t("chat.timeline.agentsStopped", { count: stopped })
            : idle > 0
              ? t("agents.countIdle", { count: idle })
              : coordinatorStatus !== "completed" &&
                  (agents.length === 0 || agents.length < agentCount)
                ? t("chat.ui.statusUnavailable")
                : t("chat.ui.completedMessage");
  const tone = live
    ? "working"
    : failed > 0 || coordinatorStatus === "failed"
      ? "failed"
      : status === t("chat.ui.completedMessage")
        ? "completed"
        : "inactive";
  return { live, lead, status, tone };
}
