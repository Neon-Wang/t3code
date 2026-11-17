import { PULL_REQUEST_STATE_PRESENTATION } from "../pullRequest/pullRequestIcons";
import type { IssueCloseReason, IssueState } from "@t3tools/contracts";
import { CircleCheckIcon, CircleDotIcon, CircleSlashIcon } from "lucide-react";
import { cn } from "~/lib/utils";

export function IssueIcon({
  state,
  closeReason,
  className,
}: {
  state: IssueState;
  closeReason?: IssueCloseReason | null | undefined;
  className?: string;
}) {
  const Icon =
    state === "open"
      ? CircleDotIcon
      : closeReason === "not_planned"
        ? CircleSlashIcon
        : CircleCheckIcon;
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4 shrink-0",
        state === "open"
          ? PULL_REQUEST_STATE_PRESENTATION.open.toneClassName
          : closeReason === "not_planned"
            ? "text-muted-foreground"
            : PULL_REQUEST_STATE_PRESENTATION.merged.toneClassName,
        className,
      )}
    />
  );
}
