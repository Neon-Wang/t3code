import type { ComponentProps } from "react";
import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import { useI18n } from "../../hooks/useI18n";
import { ListColumn } from "../sourceControl/ListColumn";
import { INVOLVEMENT_TABS, STATE_TABS } from "./pullRequestListOptions";

export function PullRequestsColumn(
  props: Omit<
    ComponentProps<typeof ListColumn<PullRequestListState, PullRequestInvolvement>>,
    | "scopeLabel"
    | "breadcrumbLabel"
    | "title"
    | "area"
    | "stateOptions"
    | "involvementOptions"
    | "searchLabel"
    | "refreshLabel"
  >,
) {
  const { t } = useI18n();
  return (
    <ListColumn
      {...props}
      scopeLabel={t("pr.pullRequestScope")}
      breadcrumbLabel={t("pr.pullRequestsBreadcrumb")}
      title={t("v2.shared.status37")}
      area="pull-requests"
      stateOptions={STATE_TABS}
      involvementOptions={INVOLVEMENT_TABS}
      searchLabel={t("pr.searchPullRequests")}
      refreshLabel={t("pr.refreshPullRequests")}
    />
  );
}
