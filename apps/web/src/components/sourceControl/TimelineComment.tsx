import type { EnvironmentId, PullRequestActor, ScopedThreadRef } from "@t3tools/contracts";
import { ExternalLinkIcon, FileCode2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../../hooks/useI18n";
import { RelativeTime } from "../RelativeTime";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { SourceControlMarkdown } from "./SourceControlMarkdown";
import { MarkdownEditor } from "./MarkdownEditor";
import type { CompletionScope } from "./MarkdownTextarea";
import { EditButton } from "./EditButton";
import { PullRequestMetaLine } from "../pullRequest/pullRequestPresentation";

export function TimelineBody({
  body,
  markdown,
  cwd,
  environmentId,
  threadRef,
}: {
  body: string;
  markdown: boolean;
  cwd: string;
  environmentId: EnvironmentId;
  threadRef: ScopedThreadRef | null;
}) {
  return (
    <div className="mt-3">
      {markdown ? (
        <SourceControlMarkdown
          text={body}
          cwd={cwd}
          environmentId={environmentId}
          threadRef={threadRef}
        />
      ) : (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{body}</p>
      )}
    </div>
  );
}

export function ActorName({ actor }: { actor: PullRequestActor | null }) {
  return <span className="font-semibold text-foreground">{actor?.login ?? "ghost"}</span>;
}

function friendlyReviewState(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
  return words.replace(/^\w/u, (letter) => letter.toUpperCase());
}

function ReviewStateBadge({ state }: { state: string }) {
  return (
    <span className="text-3xs font-medium text-muted-foreground">{friendlyReviewState(state)}</span>
  );
}

export function OpenOnHostButton({
  url,
  onOpen,
}: {
  url: string | null;
  onOpen: (url: string) => void;
}) {
  const { t } = useI18n();
  return url === null ? null : (
    <Button
      size="icon-xs"
      variant="ghost-muted"
      className="-mr-1 shrink-0"
      aria-label={t("pr.openActivityOnHost")}
      onClick={() => onOpen(url)}
    >
      <ExternalLinkIcon className="size-3" />
    </Button>
  );
}

export function TimelineComment({
  event,
  editable,
  cwd,
  onOpen,
  environmentId,
  threadRef,
  completionScope,
  onRefresh,
  onSave,
  actions,
  highlighted = false,
  showPath = true,
}: {
  event: {
    actor: PullRequestActor | null;
    at: string;
    title: string;
    reviewState?: string | null;
    path?: string | null;
    url: string | null;
    body: string | null;
    markdown: boolean;
  };
  editable: { body: string } | null;
  cwd: string;
  onOpen: (url: string) => void;
  environmentId: EnvironmentId;
  threadRef: ScopedThreadRef | null;
  completionScope: CompletionScope | null;
  onRefresh: () => void;
  onSave: (body: string) => Promise<boolean>;
  actions: ReactNode;
  highlighted?: boolean;
  showPath?: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async (body: string) => {
    if (editable === null || saving) return;
    setSaving(true);
    const saved = await onSave(body);
    setSaving(false);
    if (!saved) {
      toastManager.add({ type: "error", title: t("pr.couldNotSaveTheComment") });
      return;
    }
    setEditing(false);
    onRefresh();
  };

  return (
    <article
      {...(highlighted
        ? {
            "data-pr-link-target": true,
            tabIndex: -1,
            className: "group rounded-lg py-2 ring-1 ring-primary/40 outline-none",
          }
        : { className: "group py-2" })}
    >
      <div className="px-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <ActorName actor={event.actor} />
              <span className="text-muted-foreground">{event.title}</span>
              {event.reviewState ? <ReviewStateBadge state={event.reviewState} /> : null}
            </div>
            <PullRequestMetaLine className="mt-1 flex-wrap text-2xs text-muted-foreground">
              <span>
                <RelativeTime timestamp={event.at} />
              </span>
              {showPath && event.path ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileCode2Icon aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{event.path}</span>
                </span>
              ) : null}
            </PullRequestMetaLine>
          </div>
          {editable !== null && !editing ? (
            <EditButton aria-label={t("pr.editComment")} onClick={() => setEditing(true)} />
          ) : null}
          {actions}
          <OpenOnHostButton url={event.url} onOpen={onOpen} />
        </div>
      </div>
      {editing && editable !== null ? (
        <div className="px-2 pb-2 pt-3">
          <MarkdownEditor
            value={editable.body}
            cwd={cwd}
            environmentId={environmentId}
            completionScope={completionScope}
            threadRef={threadRef}
            label={t("pr.editComment")}
            saving={saving}
            onSave={(body) => void save(body)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : event.body ? (
        <div className="px-2 pb-2">
          <TimelineBody
            body={event.body}
            markdown={event.markdown}
            cwd={cwd}
            environmentId={environmentId}
            threadRef={threadRef}
          />
        </div>
      ) : null}
    </article>
  );
}
