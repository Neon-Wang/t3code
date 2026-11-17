import { PULL_REQUEST_STATE_PRESENTATION } from "../pullRequest/pullRequestIcons";
import { pullRequestMarkdownPlugins } from "../pullRequest/pullRequestMarkdown.logic";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import {
  AuthSourceControlWriteScope,
  type EnvironmentId,
  type IssueRef,
  type IssueActivityEvent,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { issueTimeline } from "@t3tools/client-runtime/issues";
import { useRef, useState } from "react";
import { TagIcon, UsersIcon, XIcon } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { issueEnvironment, useIssueActivities } from "~/state/issues";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentScope } from "~/state/session";
import { readLocalApi } from "~/localApi";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { DetailCrumbs } from "../sourceControl/DetailCrumbs";
import { DetailTabBar } from "../sourceControl/DetailLayout";
import { TitleEditor } from "../sourceControl/TitleEditor";
import { SummarySection, MetaRow } from "../sourceControl/SummarySection";
import {
  SourceControlMarkdown,
  SourceControlMarkdownContext,
} from "../sourceControl/SourceControlMarkdown";
import { MarkdownEditor } from "../sourceControl/MarkdownEditor";
import { EditButton } from "../sourceControl/EditButton";
import { ReactionBar } from "../sourceControl/ReactionBar";
import { CommentForm } from "../sourceControl/CommentForm";
import { TimelineComment } from "../sourceControl/TimelineComment";
import {
  PullRequestActorAvatar,
  PullRequestLabelChip,
} from "../pullRequest/pullRequestPresentation";
import { RelativeTime } from "../RelativeTime";
import { IssueIcon } from "./IssueIcon";
import { IssueAssigneePicker, IssueLabelPicker } from "./IssuePickers";

export type IssueDetailTab = "summary" | "timeline";
const eventMessages = {
  closed: "issue.closed",
  reopened: "issue.reopened",
  labeled: "issue.labeled",
  unlabeled: "issue.unlabeled",
  assigned: "issue.assignedEvent",
  unassigned: "issue.unassigned",
  "cross-referenced": "issue.crossReferenced",
} as const;

function ActivityEvent({ event }: { event: IssueActivityEvent }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
      <PullRequestActorAvatar actor={event.actor} className="size-7" />
      <span className="min-w-0 flex-1">
        <strong>{event.actor?.login ?? "ghost"}</strong> {t(eventMessages[event.kind])}{" "}
        {event.label?.name ?? event.assignee?.login ?? ""}
        {event.reference ? (
          <a
            href={event.reference.changeRequest.url}
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-primary hover:underline"
          >
            #{event.reference.changeRequest.number}
          </a>
        ) : null}
      </span>
      <RelativeTime timestamp={event.createdAt} />
    </div>
  );
}

export function IssueDetailPanel({
  environmentId,
  reference,
  threadRef = null,
  active = true,
  initialTab = "summary",
  onTabChange,
  onClose,
}: {
  environmentId: EnvironmentId;
  reference: IssueRef;
  threadRef?: ScopedThreadRef | null;
  active?: boolean;
  initialTab?: IssueDetailTab;
  onTabChange?: (tab: IssueDetailTab) => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const detailQuery = useEnvironmentQuery(
    issueEnvironment.detail({ environmentId, input: reference }),
  );
  const [tab, setTab] = useState<IssueDetailTab>(initialTab);
  const [seenTab, setSeenTab] = useState(initialTab);
  if (seenTab !== initialTab) {
    setSeenTab(initialTab);
    setTab(initialTab);
  }
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const activities = useIssueActivities(
    [undefined, ...cursors].map((cursor) => ({
      environmentId,
      input: { ...reference, ...(cursor ? { cursor } : {}) },
    })),
  );
  const pages = activities.values.map(([, page]) => page);
  const first = pages[0];
  const nextCursor = pages.at(-1)?.nextCursor;
  const timeline = issueTimeline(pages);
  const detail = detailQuery.data;
  const canWrite = useEnvironmentScope(environmentId, AuthSourceControlWriteScope);
  const update = useAtomCommand(issueEnvironment.update);
  const post = useAtomCommand(issueEnvironment.comment, { reportFailure: false });
  const updateComment = useAtomCommand(issueEnvironment.updateComment, { reportFailure: false });
  const react = useAtomCommand(issueEnvironment.setReaction, { reportFailure: false });
  const invalidate = useAtomCommand(issueEnvironment.invalidate);
  const [pending, setPending] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refresh = () => {
    detailQuery.refresh();
    activities.refresh();
  };
  const completionScope = {
    environmentId,
    projectId: reference.projectId,
    support: { mentions: true, referenceSigils: ["#"] as readonly "#"[] },
  };
  const mutate = async (patch: {
    body?: string;
    title?: string;
    state?: "open" | "closed";
    closeReason?: "completed" | "not_planned";
  }) => {
    if (pending || !canWrite) return false;
    setPending(true);
    const result = await update({ environmentId, input: { ...reference, ...patch } });
    setPending(false);
    if (result._tag === "Failure") return false;
    refresh();
    return true;
  };
  if (detail === null)
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {detailQuery.error ? (
          <>
            <p role="alert">{detailQuery.error}</p>
            <Button size="sm" variant="outline" onClick={detailQuery.refresh}>
              {t("action.retry")}
            </Button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  const editable = canWrite && detail.capabilities.edit && detail.viewerPermissions.edit;
  const closeAllowed = canWrite && detail.capabilities.close && detail.viewerPermissions.close;
  const reactionBar = (reactions: NonNullable<typeof first>["reactions"], subjectId?: string) => (
    <ReactionBar
      reactions={reactions}
      canReact={canWrite && detail.capabilities.reactions}
      onRefresh={refresh}
      onToggle={async (content, reacted) =>
        (
          await react({
            environmentId,
            input: { ...reference, ...(subjectId ? { subjectId } : {}), content, reacted },
          })
        )._tag === "Success"
      }
    />
  );
  const stateLabel =
    detail.state === "open"
      ? t("pr.stateOpen")
      : detail.closeReason === "not_planned"
        ? t("issue.closedNotPlanned")
        : t("issue.closedCompleted");
  return (
    <SourceControlMarkdownContext
      value={{
        remarkPlugins: pullRequestMarkdownPlugins(detail),
        lineBreaks: sourceControlClients.get(detail.provider).hardLineBreaks ?? false,
        threadRef,
        repository: detail.repository,
      }}
    >
      <div className="relative flex h-full min-h-0 w-full flex-col bg-background">
        <div className="@container/pr-header grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border/60">
          <DetailCrumbs
            term={t("issue.singular")}
            backLabel={t("issue.back")}
            detail={detail}
            toneClassName={
              detail.state === "open"
                ? PULL_REQUEST_STATE_PRESENTATION.open.toneClassName
                : PULL_REQUEST_STATE_PRESENTATION.merged.toneClassName
            }
            condensed={false}
            repositoryUrl={`https://${detail.host}/${detail.repository}`}
            openOnHostText={detail.url}
            onBack={onClose}
          />
          <div className="mr-4 flex h-7 items-center gap-1">
            <span className="inline-flex items-center gap-1 text-xs">
              <IssueIcon state={detail.state} closeReason={detail.closeReason} />
              {stateLabel}
            </span>
            {closeAllowed ? (
              detail.state === "open" ? (
                <Menu>
                  <MenuTrigger render={<Button size="xs" variant="outline" disabled={pending} />}>
                    {t("action.close")}
                  </MenuTrigger>
                  <MenuPopup>
                    <MenuItem
                      onClick={() => void mutate({ state: "closed", closeReason: "completed" })}
                    >
                      {t("issue.completed")}
                    </MenuItem>
                    <MenuItem
                      onClick={() => void mutate({ state: "closed", closeReason: "not_planned" })}
                    >
                      {t("issue.notPlanned")}
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void mutate({ state: "open" })}
                >
                  {t("issue.reopen")}
                </Button>
              )
            ) : null}
            {onClose ? (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("action.close")}
                onClick={onClose}
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <div className="col-span-2 mt-1 min-w-0 px-4 pb-4">
            <TitleEditor
              detail={detail}
              pullRequestKey={detail.url}
              canWriteSourceControl={canWrite}
              editable={editable}
              label={t("issue.singular")}
              onSaved={refresh}
              onUpdate={(title) => mutate({ title })}
            />
            <div className="mt-2 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
              <PullRequestActorAvatar actor={detail.author} className="size-4" />
              {detail.author?.login ?? "ghost"}
              <span>·</span>
              {t("pr.updated")} <RelativeTime timestamp={detail.updatedAt} />
            </div>
          </div>
          <DetailTabBar
            label={t("issue.tabs")}
            tabs={[
              { value: "summary", label: t("pr.summary") },
              { value: "timeline", label: t("pr.timeline") },
            ]}
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              scrollRef.current?.scrollTo({ top: 0 });
              onTabChange?.(value);
            }}
          >
            <div className="ml-auto">
              <Button
                size="xs"
                variant="ghost"
                disabled={detailQuery.isPending}
                onClick={() => {
                  setCursors([]);
                  void invalidate({ environmentId, input: { reference } });
                }}
              >
                {t("action.refresh")}
              </Button>
            </div>
          </DetailTabBar>
        </div>
        {detailQuery.error ? (
          <p role="alert" className="px-4 py-2 text-xs text-destructive">
            {detailQuery.error}
          </p>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          ref={scrollRef}
          data-pull-request-summary-scroll
        >
          {tab === "summary" ? (
            <>
              <section className="px-4 pt-2.5 pb-1">
                <div className="space-y-2">
                  <MetaRow icon={<TagIcon className="size-3.5" />} label={t("pr.labels")}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {detail.labels.map((label) => (
                        <PullRequestLabelChip key={label.name} label={label} />
                      ))}
                      <IssueLabelPicker
                        environmentId={environmentId}
                        reference={reference}
                        allowed={
                          canWrite && detail.capabilities.labels && detail.viewerPermissions.labels
                        }
                      />
                    </span>
                  </MetaRow>
                  <MetaRow icon={<UsersIcon className="size-3.5" />} label={t("issue.assignees")}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {detail.assignees.map((actor) => (
                        <span key={actor.login} className="inline-flex items-center gap-1">
                          <PullRequestActorAvatar actor={actor} className="size-4" />
                          {actor.login}
                        </span>
                      ))}
                      {detail.assignees.length === 0 ? t("common.none") : null}
                      <IssueAssigneePicker
                        environmentId={environmentId}
                        reference={reference}
                        allowed={
                          canWrite &&
                          detail.capabilities.assignees &&
                          detail.viewerPermissions.assignees
                        }
                      />
                    </span>
                  </MetaRow>
                </div>
              </section>
              <SummarySection title={t("pr.description")}>
                <div className="flex items-start gap-1">
                  {editingBody ? (
                    <MarkdownEditor
                      value={detail.body}
                      cwd={detail.workspaceRoot}
                      environmentId={environmentId}
                      completionScope={completionScope}
                      threadRef={threadRef}
                      label={t("pr.editDescription")}
                      saving={pending}
                      allowEmpty
                      onSave={(body) =>
                        void mutate({ body }).then((saved) => {
                          if (saved) setEditingBody(false);
                        })
                      }
                      onCancel={() => setEditingBody(false)}
                    />
                  ) : (
                    <>
                      <SourceControlMarkdown
                        className="min-w-0 flex-1"
                        text={detail.body || t("pr.noDescriptionProvided")}
                        cwd={detail.workspaceRoot}
                        environmentId={environmentId}
                        threadRef={threadRef}
                      />
                      {editable ? (
                        <EditButton
                          aria-label={t("pr.editDescription")}
                          onClick={() => setEditingBody(true)}
                        />
                      ) : null}
                    </>
                  )}
                </div>
                <div className="mt-3">{reactionBar(first?.reactions ?? [])}</div>
              </SummarySection>
            </>
          ) : (
            <div className="px-4 py-2">
              {timeline.map((item) =>
                item.kind === "event" ? (
                  <ActivityEvent key={item.id} event={item.event} />
                ) : (
                  <TimelineComment
                    key={item.id}
                    event={{
                      actor: item.comment.author,
                      at: item.at,
                      title: t("issue.commented"),
                      body: item.comment.body,
                      markdown: true,
                      url: item.comment.url,
                    }}
                    editable={canWrite && item.comment.canEdit ? item.comment : null}
                    cwd={detail.workspaceRoot}
                    onOpen={(url) => void readLocalApi()?.shell.openExternal(url)}
                    environmentId={environmentId}
                    threadRef={threadRef}
                    completionScope={completionScope}
                    onRefresh={refresh}
                    onSave={async (body) =>
                      (
                        await updateComment({
                          environmentId,
                          input: { ...reference, commentId: item.id, body },
                        })
                      )._tag === "Success"
                    }
                    actions={reactionBar(item.comment.reactions ?? [], item.id)}
                  />
                ),
              )}
              {timeline.length === 0 && !activities.isPending && !activities.error ? (
                <p className="py-4 text-xs text-muted-foreground">{t("issue.noActivity")}</p>
              ) : null}
              {nextCursor ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={activities.isPending}
                  onClick={() => setCursors([...cursors, nextCursor])}
                >
                  {t("issue.moreActivity")}
                </Button>
              ) : null}
            </div>
          )}
          {activities.error ? (
            <p role="alert" className="px-4 py-2 text-xs text-destructive">
              {activities.error}
            </p>
          ) : null}
          {activities.isPending ? (
            <div className="px-4 py-2">
              <Spinner />
            </div>
          ) : null}
          {canWrite && detail.capabilities.comment && detail.viewerPermissions.comment ? (
            <div className="border-t border-border/60 p-4">
              <CommentForm
                environmentId={environmentId}
                active={active}
                reference={reference}
                term={t("issue.singular")}
                completionScope={completionScope}
                followUpAction={
                  closeAllowed ? (detail.state === "open" ? "close" : "reopen") : null
                }
                actionPending={pending}
                textareaRef={textareaRef}
                onPost={async (body) =>
                  (await post({ environmentId, input: { ...reference, body } }))._tag === "Success"
                }
                onCommented={refresh}
                onClose={() => undefined}
                onCommentAction={async (body, action) => {
                  const result = await post({ environmentId, input: { ...reference, body } });
                  if (result._tag === "Failure") return { commentPosted: false };
                  await mutate(
                    action === "close"
                      ? { state: "closed", closeReason: "completed" }
                      : { state: "open" },
                  );
                  refresh();
                  return { commentPosted: true };
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </SourceControlMarkdownContext>
  );
}
