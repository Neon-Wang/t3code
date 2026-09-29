import { i18n } from "@t3tools/shared/i18n";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  VcsStatusResult,
} from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import {
  DEFAULT_CHANGE_REQUEST_TERMINOLOGY,
  getChangeRequestTerminology,
  type ChangeRequestTerminology,
} from "../sourceControlPresentation";

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
  kind: "run_action" | "run_pull" | "open_pr" | "open_publish" | "show_hint";
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

function resolveChangeRequestTerminology(
  gitStatus: VcsStatusResult | null,
): ChangeRequestTerminology {
  return gitStatus?.sourceControlProvider
    ? getChangeRequestTerminology(gitStatus.sourceControlProvider)
    : DEFAULT_CHANGE_REQUEST_TERMINOLOGY;
}

export function buildGitActionProgressStages(
  input: {
    action: GitStackedAction;
    hasCustomCommitMessage: boolean;
    hasWorkingTreeChanges: boolean;
    pushTarget?: string;
    featureBranch?: boolean;
    shouldPushBeforePr?: boolean;
    terminology?: ChangeRequestTerminology;
  },
  t = i18n.t,
): string[] {
  const terminology = input.terminology ?? DEFAULT_CHANGE_REQUEST_TERMINOLOGY;
  const branchStages = input.featureBranch ? [t("branchToolbar.git.preparingFeatureRef")] : [];
  const pushStage = input.pushTarget
    ? t("branchToolbar.git.pushingToTarget", { target: input.pushTarget })
    : t("branchToolbar.git.pushing");
  const prStages = [
    t("branchToolbar.git.preparingRequest", { request: terminology.shortLabel }),
    t("branchToolbar.git.generatingRequestContent", { request: terminology.shortLabel }),
    t("branchToolbar.git.creatingRequest", {
      request: localizedChangeRequestName(terminology.singular, t),
    }),
  ];

  if (input.action === "push") {
    return [pushStage];
  }
  if (input.action === "create_pr") {
    return input.shouldPushBeforePr ? [pushStage, ...prStages] : prStages;
  }

  const shouldIncludeCommitStages = input.action === "commit" || input.hasWorkingTreeChanges;
  const commitStages = !shouldIncludeCommitStages
    ? []
    : input.hasCustomCommitMessage
      ? [t("branchToolbar.git.committing")]
      : [t("branchToolbar.git.generatingCommitMessage"), t("branchToolbar.git.committing")];
  if (input.action === "commit") {
    return [...branchStages, ...commitStages];
  }
  if (input.action === "commit_push") {
    return [...branchStages, ...commitStages, pushStage];
  }
  return [...branchStages, ...commitStages, pushStage, ...prStages];
}

export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
  t = i18n.t,
): GitActionMenuItem[] {
  if (!gitStatus) return [];
  const terminology = resolveChangeRequestTerminology(gitStatus);

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isBehind = gitStatus.behindCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const canPushWithoutUpstream = hasPrimaryRemote && !gitStatus.hasUpstream;
  const canCommit = !isBusy && hasChanges;
  const canPush =
    !isBusy &&
    hasBranch &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !hasOpenPr &&
    hasDefaultBranchDelta &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canOpenPr = !isBusy && hasOpenPr;

  const commitItem: GitActionMenuItem = {
    id: "commit",
    label: t("branchToolbar.git.commit"),
    disabled: !canCommit,
    icon: "commit",
    kind: "open_dialog",
    dialogAction: "commit",
  };

  if (!hasPrimaryRemote) {
    return [commitItem];
  }

  return [
    commitItem,
    {
      id: "push",
      label: t("branchToolbar.git.push"),
      disabled: !canPush,
      icon: "push",
      kind: "open_dialog",
      dialogAction: "push",
    },
    hasOpenPr
      ? {
          id: "pr",
          label: t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
          disabled: !canOpenPr,
          icon: "pr",
          kind: "open_pr",
        }
      : {
          id: "pr",
          label: t("branchToolbar.git.createRequest", { request: terminology.shortLabel }),
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
  isDefaultRef = false,
  hasPrimaryRemote = true,
  t = i18n.t,
): GitQuickAction {
  if (isBusy) {
    return {
      label: t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      hint: t("branchToolbar.git.gitActionInProgress"),
    };
  }

  if (!gitStatus) {
    return {
      label: t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      hint: t("branchToolbar.git.gitStatusIsUnavailable"),
    };
  }

  const hasBranch = gitStatus.refName !== null;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const hasDefaultBranchDelta = (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0;
  const isBehind = gitStatus.behindCount > 0;
  const isDiverged = isAhead && isBehind;
  const terminology = resolveChangeRequestTerminology(gitStatus);

  if (!hasBranch) {
    return {
      label: t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      hint: t("branchToolbar.git.createAndCheckoutARefBeforePushingOrOpening", {
        request: localizedChangeRequestName(terminology.singular, t),
      }),
    };
  }

  if (hasChanges) {
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return {
        label: t("branchToolbar.git.commit"),
        disabled: false,
        kind: "run_action",
        action: "commit",
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t("branchToolbar.git.commitPush"),
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    }
    return {
      label: t("branchToolbar.git.commitPushRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }

  if (!gitStatus.hasUpstream) {
    if (!hasPrimaryRemote) {
      if (hasOpenPr && !isAhead) {
        return {
          label: t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
          disabled: false,
          kind: "open_pr",
        };
      }
      return {
        label: t("branchToolbar.git.publishRepository"),
        disabled: false,
        kind: "open_publish",
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return {
          label: t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
          disabled: false,
          kind: "open_pr",
        };
      }
      return {
        label: t("branchToolbar.git.push"),
        disabled: true,
        kind: "show_hint",
        hint: t("branchToolbar.git.noLocalCommitsToPush"),
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t("branchToolbar.git.push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: t("branchToolbar.git.pushCreateRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (isDiverged) {
    return {
      label: t("branchToolbar.git.syncRef"),
      disabled: true,
      kind: "show_hint",
      hint: t("branchToolbar.git.branchHasDivergedFromUpstreamRebaseMergeFirst"),
    };
  }

  if (isBehind) {
    return {
      label: t("branchToolbar.git.pull"),
      disabled: false,
      kind: "run_pull",
    };
  }

  if (isAhead) {
    if (hasOpenPr || isDefaultRef) {
      return {
        label: t("branchToolbar.git.push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
      };
    }
    return {
      label: t("branchToolbar.git.pushCreateRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  if (hasOpenPr && gitStatus.hasUpstream) {
    return {
      label: t("branchToolbar.git.viewRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "open_pr",
    };
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: t("branchToolbar.git.createRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  return {
    label: t("branchToolbar.git.commit"),
    disabled: true,
    kind: "show_hint",
    hint: t("branchToolbar.git.branchIsUpToDateNoActionNeeded"),
  };
}

export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultRef: boolean,
): boolean {
  if (!isDefaultRef) return false;
  return (
    action === "push" ||
    action === "create_pr" ||
    action === "commit_push" ||
    action === "commit_push_pr"
  );
}

export function resolveDefaultBranchActionDialogCopy(
  input: {
    action: DefaultBranchConfirmableAction;
    branchName: string;
    includesCommit: boolean;
    terminology?: ChangeRequestTerminology;
  },
  t = i18n.t,
): DefaultBranchActionDialogCopy {
  const branchLabel = input.branchName;

  const terminology = input.terminology ?? DEFAULT_CHANGE_REQUEST_TERMINOLOGY;

  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: t("branchToolbar.git.commitPushToDefaultRef"),
        description: t("branchToolbar.git.thisActionWillCommitAndPushChangesOnBranch", {
          branch: branchLabel,
        }),
        continueLabel: t("branchToolbar.git.commitPushToBranch", { branch: branchLabel }),
      };
    }
    return {
      title: t("branchToolbar.git.pushToDefaultRef"),
      description: t("branchToolbar.git.thisActionWillPushLocalCommitsOnBranchYou", {
        branch: branchLabel,
      }),
      continueLabel: t("branchToolbar.git.pushToBranch", { branch: branchLabel }),
    };
  }

  if (input.includesCommit) {
    return {
      title: t("branchToolbar.git.commitPushCreateRequestFromDefaultRef", {
        request: terminology.shortLabel,
      }),
      description: t("branchToolbar.git.thisActionWillCommitPushAndCreateARequest", {
        branch: branchLabel,
        request: localizedChangeRequestName(terminology.singular, t),
      }),
      continueLabel: t("branchToolbar.git.commitPushCreateRequest", {
        request: terminology.shortLabel,
      }),
    };
  }
  return {
    title: t("branchToolbar.git.pushCreateRequestFromDefaultRef", {
      request: terminology.shortLabel,
    }),
    description: t("branchToolbar.git.thisActionWillPushLocalCommitsAndCreateA", {
      branch: branchLabel,
      request: localizedChangeRequestName(terminology.singular, t),
    }),
    continueLabel: t("branchToolbar.git.pushCreateRequest", { request: terminology.shortLabel }),
  };
}

export function resolveThreadBranchUpdate(
  result: GitRunStackedActionResult,
): { branch: string } | null {
  if (result.branch.status !== "created" || !result.branch.name) {
    return null;
  }

  return {
    branch: result.branch.name,
  };
}

export function resolveThreadBranchMetadataPatch(
  branch: string | null,
  expectedBranch: string | null,
): {
  branch: string | null;
  expectedBranch: string | null;
} {
  return { branch, expectedBranch };
}

export function resolveLiveThreadBranchUpdate(input: {
  threadBranch: string | null;
  gitStatus: VcsStatusResult | null;
}): { branch: string | null } | null {
  if (!input.gitStatus) {
    return null;
  }

  if (input.gitStatus.refName === null && input.threadBranch !== null) {
    return null;
  }

  if (input.threadBranch === input.gitStatus.refName) {
    return null;
  }

  if (
    input.threadBranch !== null &&
    input.gitStatus.refName !== null &&
    !isTemporaryWorktreeBranch(input.threadBranch) &&
    isTemporaryWorktreeBranch(input.gitStatus.refName)
  ) {
    return null;
  }

  return {
    branch: input.gitStatus.refName,
  };
}

// Re-export from shared for backwards compatibility in this module's exports
export { resolveAutoFeatureBranchName } from "@t3tools/shared/git";

export function localizedChangeRequestName(name: string, t = i18n.t): string {
  return name === "pull request"
    ? t("pr.pullRequest")
    : name === "merge request"
      ? t("pr.mergeRequest")
      : name;
}
