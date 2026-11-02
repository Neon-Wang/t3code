import { i18n } from "@t3tools/shared/i18n";
import type {
  PullRequestActivity,
  PullRequestCheck,
  PullRequestChecksState,
  PullRequestDetail,
  PullRequestListEntry,
  PullRequestMergeability,
} from "@t3tools/contracts";
import type { AppSymbolName } from "../../components/ui/AppSymbol";
import { PullRequestGlyph } from "./pullRequestGlyphs";

const STATES = {
  open: {
    get label() {
      return i18n.t("pr.stateOpen");
    },
    icon: PullRequestGlyph.pullRequest,
    tint: "accent-adaptive-emerald-600-400",
    text: "text-adaptive-emerald-600-400",
    background: "bg-adaptive-emerald-500-a12-a16",
  },
  merged: {
    get label() {
      return i18n.t("mobile.pullRequestStatus.merged");
    },
    icon: PullRequestGlyph.merged,
    tint: "accent-adaptive-violet-600-400",
    text: "text-adaptive-violet-600-400",
    background: "bg-adaptive-violet-500-a12-a16",
  },
  closed: {
    get label() {
      return i18n.t("mobile.pullRequestStatus.closed");
    },
    icon: PullRequestGlyph.closed,
    tint: "accent-danger-foreground",
    text: "text-danger-foreground",
    background: "bg-danger",
  },
  draft: {
    get label() {
      return i18n.t("mobile.pullRequestStatus.draft");
    },
    icon: PullRequestGlyph.draft,
    tint: "accent-icon-muted",
    text: "text-foreground-muted",
    background: "bg-grouped-card",
  },
} satisfies Record<
  string,
  { label: string; icon: AppSymbolName; tint: string; text: string; background: string }
>;

export function pullRequestStatus(pr: Pick<PullRequestListEntry, "state" | "isDraft">) {
  return STATES[pr.isDraft && pr.state === "open" ? "draft" : pr.state];
}

export function pullRequestConflict(pr: {
  readonly state: PullRequestListEntry["state"];
  readonly isDraft: boolean;
  readonly mergeability?: PullRequestMergeability | undefined;
  readonly baseBranch?: string | undefined;
}) {
  if (pr.state !== "open" || pr.isDraft || pr.mergeability !== "conflicting") return null;
  return {
    label: pr.baseBranch
      ? i18n.t("mobile.pullRequestOverviewLoading.conflictsWith", { branch: pr.baseBranch })
      : i18n.t("mobile.pullRequestStatus.hasConflicts"),
  };
}

export function checkStatus(check: PullRequestCheck) {
  switch (check.status) {
    case "success":
      return {
        label: i18n.t("mobile.pullRequestStatus.passed"),
        icon: "checkmark.circle",
        tint: "accent-adaptive-emerald-600-400",
      } as const;
    case "failure":
      return {
        label: i18n.t("mobile.pullRequestStatus.failed"),
        icon: "exclamationmark.circle",
        tint: "accent-danger-foreground",
      } as const;
    case "action-required":
      return {
        label: i18n.t("mobile.pullRequestStatus.actionRequired"),
        icon: "exclamationmark.circle",
        tint: "accent-warning-foreground",
      } as const;
    case "pending":
      return {
        label: i18n.t("mobile.pullRequestStatus.pending"),
        icon: "clock",
        tint: "accent-warning-foreground",
      } as const;
    case "cancelled":
      return {
        label: i18n.t("mobile.pullRequestStatus.cancelled"),
        icon: "minus",
        tint: "accent-icon-muted",
      } as const;
    case "skipped":
      return {
        label: i18n.t("mobile.pullRequestStatus.skipped"),
        icon: "slash.circle",
        tint: "accent-icon-muted",
      } as const;
    case "neutral":
      return {
        label: i18n.t("mobile.pullRequestStatus.neutral"),
        icon: "minus",
        tint: "accent-icon-muted",
      } as const;
  }
}

export function pullRequestChecksSummary(pr: Pick<PullRequestDetail, "checks">) {
  const failed = pr.checks.filter((check) => check.status === "failure").length;
  const required = pr.checks.filter((check) => check.status === "action-required").length;
  const pending = pr.checks.filter((check) => check.status === "pending").length;
  const passed = pr.checks.filter((check) => check.status === "success").length;
  const count = pr.checks.length
    ? i18n.t("mobile.pullRequestStatus.passedOfTotal", { passed, total: pr.checks.length })
    : undefined;
  const failingLabel = i18n.t(
    failed === 1
      ? "mobile.pullRequestStatus.checkFailing"
      : "mobile.pullRequestStatus.checksFailing",
    { count: failed },
  );
  if (failed)
    return {
      label: failingLabel,
      title: failingLabel,
      count,
      icon: "exclamationmark.circle",
      tint: "accent-danger-foreground",
    } as const;
  if (required)
    return {
      label: i18n.t("mobile.pullRequestStatus.needAttention", { count: required }),
      title: i18n.t("mobile.pullRequestStatus.checksNeedAttention"),
      count: i18n.t("mobile.pullRequestStatus.awaitingAction", { count: required }),
      icon: "exclamationmark.circle",
      tint: "accent-warning-foreground",
    } as const;
  if (pending)
    return {
      label: i18n.t("mobile.pullRequestStatus.pending", { count: pending }),
      title: i18n.t("mobile.pullRequestStatus.checksRunning"),
      count: i18n.t("mobile.pullRequestStatus.pending", { count: pending }),
      icon: "clock",
      tint: "accent-warning-foreground",
    } as const;
  if (passed)
    return {
      label: i18n.t("mobile.pullRequestStatus.ofPassed", {
        passed: passed,
        total: pr.checks.length,
      }),
      title:
        passed === pr.checks.length
          ? i18n.t("mobile.pullRequestStatus.allChecksPassed")
          : i18n.t("mobile.pullRequestOverviewLoading.checksCompleted"),
      count,
      icon: "checkmark.circle",
      tint: "accent-adaptive-emerald-600-400",
    } as const;
  return {
    label: pr.checks.length
      ? i18n.t("mobile.pullRequestStatus.completedCount", { count: pr.checks.length })
      : i18n.t("pr.noChecksReported"),
    title: pr.checks.length
      ? i18n.t("mobile.pullRequestOverviewLoading.checksCompleted")
      : i18n.t("pr.noChecksReported"),
    count,
    icon: "minus",
    tint: "accent-icon-muted",
  } as const;
}

export function pullRequestReviewSummary(
  pr: Pick<PullRequestDetail, "reviewers">,
  activity: Pick<PullRequestActivity, "comments" | "commits"> | null,
) {
  const latest = new Map<string, PullRequestActivity["comments"][number]>();
  const comments = new Map<string, PullRequestActivity["comments"][number]>();
  for (const review of activity?.comments ?? []) {
    if (review.kind !== "review" || !review.reviewState) continue;
    const state = review.reviewState.toUpperCase().replaceAll("-", "_");
    const key = review.author?.login ?? review.id;
    if (state === "COMMENTED") {
      const previous = comments.get(key);
      if (!previous || Date.parse(review.createdAt) >= Date.parse(previous.createdAt))
        comments.set(key, { ...review, reviewState: state });
      continue;
    }
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(state)) continue;
    const previous = latest.get(key);
    if (!previous || Date.parse(review.createdAt) >= Date.parse(previous.createdAt))
      latest.set(key, { ...review, reviewState: state });
  }
  const reviews = [
    ...[...latest.values()].filter((review) => review.reviewState !== "DISMISSED"),
    ...[...comments.entries()].filter(([key]) => !latest.has(key)).map(([, review]) => review),
  ];
  const requested = reviews.filter((review) => review.reviewState === "CHANGES_REQUESTED");
  const newestCommit = Math.max(
    0,
    ...(activity?.commits.map((commit) => Date.parse(commit.committedDate)) ?? []),
  );
  const approved = reviews.filter(
    (review) => review.reviewState === "APPROVED" && Date.parse(review.createdAt) >= newestCommit,
  );
  if (requested.length)
    return {
      title: i18n.t("mobile.pullRequestStatus.changesRequested"),
      count: i18n.t(
        requested.length === 1
          ? "mobile.pullRequestStatus.reviewerOne"
          : "mobile.pullRequestStatus.reviewerMany",
        { count: requested.length },
      ),
      icon: "xmark.circle.fill",
      tint: "accent-danger-foreground",
      reviews,
    } as const;
  if (approved.length)
    return {
      title:
        approved.length === 1 && approved[0]?.author
          ? i18n.t("mobile.pullRequestStatus.approvedBy", { name: approved[0].author.login })
          : i18n.t("mobile.pullRequestStatus.reviewsApproved"),
      count: i18n.t("mobile.pullRequestStatus.approvedCount", { count: approved.length }),
      icon: "checkmark.circle",
      tint: "accent-adaptive-emerald-600-400",
      reviews,
    } as const;
  const commented = reviews.filter((review) => review.reviewState === "COMMENTED");
  if (commented.length && !pr.reviewers.length)
    return {
      title: i18n.t("mobile.pullRequestStatus.reviews"),
      count: i18n.t("mobile.pullRequestStatus.commentedCount", { count: commented.length }),
      icon: "bubble.left",
      tint: "accent-icon-muted",
      reviews,
    } as const;
  return {
    title: pr.reviewers.length ? i18n.t("pr.awaitingReview") : i18n.t("pr.requestAReview"),
    count: pr.reviewers.length
      ? i18n.t("mobile.pullRequestStatus.requestedCount", { count: pr.reviewers.length })
      : i18n.t("mobile.pullRequestStatus.noneAssigned"),
    icon: "person.2",
    tint: "accent-icon-muted",
    reviews,
  } as const;
}

export function pullRequestBranchSummary(
  pr: Pick<PullRequestDetail, "mergeability" | "baseComparison" | "behindBy" | "baseBranch">,
) {
  if (pr.mergeability === "conflicting") return i18n.t("mobile.pullRequestStatus.hasConflicts");
  if (pr.baseComparison === "behind")
    return pr.behindBy === undefined || pr.behindBy === null
      ? i18n.t("mobile.pullRequestStatus.behind", { branch: pr.baseBranch })
      : i18n.t("mobile.pullRequestStatus.behindCount", {
          count: pr.behindBy,
          branch: pr.baseBranch,
        });
  if (pr.baseComparison === "up-to-date") return i18n.t("mobile.pullRequestStatus.upToDate");
  return pr.mergeability === "mergeable"
    ? i18n.t("mobile.pullRequestStatus.noConflicts")
    : i18n.t("mobile.pullRequestStatus.notReported");
}

export function pullRequestChecksStatus(state: PullRequestChecksState) {
  if (state === "passing")
    return { icon: "checkmark.circle", tint: "accent-adaptive-emerald-600-400" } as const;
  if (state === "failing")
    return { icon: "xmark.circle.fill", tint: "accent-danger-foreground" } as const;
  return { icon: "clock", tint: "accent-warning-foreground" } as const;
}
