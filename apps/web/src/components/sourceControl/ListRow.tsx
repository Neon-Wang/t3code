import type { PullRequestActor } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { RelativeTime } from "../RelativeTime";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PullRequestActorAvatar } from "../pullRequest/pullRequestPresentation";

export function ListRowLines({
  number,
  title,
  status,
  signals,
  meta,
  metaClassName,
  updatedAt,
}: {
  number: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  signals?: ReactNode;
  meta?: ReactNode;
  metaClassName?: string;
  updatedAt?: string | null | undefined;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-1.5">
        {number}
        <span className="min-w-0 truncate text-sm">{title}</span>
        {signals ? (
          <span className="flex shrink-0 items-center gap-1 text-2xs">{signals}</span>
        ) : null}
        {status ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-2xs">{status}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground",
          metaClassName,
        )}
      >
        {meta}
        {updatedAt ? (
          <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">
            <RelativeTime timestamp={updatedAt} />
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function ListRowAuthor({
  actor,
  className,
  labelClassName,
}: {
  actor: PullRequestActor | null;
  className?: string;
  labelClassName?: string;
}) {
  const login = actor?.login ?? "ghost";
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn("inline-flex min-w-0 items-center gap-1", className)} />}
      >
        <PullRequestActorAvatar actor={actor} className="size-3.5" />
        <span className={cn("truncate", labelClassName)}>{login}</span>
      </TooltipTrigger>
      <TooltipPopup side="top">
        {actor?.name && actor.name !== login ? `${actor.name} (@${login})` : login}
      </TooltipPopup>
    </Tooltip>
  );
}
