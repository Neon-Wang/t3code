import { i18n } from "@t3tools/shared/i18n";
import {
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  LayersIcon,
  Link2Icon,
  Unlink2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { PullRequestState } from "@t3tools/contracts";

export const PullRequestGlyph = {
  pullRequest: GitPullRequestArrowIcon,
  reopen: GitPullRequestArrowIcon,
  draft: GitPullRequestDraftIcon,
  closed: GitPullRequestClosedIcon,
  merged: GitMergeIcon,
  conflicting: TriangleAlertIcon,
  stack: LayersIcon,
  link: Link2Icon,
  unlink: Unlink2Icon,
} as const;

export type PullRequestGlyphIcon = (typeof PullRequestGlyph)[keyof typeof PullRequestGlyph];

export interface PullRequestStatePresentation {
  readonly label: string;
  readonly toneClassName: string;
  readonly Icon: PullRequestGlyphIcon;
}

export function getPullRequestStatePresentation(t: typeof i18n.t = i18n.t) {
  return {
    open: {
      label: t("pr.stateOpen"),
      toneClassName: "text-emerald-600 dark:text-emerald-300/90",
      Icon: PullRequestGlyph.pullRequest,
    },
    draft: {
      label: t("pr.draft"),
      toneClassName: "text-zinc-500 dark:text-zinc-400/80",
      Icon: PullRequestGlyph.draft,
    },
    closed: {
      label: t("pr.closed"),
      toneClassName: "text-red-600 dark:text-red-300/90",
      Icon: PullRequestGlyph.closed,
    },
    merged: {
      label: t("pr.merged"),
      toneClassName: "text-violet-600 dark:text-violet-300/90",
      Icon: PullRequestGlyph.merged,
    },
  } as const satisfies Record<PullRequestState | "draft", PullRequestStatePresentation>;
}

export const PULL_REQUEST_STATE_PRESENTATION = {
  get open() {
    return getPullRequestStatePresentation()["open"];
  },
  get draft() {
    return getPullRequestStatePresentation()["draft"];
  },
  get closed() {
    return getPullRequestStatePresentation()["closed"];
  },
  get merged() {
    return getPullRequestStatePresentation()["merged"];
  },
};
