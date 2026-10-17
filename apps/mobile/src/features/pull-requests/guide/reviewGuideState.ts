import { i18n } from "@t3tools/shared/i18n";
import type { PullRequestReviewGuideResult } from "@t3tools/contracts";

/** Old failures must not follow a PR onto a different head. */
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

/** A pending refresh must not hide cached content, or a new run reveal an old failure. */
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
        ? "You can keep reading this guide while the agent writes the update."
        : "An agent is reading the change and writing the tour. You can leave and come back when it’s ready.",
      action: guide ? "Rewriting…" : "Writing guide…",
    };
  }
  const error = state.startError ?? failure;
  if (error) {
    return {
      kind: "failed" as const,
      title: i18n.t("mobile.reviewGuideState.couldNotWriteGuide"),
      description: error,
      action: "Try again",
    };
  }
  if (state.error) {
    return {
      kind: "unavailable" as const,
      title: i18n.t("mobile.reviewGuideState.couldNotRefreshGuide"),
      description: state.error,
      action: "Try again",
    };
  }
  if (!state.data) {
    return {
      kind: "loading" as const,
      title: i18n.t("mobile.reviewGuideState.reviewGuide"),
      description: i18n.t("mobile.reviewGuideState.checkingForASavedGuide"),
      action: "Loading guide…",
    };
  }
  if (stale) {
    return {
      kind: "stale" as const,
      title: i18n.t("mobile.reviewGuideState.newChangesSinceThisGuide"),
      description: i18n.t(
        "mobile.reviewGuideState.youCanReadThePreviousGuideOrRewriteItForTheLatestChanges",
      ),
      action: "Rewrite guide",
    };
  }
  return {
    kind: guide ? ("ready" as const) : ("empty" as const),
    title: i18n.t("mobile.reviewGuideState.reviewGuide"),
    description: i18n.t(
      "mobile.reviewGuideState.getATourOfTheChangeWithCodeExcerptsAndNotesOnWhatNeedsACloserLook",
    ),
    action: "Write guide",
  };
}
