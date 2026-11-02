import { i18n } from "@t3tools/shared/i18n";
import type { PullRequestReviewGuideResult } from "@t3tools/contracts";

export function reviewGuideState(data: PullRequestReviewGuideResult | null) {
  const guide = data?.guide ?? null;
  return {
    guide,
    running: data?.run?._tag === "Running",
    stale: guide !== null && data?.currentHeadSha != null && guide.headSha !== data.currentHeadSha,
    failure:
      data?.run?._tag === "Failed" && data.run.headSha === data.currentHeadSha
        ? data.run.detail
        : null,
  };
}

export function guideNoticeState(state: {
  readonly data: PullRequestReviewGuideResult | null;
  readonly isPending: boolean;
  readonly running: boolean;
  readonly startError: string | null;
  readonly error: string | null;
}) {
  const { guide, stale, failure } = reviewGuideState(state.data);
  if (state.running) {
    return {
      kind: "writing" as const,
      title: i18n.t("mobile.reviewGuideState.rewritingGuide"),
      description: guide
        ? i18n.t("mobile.reviewGuideState.keepReadingWhileAgentWrites")
        : i18n.t("mobile.reviewGuideState.agentWritingTour"),
      action: guide
        ? i18n.t("mobile.reviewGuideState.rewriting")
        : i18n.t("mobile.reviewGuideState.writingGuide"),
    };
  }
  const error = state.startError ?? failure;
  if (error) {
    return {
      kind: "failed" as const,
      title: i18n.t("mobile.reviewGuideState.couldNotWriteGuide"),
      description: error,
      action: i18n.t("mobile.pullRequestsScreen.tryAgain"),
    };
  }
  if (state.error) {
    return {
      kind: "unavailable" as const,
      title: i18n.t("mobile.reviewGuideState.couldNotRefreshGuide"),
      description: state.error,
      action: i18n.t("mobile.pullRequestsScreen.tryAgain"),
    };
  }
  if (!state.data) {
    return {
      kind: "loading" as const,
      title: i18n.t("mobile.reviewGuideState.reviewGuide"),
      description: i18n.t("mobile.reviewGuideState.checkingForASavedGuide"),
      action: i18n.t("mobile.reviewGuideState.loadingGuide"),
    };
  }
  if (stale) {
    return {
      kind: "stale" as const,
      title: i18n.t("mobile.reviewGuideState.newChangesSinceThisGuide"),
      description: i18n.t(
        "mobile.reviewGuideState.youCanReadThePreviousGuideOrRewriteItForTheLatestChanges",
      ),
      action: i18n.t("mobile.guideOutline.rewriteGuide"),
    };
  }
  return {
    kind: guide ? ("ready" as const) : ("empty" as const),
    title: i18n.t("mobile.reviewGuideState.reviewGuide"),
    description: i18n.t(
      "mobile.reviewGuideState.getATourOfTheChangeWithCodeExcerptsAndNotesOnWhatNeedsACloserLook",
    ),
    action: i18n.t("v2.surfaces.copy209"),
  };
}
