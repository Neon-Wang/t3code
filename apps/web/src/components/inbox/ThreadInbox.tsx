import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { InboxIcon } from "lucide-react";
import { Fragment, useEffect, type SyntheticEvent } from "react";

import { useI18n } from "../../hooks/useI18n";
import { cn } from "../../lib/utils";
import { useThreadInbox } from "../../state/inbox";
import { ThreadDetailsControl } from "../chat/ThreadDetailsControl";
import { ThreadDetailsSection } from "../chat/ThreadDetailsSection";
import { Popover, PopoverCreateHandle, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { CompactTime, InboxItemIcon, InboxQuestionPanel } from "./InboxQuestionPanel";

// Sidebar rows share one popover, mounted beside the list, so its clicks and keys never reach a row.
const threadInboxPopover = PopoverCreateHandle<ScopedThreadRef>();

const stopRowEvent = (event: SyntheticEvent) => event.stopPropagation();

/** Shown on a sidebar row while its thread has open ask-human questions; opens them for answering. */
export function ThreadInboxButton({ threadRef }: { threadRef: ScopedThreadRef }) {
  const { t } = useI18n();
  const items = useThreadInbox(threadRef);
  if (items.length === 0) return null;
  const label = t("inbox.countLabel", { count: items.length });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            handle={threadInboxPopover}
            payload={threadRef}
            render={
              <button
                type="button"
                aria-label={label}
                onClick={stopRowEvent}
                onDoubleClick={stopRowEvent}
                className={cn(
                  "inline-flex h-full shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 text-xs font-medium tabular-nums hover:bg-foreground/6 data-popup-open:bg-foreground/6",
                  items.some((item) => item.urgent)
                    ? "text-destructive-foreground"
                    : "text-primary",
                )}
              />
            }
          />
        }
      >
        <InboxIcon aria-hidden className="size-3.5" />
        {items.length > 1 ? items.length : null}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** The popover every `ThreadInboxButton` opens. Mount once next to the sidebar list. */
export function ThreadInboxPopover() {
  return (
    <Popover handle={threadInboxPopover}>
      {({ payload }) =>
        payload ? (
          <PopoverPopup side="right" align="start" width="lg" padding="none">
            <ThreadInboxQuestions threadRef={payload} />
          </PopoverPopup>
        ) : null
      }
    </Popover>
  );
}

function ThreadInboxQuestions({ threadRef }: { threadRef: ScopedThreadRef }) {
  const items = useThreadInbox(threadRef);
  // The last answer also removes the row's button, so nothing is left to anchor to.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closes the imperative popover handle once its thread has no questions left
  useEffect(() => {
    if (items.length === 0) threadInboxPopover.close();
  }, [items.length]);
  return items.map((item, index) => (
    <Fragment key={item.id}>
      {index > 0 ? <div className="border-t" /> : null}
      <InboxQuestionPanel item={item} environmentId={threadRef.environmentId} className="p-4" />
    </Fragment>
  ));
}

/** The thread details card's list of the thread's open questions. Hidden while there are none. */
export function ThreadInboxSection({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const { t } = useI18n();
  const items = useThreadInbox({ environmentId, threadId });
  if (items.length === 0) return null;
  return (
    <ThreadDetailsSection headingId="thread-details-inbox-heading" title={t("inbox.title")}>
      <ul className="m-0 list-none p-0">
        {items.map((item) => (
          <li key={item.id}>
            <Popover>
              <PopoverTrigger
                render={<ThreadDetailsControl size="sm" variant="ghost" part="row" multiline />}
              >
                <InboxItemIcon item={item} className="size-4" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium leading-4 text-foreground/85">
                    {item.question}
                  </span>
                  <span className="flex min-w-0 gap-1 text-2xs font-normal leading-4 text-muted-foreground">
                    {item.urgent ? (
                      <span className="shrink-0 text-destructive-foreground">
                        {t("inbox.urgent")} ·
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{item.agent}</span>
                    <span className="ms-auto shrink-0 tabular-nums">
                      <CompactTime timestamp={item.urgentAt ?? item.createdAt} />
                    </span>
                  </span>
                </span>
              </PopoverTrigger>
              <PopoverPopup side="left" align="start" width="lg" padding="none">
                <InboxQuestionPanel item={item} environmentId={environmentId} className="p-4" />
              </PopoverPopup>
            </Popover>
          </li>
        ))}
      </ul>
    </ThreadDetailsSection>
  );
}
