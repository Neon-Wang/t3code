import {
  WS_METHODS,
  IssueListResult,
  IssueDetail,
  IssueActivity,
  IssueFilterOptions,
  PullRequestLabelCandidateList,
  IssueAssigneeCandidateList,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";
import { persistQuery } from "./queryPersistence.ts";

export function createIssueEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const refreshes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:issues:refreshes",
    tag: WS_METHODS.issuesSubscribeRefreshes,
  });
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial",
    key: ({ environmentId }: { environmentId: string }) => environmentId,
  } as const;
  return {
    refreshes,
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:list",
      tag: WS_METHODS.issuesList,
      persistence: persistQuery(IssueListResult),
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => refreshes({ environmentId, input: {} }),
    }),
    detail: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:detail",
      tag: WS_METHODS.issuesDetail,
      persistence: persistQuery(IssueDetail),
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => refreshes({ environmentId, input: {} }),
    }),
    activity: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:activity",
      tag: WS_METHODS.issuesActivity,
      persistence: persistQuery(IssueActivity),
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => refreshes({ environmentId, input: {} }),
    }),
    filterOptions: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:filterOptions",
      tag: WS_METHODS.issuesFilterOptions,
      persistence: persistQuery(IssueFilterOptions),
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => refreshes({ environmentId, input: {} }),
    }),
    labelCandidates: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:labelCandidates",
      tag: WS_METHODS.issuesLabelCandidates,
      persistence: persistQuery(PullRequestLabelCandidateList),
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => refreshes({ environmentId, input: {} }),
    }),
    assigneeCandidates: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:issues:assigneeCandidates",
      tag: WS_METHODS.issuesAssigneeCandidates,
      persistence: persistQuery(IssueAssigneeCandidateList),
      staleTimeMs: 60_000,
      refreshTrigger: ({ environmentId }) => refreshes({ environmentId, input: {} }),
    }),
    comment: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:comment",
      tag: WS_METHODS.issuesComment,
      scheduler,
      concurrency,
    }),
    updateComment: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:updateComment",
      tag: WS_METHODS.issuesUpdateComment,
      scheduler,
      concurrency,
    }),
    setReaction: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:setReaction",
      tag: WS_METHODS.issuesSetReaction,
      scheduler,
      concurrency,
    }),
    update: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:update",
      tag: WS_METHODS.issuesUpdate,
      scheduler,
      concurrency,
    }),
    setLabels: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:setLabels",
      tag: WS_METHODS.issuesSetLabels,
      scheduler,
      concurrency,
    }),
    setAssignees: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:setAssignees",
      tag: WS_METHODS.issuesSetAssignees,
      scheduler,
      concurrency,
    }),
    invalidate: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:issues:invalidate",
      tag: WS_METHODS.issuesInvalidate,
      scheduler,
      concurrency,
    }),
  };
}
