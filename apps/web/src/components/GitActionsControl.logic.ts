import { i18n } from "@t3tools/shared/i18n";
import type {
  GitRunStackedActionResult,
  GitStackedAction,
  VcsStatusResult,
} from "@t3tools/contracts";
import { isTemporaryWorktreeBranch } from "@t3tools/shared/git";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export type GitActionIconName = "commit" | "push" | "pr";

export type GitDialogAction = "commit" | "push" | "create_pr";

export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog";
  dialogAction?: GitDialogAction;
}

export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_publish" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
  icon?: GitActionIconName;
}

export interface DefaultBranchActionDialogCopy {
  title: string;
  description: string;
  continueLabel: string;
}

export interface GitActionProgressPresentation {
  readonly status: string;
  readonly output: string | null;
  readonly startedAtMs: number | null;
}

export interface GitActionResultToastTiming {
  readonly timeout: 0;
  readonly dismissAfterVisibleMs: number | null;
}

export type DefaultBranchConfirmableAction =
  | "push"
  | "create_pr"
  | "commit_push"
  | "commit_push_pr";

export const GIT_ACTION_SUCCESS_VISIBLE_MS = 10_000;

export function resolveGitActionResultToastTiming(
  type: "error" | "success",
): GitActionResultToastTiming {
  return {
    timeout: 0,
    dismissAfterVisibleMs: type === "success" ? GIT_ACTION_SUCCESS_VISIBLE_MS : null,
  };
}

function resolveChangeRequestTerminology(
  gitStatus: VcsStatusResult | null,
): ChangeRequestTerminology {
  return sourceControlClients.get(gitStatus?.sourceControlProvider?.kind).changeRequest;
}

export function resolveGitActionProgressPresentation(input: {
  readonly isRunning: boolean;
  readonly operation: string | null;
  readonly currentLabel: string | null;
  readonly lastOutputLine: string | null;
  readonly phaseStartedAtMs: number | null;
  readonly hookStartedAtMs: number | null;
}): GitActionProgressPresentation | null {
  if (
    !input.isRunning ||
    (input.operation !== "run_change_request" && input.operation !== "pull")
  ) {
    return null;
  }

  const currentLabel = input.currentLabel?.trim();
  const output = input.lastOutputLine?.trim();
  const isPull = input.operation === "pull";
  return {
    status:
      currentLabel && currentLabel !== "Running source control action"
        ? currentLabel
        : isPull
          ? "Pulling latest changes..."
          : "Starting source control action...",
    output: !isPull && output ? output : null,
    startedAtMs: isPull
      ? input.phaseStartedAtMs
      : (input.hookStartedAtMs ?? input.phaseStartedAtMs),
  };
}

export function formatGitActionElapsed(startedAtMs: number | null, nowMs: number): string | null {
  if (startedAtMs === null) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (elapsedSeconds < 60) {
    return i18n.t("sidebar.secondsS", { seconds: elapsedSeconds });
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return i18n.t("sidebar.minutesMSecondsS", { minutes: minutes, seconds: seconds });
}

export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasPrimaryRemote = true,
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
    !hasOpenPr &&
    hasDefaultBranchDelta &&
    !isBehind &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);

  const commitItem: GitActionMenuItem = {
    id: "commit",
    label: i18n.t("branchToolbar.git.commit"),
    disabled: !canCommit,
    icon: "commit",
    kind: "open_dialog",
    dialogAction: "commit",
  };

  if (!hasPrimaryRemote) {
    return [commitItem];
  }

  const pushItem: GitActionMenuItem = {
    id: "push",
    label: i18n.t("branchToolbar.git.push"),
    disabled: !canPush,
    icon: "push",
    kind: "open_dialog",
    dialogAction: "push",
  };

  if (hasOpenPr) {
    return [commitItem, pushItem];
  }

  return [
    commitItem,
    pushItem,
    {
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
  isDefaultRef = false,
  hasPrimaryRemote = true,
): GitQuickAction {
  if (isBusy) {
    return {
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      icon: "commit",
      hint: i18n.t("branchToolbar.git.gitActionInProgress"),
    };
  }

  if (!gitStatus) {
    return {
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      icon: "commit",
      hint: i18n.t("branchToolbar.git.gitStatusIsUnavailable"),
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
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      icon: "commit",
      hint: i18n.t("branchToolbar.git.createAndCheckoutARefBeforePushingOrOpening", {
        request: terminology.singular,
      }),
    };
  }

  if (hasChanges) {
    if (!gitStatus.hasUpstream && !hasPrimaryRemote) {
      return {
        label: i18n.t("branchToolbar.git.commit"),
        disabled: false,
        kind: "run_action",
        action: "commit",
      };
    }
    if (hasOpenPr || isDefaultRef) {
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
    if (!hasPrimaryRemote) {
      return {
        label: i18n.t("branchToolbar.git.publishRepository"),
        disabled: false,
        kind: "open_publish",
      };
    }
    if (!isAhead) {
      if (hasOpenPr) {
        return {
          label: i18n.t("branchToolbar.git.commit"),
          disabled: true,
          kind: "show_hint",
          icon: "commit",
          hint: i18n.t("branchToolbar.git.branchIsUpToDateNoActionNeeded"),
        };
      }
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: true,
        kind: "show_hint",
        icon: "push",
        hint: i18n.t("branchToolbar.git.noLocalCommitsToPush"),
      };
    }
    if (hasOpenPr || isDefaultRef) {
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
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
      label: i18n.t("branchToolbar.git.syncRef"),
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
    if (hasOpenPr || isDefaultRef) {
      return {
        label: i18n.t("branchToolbar.git.push"),
        disabled: false,
        kind: "run_action",
        action: isDefaultRef ? "commit_push" : "push",
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
      label: i18n.t("branchToolbar.git.commit"),
      disabled: true,
      kind: "show_hint",
      icon: "commit",
      hint: i18n.t("branchToolbar.git.branchIsUpToDateNoActionNeeded"),
    };
  }

  if (hasDefaultBranchDelta && !isDefaultRef) {
    return {
      label: i18n.t("branchToolbar.git.createRequest", { request: terminology.shortLabel }),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }

  return {
    label: i18n.t("branchToolbar.git.commit"),
    disabled: true,
    kind: "show_hint",
    icon: "commit",
    hint: i18n.t("branchToolbar.git.branchIsUpToDateNoActionNeeded"),
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

export function resolveDefaultBranchActionDialogCopy(input: {
  action: DefaultBranchConfirmableAction;
  branchName: string;
  includesCommit: boolean;
  terminology?: ChangeRequestTerminology;
}): DefaultBranchActionDialogCopy {
  const branchLabel = input.branchName;
  const suffix = ` on "${branchLabel}". You can continue on this ref or create a feature ref and run the same action there.`;
  const terminology = input.terminology ?? sourceControlClients.get(undefined).changeRequest;

  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: i18n.t("branchToolbar.git.commitPushToDefaultRef"),
        description: i18n.t("integration.commitPushSuffix", { suffix: suffix }),
        continueLabel: i18n.t("branchToolbar.git.commitPushToBranch", { branch: branchLabel }),
      };
    }
    return {
      title: i18n.t("branchToolbar.git.pushToDefaultRef"),
      description: i18n.t("integration.pushSuffix", { suffix: suffix }),
      continueLabel: i18n.t("branchToolbar.git.pushToBranch", { branch: branchLabel }),
    };
  }

  if (input.includesCommit) {
    return {
      title: i18n.t("branchToolbar.git.commitPushCreateRequestFromDefaultRef", {
        request: terminology.shortLabel,
      }),
      description: i18n.t("integration.commitCreatePrSuffix", {
        kind: terminology.singular,
        suffix: suffix,
      }),
      continueLabel: i18n.t("branchToolbar.git.commitPushCreateRequest", {
        request: terminology.shortLabel,
      }),
    };
  }
  return {
    title: i18n.t("branchToolbar.git.pushCreateRequestFromDefaultRef", {
      request: terminology.shortLabel,
    }),
    description: i18n.t("integration.pushCreatePrSuffix", {
      kind: terminology.singular,
      suffix: suffix,
    }),
    continueLabel: i18n.t("branchToolbar.git.pushCreateRequest", {
      request: terminology.shortLabel,
    }),
  };
}

/**
 * Why the default-ref dialog cannot check out a feature branch, or null when it can.
 * The server names that branch from the uncommitted changes, so a clean tree cannot use it.
 */
export function resolveFeatureBranchUnavailableReason(input: {
  branchName: string;
  hasWorkingTreeChanges: boolean;
}): string | null {
  if (input.hasWorkingTreeChanges) return null;
  return `There are no changes to commit, so a feature branch can't be named. Create a branch yourself or continue on ${input.branchName}.`;
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

export { resolveAutoFeatureBranchName } from "@t3tools/shared/git";
