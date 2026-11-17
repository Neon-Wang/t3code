import { EnvironmentId, ProjectId, type IssueListEntry } from "@t3tools/contracts";
import { i18n } from "@t3tools/shared/i18n";

export type IssueParams = {
  readonly environmentId: string;
  readonly projectId: string;
  readonly repository: string;
  readonly number: number;
  readonly host?: string;
  readonly initialSummary?: IssueListEntry;
};
export function issueTarget(params: IssueParams) {
  return {
    environmentId: EnvironmentId.make(params.environmentId),
    input: {
      projectId: ProjectId.make(params.projectId),
      repository: params.repository,
      number: params.number,
      ...(params.host ? { host: params.host } : {}),
    },
  };
}
export function issueStatus(issue: Pick<IssueListEntry, "state" | "closeReason">) {
  return issue.state === "open"
    ? {
        icon: "circle" as const,
        tint: "accent-adaptive-emerald-600-400",
        label: i18n.t("pr.stateOpen"),
      }
    : {
        icon: "checkmark.circle" as const,
        tint:
          issue.closeReason === "not_planned"
            ? "accent-icon-muted"
            : "accent-adaptive-violet-600-400",
        label: i18n.t(
          issue.closeReason === "not_planned" ? "issue.closedNotPlanned" : "issue.closedCompleted",
        ),
      };
}
