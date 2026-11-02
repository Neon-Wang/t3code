import type {
  GitRunStackedActionInput,
  GitStackedAction,
  VcsStatusResult,
} from "@t3tools/contracts";
import { i18n } from "@t3tools/shared/i18n";
import { type ChangeRequestTerminology, sourceControlClients } from "../sourceControlClients.ts";

export type GitActionIconName = "commit" | "push" | "pr";

export type GitDialogAction = "commit" | "push" | "create_pr";

export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog" | "open_pr";
  dialogAction?: GitDialogAction;
}

export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_pr" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
}

export interface DefaultBranchActionDialogCopy {
  title: string;
  description: string;
  continueLabel: string;
}

export type DefaultBranchConfirmableAction =
  | "push"
  | "create_pr"
  | "commit_push"
  | "commit_push_pr";

export type GitActionRequestInput = Pick<
  GitRunStackedActionInput,
  "action" | "commitMessage" | "featureBranch" | "filePaths"
>;

export function changeRequestTerminologyFor(
  gitStatus: VcsStatusResult | null,
): ChangeRequestTerminology {
  return sourceControlClients.get(gitStatus?.sourceControlProvider?.kind).changeRequest;
}

export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasOriginRemote = true,
): GitActionMenuItem[] {
  if (!gitStatus) return [];
  const terminology = changeRequestTerminologyFor(gitStatus);

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isBehind = gitStatus.behindCount > 0;
  const canPushWithoutUpstream = hasOriginRemote && !gitStatus.hasUpstream;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasOpenPr &&
    (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0 &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canOpenPr = !isBusy && hasOpenPr;

  return [
    {
      id: "commit",
      label: i18n.t("branchToolbar.git.commit"),
      disabled: !canCommit,
      icon: "commit",
      kind: "open_dialog",
      dialogAction: "commit",
    },
    {
      id: "push",
      label: i18n.t("branchToolbar.git.push"),
      disabled: !canPush,
      icon: "push",
      kind: "open_dialog",
      dialogAction: "push",
    },
    hasOpenPr
      ? {
          id: "pr",
          label: i18n.t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
          disabled: !canOpenPr,
          icon: "pr",
          kind: "open_pr",
        }
      : {
          id: "pr",
          label: i18n.t("branchToolbar.git.createRequest", { request: terminology.shortLabel }),
          disabled: !canCreatePr,
          icon: "pr",
          kind: "open_dialog",
          dialogAction: "create_pr",
        },
  ];
}

export function resolveQuickAction(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  isDefaultBranch = false,
  hasOriginRemote = true,
): GitQuickAction {
  if (isBusy) {
    return {
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      hint: i18n.t("branchToolbar.git.gitActionInProgress"),
    };
  }

  if (!gitStatus) {
    return {
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      hint: i18n.t("branchToolbar.git.gitStatusIsUnavailable"),
    };
  }

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;
  const isDiverged = isAhead && isBehind;
  const terminology = changeRequestTerminologyFor(gitStatus);

  if (!hasBranch) {
    return {
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      hint: i18n.t("shared.gitActions.createBranchBeforeOpening", {
        request: terminology.shortLabelWithArticle,
      }),
    };
  }

  if (hasChanges) {
    if (isBehind || (!gitStatus.hasUpstream && !hasOriginRemote)) {
      return {
        label: i18n.t("branchToolbar.git.commit"),
        disabled: false,
        kind: "run_action",
        action: "commit",
      };
    }
    if (hasOpenPr || isDefaultBranch) {
      return {
        label: i18n.t("branchToolbar.git.commitPush"),
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    }
    return {
      label: i18n.t("branchToolbar.git.commitPushRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (!gitStatus.hasUpstream) {
    if (!hasOriginRemote) {
      if (hasOpenPr && !isAhead) {
        return {
          label: i18n.t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
          disabled: false,
          kind: "open_pr",
        };
      }
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: true,
        kind: "show_hint",
        hint: i18n.t("shared.gitActions.addOriginBeforePushingOrCreating", {
          request: terminology.shortLabelWithArticle,
        }),
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return {
          label: i18n.t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
          disabled: false,
          kind: "open_pr",
        };
      }
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: true,
        kind: "show_hint",
        hint: i18n.t("branchToolbar.git.noLocalCommitsToPush"),
      };
    }
    if (hasOpenPr || isDefaultBranch) {
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultBranch ? "commit_push" : "push",
      };
    }
    return {
      label: i18n.t("branchToolbar.git.pushCreateRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (isDiverged) {
    return {
      label: i18n.t("shared.gitActions.syncBranch"),
      disabled: true,
      kind: "show_hint",
      hint: i18n.t("branchToolbar.git.branchHasDivergedFromUpstreamRebaseMergeFirst"),
    };
  }

  if (isBehind) {
    return {
      label: i18n.t("branchToolbar.git.pull"),
      disabled: false,
      kind: "run_pull",
    };
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultBranch) {
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultBranch ? "commit_push" : "push",
      };
    }
    return {
      label: i18n.t("branchToolbar.git.pushCreateRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (hasOpenPr && gitStatus.hasUpstream) {
    return {
      label: i18n.t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "open_pr",
    };
  }

  return {
    label: i18n.t("branchToolbar.git.commit"),
    disabled: true,
    kind: "show_hint",
    hint: i18n.t("branchToolbar.git.branchIsUpToDateNoActionNeeded"),
  };
}

export function getGitActionDisabledReason(input: {
  item: GitActionMenuItem;
  gitStatus: VcsStatusResult | null;
  isBusy: boolean;
  hasOriginRemote: boolean;
}): string | null {
  const { item, gitStatus, isBusy, hasOriginRemote } = input;
  if (!item.disabled) return null;
  if (isBusy) return i18n.t("branchToolbar.git.gitActionInProgress");
  if (!gitStatus) return i18n.t("branchToolbar.git.gitStatusIsUnavailable");

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;
  const terminology = changeRequestTerminologyFor(gitStatus);

  if (item.id === "commit") {
    if (!hasChanges) {
      return i18n.t("branchToolbar.git.worktreeIsCleanMakeChangesBeforeCommitting");
    }
    return i18n.t("branchToolbar.git.commitIsCurrentlyUnavailable");
  }

  if (item.id === "push") {
    if (!hasBranch) {
      return i18n.t("shared.gitActions.detachedBeforePushing");
    }
    if (hasChanges) {
      return i18n.t("branchToolbar.git.commitOrStashLocalChangesBeforePushing");
    }
    if (isBehind) {
      return i18n.t("branchToolbar.git.branchIsBehindUpstreamPullRebaseBeforePushing");
    }
    if (!gitStatus.hasUpstream && !hasOriginRemote) {
      return i18n.t("shared.gitActions.addOriginBeforePushing");
    }
    if (!isAhead) {
      return i18n.t("branchToolbar.git.noLocalCommitsToPush");
    }
    return i18n.t("branchToolbar.git.pushIsCurrentlyUnavailable");
  }

  if (hasOpenPr) {
    return i18n.t("shared.gitActions.viewUnavailable", { request: terminology.shortLabel });
  }
  if (!hasBranch) {
    return i18n.t("shared.gitActions.detachedBeforeCreating", {
      request: terminology.shortLabelWithArticle,
    });
  }
  if (!gitStatus.hasUpstream && !hasOriginRemote) {
    return i18n.t("shared.gitActions.addOriginBeforeCreating", {
      request: terminology.shortLabelWithArticle,
    });
  }
  if ((gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) <= 0) {
    return i18n.t("shared.gitActions.noCommitsToInclude", {
      request: terminology.shortLabelWithArticle,
    });
  }
  if (isBehind) {
    return i18n.t("shared.gitActions.behindBeforeCreating", {
      request: terminology.shortLabelWithArticle,
    });
  }
  return i18n.t("shared.gitActions.createUnavailable", { request: terminology.shortLabel });
}

export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultBranch: boolean,
): boolean {
  if (!isDefaultBranch) return false;
  return (
    action === "push" ||
    action === "create_pr" ||
    action === "commit_push" ||
    action === "commit_push_pr"
  );
}

export function resolveDefaultBranchActionDialogCopy(input: {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  terminology: ChangeRequestTerminology;
}): DefaultBranchActionDialogCopy {
  const branchLabel = input.branchName;
  const { shortLabel, shortLabelWithArticle } = input.terminology;
  const suffix = i18n.t("shared.gitActions.defaultBranchSuffix", { branch: branchLabel });

  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: i18n.t("shared.gitActions.commitPushToDefaultBranch"),
        description: i18n.t("integration.commitPushSuffix", { suffix }),
        continueLabel: i18n.t("branchToolbar.git.commitPushToBranch", { branch: branchLabel }),
      };
    }
    return {
      title: i18n.t("shared.gitActions.pushToDefaultBranch"),
      description: i18n.t("integration.pushSuffix", { suffix }),
      continueLabel: i18n.t("branchToolbar.git.pushToBranch", { branch: branchLabel }),
    };
  }

  if (input.includesCommit) {
    return {
      title: i18n.t("shared.gitActions.commitPushCreateFromDefaultBranch", { request: shortLabel }),
      description: i18n.t("shared.gitActions.commitPushCreateDescription", {
        request: shortLabelWithArticle,
        suffix,
      }),
      continueLabel: i18n.t("branchToolbar.git.commitPushCreateRequest", { request: shortLabel }),
    };
  }
  return {
    title: i18n.t("shared.gitActions.pushCreateFromDefaultBranch", { request: shortLabel }),
    description: i18n.t("shared.gitActions.pushCreateDescription", {
      request: shortLabelWithArticle,
      suffix,
    }),
    continueLabel: i18n.t("branchToolbar.git.pushCreateRequest", { request: shortLabel }),
  };
}
