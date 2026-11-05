import { i18n } from "@t3tools/shared/i18n";
import {
  sourceControlClients,
  type ChangeRequestTerminology,
} from "@t3tools/client-runtime/source-control-clients";
import type {
  PullRequestAction,
  PullRequestDetail,
  PullRequestMergeMethod,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import type { AppSymbolName } from "../../components/ui/AppSymbol";
import { PullRequestGlyph } from "./pullRequestGlyphs";

type ActionDetail = Pick<
  PullRequestDetail,
  "state" | "isDraft" | "mergeability" | "autoMergeEnabled" | "workflowApprovalsRequired"
> & {
  readonly capabilities: Pick<
    PullRequestDetail["capabilities"],
    "actions" | "mergeMethods" | "updateMethods" | "deleteBranch"
  >;
  readonly viewerPermissions: Pick<
    PullRequestDetail["viewerPermissions"],
    "actions" | "updateMethods"
  >;
  readonly mergeCapabilities: PullRequestDetail["mergeCapabilities"];
};

export const MERGE_METHODS = {
  squash: {
    get title() {
      return i18n.t("mobile.pullRequestActions.squashAndMerge");
    },
    get description() {
      return i18n.t("mobile.pullRequestActions.combineTheCommitsIntoOneCommit");
    },
  },
  merge: {
    get title() {
      return i18n.t("mobile.pullRequestActions.createAMergeCommit");
    },
    get description() {
      return i18n.t("mobile.pullRequestActions.keepTheCommitsAndAddAMergeCommit");
    },
  },
  rebase: {
    get title() {
      return i18n.t("mobile.pullRequestActions.rebaseAndMerge");
    },
    get description() {
      return i18n.t("mobile.pullRequestActions.addTheCommitsWithoutAMergeCommit");
    },
  },
} as const satisfies Record<PullRequestMergeMethod, { title: string; description: string }>;

export function pullRequestActionLabel(
  action: PullRequestAction,
  terminology: ChangeRequestTerminology,
): string {
  switch (action) {
    case "merge":
      return i18n.t("mobile.pullRequestActions.mergeTerm", { term: terminology.singular });
    case "ready":
      return i18n.t("mobile.pullRequestActions.markReady");
    case "draft":
      return i18n.t("pr.convertToDraft");
    case "close":
      return i18n.t("mobile.pullRequestActions.closeTerm", { term: terminology.singular });
    case "reopen":
      return i18n.t("mobile.pullRequestActions.reopenTerm", { term: terminology.singular });
    case "update-branch":
      return i18n.t("pr.updateBranch");
    case "enable-auto-merge":
      return i18n.t("pr.enableAutoMerge");
    case "disable-auto-merge":
      return i18n.t("pr.disableAutoMerge");
    case "revert":
      return i18n.t("mobile.pullRequestActions.createRevertTerm", { term: terminology.singular });
    case "delete-branch":
      return i18n.t("v2.surfaces.copy214");
    case "approve-workflows":
      return i18n.t("mobile.pullRequestStatusRows.approveWorkflows");
  }
}

export const PR_ACTION_ICONS = {
  merge: PullRequestGlyph.merged,
  ready: "checkmark.circle",
  draft: "pencil",
  close: "xmark",
  reopen: "arrow.clockwise",
  "update-branch": "arrow.up.circle",
  "enable-auto-merge": "clock",
  "disable-auto-merge": "xmark",
  revert: "arrow.uturn.backward",
  "delete-branch": "trash",
  "approve-workflows": "checkmark",
} as const satisfies Record<PullRequestAction, AppSymbolName>;

export function allowedMergeMethods(pr: ActionDetail) {
  return pr.capabilities.mergeMethods.filter((method) => pr.mergeCapabilities[method]);
}

export function allowedUpdateMethods(pr: ActionDetail) {
  return (pr.capabilities.updateMethods ?? []).filter((method) =>
    pr.viewerPermissions.updateMethods?.includes(method),
  );
}

export function canPerformPullRequestAction(pr: ActionDetail, action: PullRequestAction) {
  if (!pr.capabilities.actions.includes(action) || !pr.viewerPermissions.actions.includes(action))
    return false;
  if (action === "reopen") return pr.state === "closed";
  if (action === "revert") return pr.state === "merged";
  if (action === "delete-branch")
    return pr.state !== "open" && pr.capabilities.deleteBranch === true;
  if (pr.state !== "open") return false;
  switch (action) {
    case "update-branch":
      return allowedUpdateMethods(pr).length > 0;
    case "approve-workflows":
      return (pr.workflowApprovalsRequired ?? 0) > 0;
    case "ready":
      return pr.isDraft;
    case "draft":
      return !pr.isDraft;
    case "merge":
      return !pr.isDraft && pr.mergeability !== "conflicting" && allowedMergeMethods(pr).length > 0;
    case "enable-auto-merge":
      return !pr.isDraft && pr.autoMergeEnabled === false && allowedMergeMethods(pr).length > 0;
    case "disable-auto-merge":
      return pr.autoMergeEnabled === true;
    default:
      return true;
  }
}

export function mergeUnavailableReason(
  pr: ActionDetail,
  connectionAllowsWrites: boolean,
  terminology: ChangeRequestTerminology,
) {
  if (pr.state === "merged")
    return i18n.t("mobile.pullRequestActions.termHasBeenMerged", { term: terminology.singular });
  if (pr.state === "closed")
    return i18n.t("mobile.pullRequestActions.reopenTermBeforeMerging", {
      term: terminology.singular,
    });
  if (!connectionAllowsWrites) return i18n.t("mobile.pullRequestActions.connectionReadOnly");
  if (!pr.capabilities.actions.includes("merge"))
    return i18n.t("mobile.pullRequestActions.providerNoMerge");
  if (!pr.viewerPermissions.actions.includes("merge"))
    return i18n.t("mobile.pullRequestActions.accountCannotMerge", { term: terminology.singular });
  if (pr.isDraft) return i18n.t("mobile.pullRequestActions.markDraftReadyBeforeMerging");
  if (pr.mergeability === "conflicting")
    return i18n.t("mobile.pullRequestActions.resolveConflictsBeforeMerging");
  if (!allowedMergeMethods(pr).length) return i18n.t("mobile.pullRequestActions.noMergeMethods");
  return null;
}

export const openOnProviderLabel = (provider: SourceControlProviderKind) =>
  i18n.t("branchToolbar.git.openOnProvider", {
    provider: sourceControlClients.get(provider).label,
  });
