import { Link } from "@tanstack/react-router";
import { inboxRows, type InboxRow } from "@t3tools/client-runtime/state/inbox-rows";
import { ChevronLeftIcon, InboxIcon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { useI18n } from "../../hooks/useI18n";
import { cn } from "../../lib/utils";
import { useInboxEnvironments, type EnvironmentInbox } from "../../state/inbox";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarMenuButton } from "../ui/sidebar";
import { CompactTime, InboxItemIcon, InboxQuestionPanel } from "./InboxQuestionPanel";

type QuestionRow = Extract<InboxRow<EnvironmentInbox>, { kind: "question" }>;

/** Laid out like Settings: the question list on the left, the chosen question on the right. */
export function InboxPage() {
  const { t } = useI18n();
  const environments = useInboxEnvironments();
  const rows = inboxRows(environments);
  const questions = rows.filter((row): row is QuestionRow => row.kind === "question");
  // The index lets an answered question hand the selection to the one that took its place.
  const [selection, setSelection] = useState({ key: "", index: 0 });
  // Narrow windows show one pane at a time.
  const [showDetail, setShowDetail] = useState(false);
  const current =
    questions.find((row) => row.key === selection.key) ??
    questions[Math.min(selection.index, questions.length - 1)] ??
    null;
  const select = (index: number) => {
    const row = questions[index];
    if (row) setSelection({ key: row.key, index });
  };
  const loading = environments.some((env) => env.snapshot === null && env.pending);
  // A lone group needs no heading; it only names a group when there is another to tell it from.
  const showProjectHeadings =
    rows.filter((row) => row.kind === "project" || row.kind === "urgent-header").length > 1;

  const onListKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = current ? questions.indexOf(current) : -1;
    select(event.key === "ArrowDown" ? index + 1 : Math.max(0, index - 1));
  };

  return (
    <AppRouteModal label={t("inbox.title")}>
      <div className="relative flex min-h-0 flex-1">
        <nav
          aria-label={t("inbox.title")}
          className={cn(
            "flex w-80 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground max-md:w-full max-md:border-e-0",
            showDetail && current && "max-md:hidden",
          )}
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b ps-4 pe-2">
            <h1 className="text-sm font-medium">{t("inbox.title")}</h1>
            {questions.length > 0 ? (
              <span className="text-xs text-muted-foreground tabular-nums">{questions.length}</span>
            ) : null}
            <div className="ms-auto md:hidden">
              <AppRouteModalClose />
            </div>
          </header>
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-px p-2" onKeyDown={onListKeyDown}>
              {environments.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
                  {t("inbox.noEnvironments")}
                </p>
              ) : null}
              {rows.map((row) => {
                switch (row.kind) {
                  case "urgent-header":
                    return (
                      <ListHeading key={row.key} className="text-destructive-foreground">
                        {t("inbox.urgent")}
                      </ListHeading>
                    );
                  case "environment":
                    return (
                      <EnvironmentHeading
                        key={row.key}
                        environment={row.environment}
                        showLabel={environments.length > 1}
                      />
                    );
                  case "project":
                    return showProjectHeadings ? (
                      <ListHeading key={row.key}>{row.title || t("inbox.other")}</ListHeading>
                    ) : null;
                  case "thread":
                    // Rows name their thread on their second line.
                    return null;
                  case "question":
                    return (
                      <QuestionListRow
                        key={row.key}
                        row={row}
                        active={row.key === current?.key}
                        onSelect={() => {
                          select(questions.indexOf(row));
                          setShowDetail(true);
                        }}
                      />
                    );
                }
              })}
            </div>
          </ScrollArea>
        </nav>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            !(showDetail && current) && "max-md:hidden",
          )}
        >
          <header className="flex h-12 shrink-0 items-center gap-2 border-b ps-5 pe-2 max-md:ps-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label={t("inbox.back")}
              onClick={() => setShowDetail(false)}
            >
              <ChevronLeftIcon />
            </Button>
            {current ? <QuestionBreadcrumb row={current} /> : null}
            <div className="ms-auto flex shrink-0 items-center gap-1">
              {current?.item.thread ? (
                <Button
                  variant="ghost"
                  size="xs"
                  render={
                    <Link
                      to="/$environmentId/$threadId"
                      params={{
                        environmentId: current.environmentId,
                        threadId: current.item.thread.id,
                      }}
                    />
                  }
                >
                  {t("inbox.openThread")}
                </Button>
              ) : null}
              <AppRouteModalClose />
            </div>
          </header>
          <ScrollArea className="min-h-0 flex-1">
            {current ? (
              <InboxQuestionPanel
                key={current.key}
                item={current.item}
                environmentId={current.environmentId}
                size="page"
                className="mx-auto max-w-2xl px-6 py-6"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-24 text-center text-sm text-muted-foreground">
                <InboxIcon aria-hidden className="size-6 text-muted-foreground/60" />
                {loading ? t("inbox.loading") : t("inbox.empty")}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </AppRouteModal>
  );
}

function ListHeading({ className, children }: { className?: string; children: string }) {
  return (
    <h2
      className={cn(
        "truncate px-2 pt-3 pb-1 text-xs font-medium text-sidebar-muted-foreground/80 first:pt-1",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function EnvironmentHeading({
  environment,
  showLabel,
}: {
  environment: EnvironmentInbox;
  showLabel: boolean;
}) {
  const { t } = useI18n();
  const status = environment.failed
    ? t("inbox.failed")
    : environment.pending && environment.snapshot === null
      ? t("inbox.loading")
      : environment.snapshot?.askHumanAvailable === false
        ? t("inbox.unavailable")
        : null;
  if (!showLabel && status === null) return null;
  return (
    <div className="flex min-w-0 items-baseline gap-2 px-2 pt-4 pb-1 first:pt-1">
      {showLabel ? (
        <h2 className="truncate text-sm font-medium text-sidebar-foreground">
          {environment.label}
        </h2>
      ) : null}
      {status ? (
        <p
          role={environment.failed ? "alert" : undefined}
          className="truncate text-xs text-sidebar-muted-foreground"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

/** Where a question came from: its thread, or the folder it was asked in when T3 has no thread for it. */
function useQuestionOrigin(row: QuestionRow) {
  const { t } = useI18n();
  const thread = row.item.thread;
  if (thread === null) {
    const folder = row.item.workspace.split("/").findLast(Boolean);
    return { project: null, title: folder || row.item.agent || t("inbox.unknownThread") };
  }
  return {
    project: thread.projectTitle || t("inbox.other"),
    title: thread.title || t("inbox.untitledThread"),
  };
}

function QuestionListRow({
  row,
  active,
  onSelect,
}: {
  row: QuestionRow;
  active: boolean;
  onSelect: () => void;
}) {
  const origin = useQuestionOrigin(row);
  // Without a thread, who asked says more in a list than the folder does.
  const where = [
    row.environmentLabel,
    origin.project === null
      ? row.item.agent || origin.title
      : row.showThread
        ? `${origin.project} › ${origin.title}`
        : origin.title,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <SidebarMenuButton
      size="lg"
      isActive={active}
      aria-current={active || undefined}
      className="h-auto min-h-12 items-start"
      onClick={onSelect}
    >
      {/* Wrapped, so the menu button's icon tint leaves the question's colour alone. */}
      <span className="flex h-5 shrink-0 items-center">
        <InboxItemIcon item={row.item} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sidebar-foreground">
            {row.item.question}
          </span>
          <span className="shrink-0 text-2xs font-normal text-sidebar-muted-foreground/75 tabular-nums">
            <CompactTime timestamp={row.item.urgentAt ?? row.item.createdAt} />
          </span>
        </span>
        <span className="truncate text-2xs font-normal text-sidebar-muted-foreground/75">
          {where}
        </span>
      </span>
    </SidebarMenuButton>
  );
}

function QuestionBreadcrumb({ row }: { row: QuestionRow }) {
  const origin = useQuestionOrigin(row);
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-sm">
      {row.environmentLabel ? (
        <span className="shrink-0 text-muted-foreground">{row.environmentLabel}</span>
      ) : null}
      {origin.project ? (
        <>
          {row.environmentLabel ? <span className="text-muted-foreground/60">/</span> : null}
          <span className="max-w-48 shrink-0 truncate text-muted-foreground">{origin.project}</span>
          <span className="text-muted-foreground/60">/</span>
        </>
      ) : null}
      <span className="min-w-0 truncate font-medium">{origin.title}</span>
    </p>
  );
}
