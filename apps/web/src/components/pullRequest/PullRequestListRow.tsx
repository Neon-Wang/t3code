import type { PullRequestMergeability, PullRequestState } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import { MiddleTruncate } from "../ui/middle-truncate";
import { PullRequestConflictGlyph, PullRequestStateGlyph } from "./pullRequestPresentation";

export const PULL_REQUEST_ROW_CLASS =
  "group/pr-row flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left";

export const PULL_REQUEST_ROW_NUMBER_CLASS =
  "shrink-0 font-mono text-xs tabular-nums text-muted-foreground";

export function PullRequestRowGlyph({
  state,
  isDraft,
  mergeability,
  baseBranch,
  below,
  className,
}: {
  state: PullRequestState;
  isDraft: boolean;
  mergeability?: PullRequestMergeability | undefined;
  baseBranch?: string | undefined;
  below?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex w-4 shrink-0 flex-col items-center gap-0.5", className)}>
      <span className="relative inline-flex">
        <PullRequestStateGlyph state={state} isDraft={isDraft} />
        {/* Offset the wrapper to keep the badge-sized tooltip trigger anchored. */}
        <span className="absolute -right-1 -bottom-1 inline-flex">
          <PullRequestConflictGlyph
            state={state}
            isDraft={isDraft}
            {...(mergeability === undefined ? {} : { mergeability })}
            {...(baseBranch === undefined ? {} : { baseBranch })}
            className="size-3 fill-background [stroke-width:2.5]"
          />
        </span>
      </span>
      {below ? <span className="inline-flex text-2xs">{below}</span> : null}
    </span>
  );
}

export {
  ListRowLines as PullRequestRowLines,
  ListRowAuthor as PullRequestRowAuthor,
} from "../sourceControl/ListRow";

export function PullRequestRowBranches({ head, base }: { head: string; base: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1 font-mono">
      <MiddleTruncate value={head} />
      <span className="shrink-0">→</span>
      <MiddleTruncate value={base} className="max-w-[45%] shrink-0" />
    </span>
  );
}
