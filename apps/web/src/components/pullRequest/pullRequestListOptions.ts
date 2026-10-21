import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import {
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  PenLineIcon,
  UserLockIcon,
} from "lucide-react";

import type { PullRequestFilterOption } from "./PullRequestListFilters";
import type { PullRequestListSort } from "./pullRequestListPreferences";
import { PullRequestGlyph } from "./pullRequestIcons";
import { i18n } from "@t3tools/shared/i18n";

export const INVOLVEMENT_TABS = [
  {
    value: "all",
    get label() {
      return i18n.t("pr.all");
    },
    Icon: LayersIcon,
  },
  {
    value: "reviewing",
    get label() {
      return i18n.t("pr.reviewing");
    },
    Icon: EyeIcon,
  },
  {
    value: "authored",
    get label() {
      return i18n.t("pr.authored");
    },
    Icon: PenLineIcon,
  },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

export const STATE_TABS = [
  {
    value: "all",
    get label() {
      return i18n.t("pr.all");
    },
    Icon: LayersIcon,
  },
  {
    value: "open",
    get label() {
      return i18n.t("pr.stateOpen");
    },
    Icon: PullRequestGlyph.pullRequest,
  },
  {
    value: "closed",
    get label() {
      return i18n.t("pr.closed");
    },
    Icon: PullRequestGlyph.closed,
  },
  {
    value: "merged",
    get label() {
      return i18n.t("pr.merged");
    },
    Icon: PullRequestGlyph.merged,
  },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

export const SORT_OPTIONS = [
  {
    value: "ready",
    get label() {
      return i18n.t("pr.mergeReadiness");
    },
    Icon: ListChecksIcon,
  },
  {
    value: "blocked",
    get label() {
      return i18n.t("pr.blockedOnMe");
    },
    Icon: UserLockIcon,
  },
  {
    value: "updated",
    get label() {
      return i18n.t("pr.recentlyUpdated");
    },
    Icon: ClockIcon,
  },
  {
    value: "newest",
    get label() {
      return i18n.t("pr.newestShown");
    },
    Icon: CalendarArrowDownIcon,
  },
  {
    value: "oldest",
    get label() {
      return i18n.t("pr.oldestShown");
    },
    Icon: CalendarArrowUpIcon,
  },
  {
    value: "largest",
    get label() {
      return i18n.t("pr.largestShown");
    },
    Icon: Maximize2Icon,
  },
  {
    value: "smallest",
    get label() {
      return i18n.t("pr.smallestShown");
    },
    Icon: Minimize2Icon,
  },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;
