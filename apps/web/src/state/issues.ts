import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";
import { connectionAtomRuntime } from "../connection/runtime";
import { createMergedEnvironmentQuery } from "./mergedEnvironmentQuery";

export const issueEnvironment = createIssueEnvironmentAtoms(connectionAtomRuntime);
export const useIssueLists = createMergedEnvironmentQuery("web-issues:list", issueEnvironment.list);
export const useIssueFilterOptions = createMergedEnvironmentQuery(
  "web-issues:filters",
  issueEnvironment.filterOptions,
);
export const useIssueActivities = createMergedEnvironmentQuery(
  "web-issues:activity",
  issueEnvironment.activity,
);
