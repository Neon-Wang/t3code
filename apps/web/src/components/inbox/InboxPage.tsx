import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { type EnvironmentId, type InboxItem } from "@t3tools/contracts";
import { inboxRows } from "@t3tools/client-runtime/state/inbox-rows";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { HandIcon, InboxIcon, MessageCircleQuestionIcon } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { cn } from "../../lib/utils";
import { useInboxEnvironments, type EnvironmentInbox } from "../../state/inbox";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import ChatMarkdown from "../ChatMarkdown";
import { ComposerBanner } from "../chat/ComposerBanner";
import { OptionRadio } from "../chat/ComposerPendingUserInputPanel";
import { useRelativeTimeState } from "../../hooks/useRelativeTimeState";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";

/** The sidebar's compact age ("5m", "2d", "now"), so both lists read the same. */
function CompactTime({ timestamp }: { timestamp: string }) {
  const relative = useRelativeTimeState(timestamp);
  if (relative.status !== "relative") return null;
  return relative.value === "just now" ? "now" : relative.value;
}

/** Small labels between cards, in the same voice as the settings and PR list headings. */
function SectionLabel({ className, children }: { className?: string; children: string }) {
  return (
    <h2 className={cn("mt-4 mb-0.5 px-1 text-xs font-medium text-muted-foreground", className)}>
      {children}
    </h2>
  );
}

export function InboxPage() {
  const { t } = useI18n();
  const environments = useInboxEnvironments();
  // One flat list, so a card keeps its state when an escalation moves it to the top.
  const rows = inboxRows(environments);
  const total = environments.reduce((sum, env) => sum + (env.snapshot?.items.length ?? 0), 0);
  return (
    <AppRouteModal label={t("inbox.title")}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b ps-5 pe-2">
        <h1 className="text-sm font-medium">{t("inbox.title")}</h1>
        {total > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
        ) : null}
        <div className="ms-auto">
          <AppRouteModalClose />
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 pt-1 pb-8 sm:px-6">
          {environments.length === 0 ? <EmptyState label={t("inbox.noEnvironments")} /> : null}
          {environments.length > 0 && total === 0 && environments.every((env) => env.snapshot) ? (
            <EmptyState label={t("inbox.empty")} />
          ) : null}
          {rows.map((row) => {
            switch (row.kind) {
              case "urgent-header":
                return (
                  <SectionLabel key={row.key} className="text-destructive-foreground">
                    {t("inbox.urgent")}
                  </SectionLabel>
                );
              case "environment":
                return (
                  <EnvironmentStatus
                    key={row.key}
                    environment={row.environment}
                    showLabel={environments.length > 1}
                  />
                );
              case "project":
                return <SectionLabel key={row.key}>{row.title || t("inbox.other")}</SectionLabel>;
              case "thread":
                // Cards name their thread in their own header.
                return null;
              case "question":
                return (
                  <InboxQuestion
                    key={row.key}
                    item={row.item}
                    environmentId={row.environmentId}
                    environmentLabel={row.environmentLabel}
                    showProject={row.showThread}
                  />
                );
            }
          })}
        </div>
      </ScrollArea>
    </AppRouteModal>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
      <InboxIcon aria-hidden className="size-6 text-muted-foreground/60" />
      {label}
    </div>
  );
}

function EnvironmentStatus({
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
    <div className="mt-4 flex items-baseline gap-2 px-1">
      {showLabel ? <h2 className="text-sm font-medium">{environment.label}</h2> : null}
      {status ? (
        <p
          role={environment.failed ? "alert" : undefined}
          className="text-xs text-muted-foreground"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

/** An ask-human question drawn like the composer's AskUserQuestion panel. */
function InboxQuestion({
  item,
  environmentId,
  environmentLabel,
  showProject,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  environmentLabel: string | null;
  /** Urgent cards sit outside their project group, so they name the project too. */
  showProject: boolean;
}) {
  const { t } = useI18n();
  // Urgent questions open by default; the user's own toggle wins once they use it.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? item.urgent;
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAnswer = useAtomValue(serverEnvironment.answerAskHuman.permissionAtom(environmentId));
  const canClose = useAtomValue(serverEnvironment.closeAskHuman.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.answerAskHuman, { reportFailure: false });
  const close = useAtomCommand(serverEnvironment.closeAskHuman, { reportFailure: false });

  const run = async (action: "answer" | "close", value: string) => {
    setBusy(true);
    const result =
      action === "close"
        ? await close({ environmentId, input: { id: item.id, reason: value } })
        : await answer({ environmentId, input: { id: item.id, text: value } });
    setBusy(false);
    if (result._tag === "Failure") {
      setSelected(null);
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title:
          error instanceof Error && "code" in error && error.code === "already_processed"
            ? t("inbox.alreadyProcessed")
            : action === "close"
              ? t("inbox.closeFailed")
              : t("inbox.submitFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const thread = item.thread;
  // Without a known thread, the asking agent is the most useful origin to show.
  const where =
    thread === null
      ? item.agent || t("inbox.unknownThread")
      : showProject
        ? `${thread.projectTitle || t("inbox.other")} › ${thread.title || t("inbox.untitledThread")}`
        : thread.title || t("inbox.untitledThread");
  const disabled = busy || !canAnswer;

  return (
    <ComposerBanner.Root
      detached
      density="comfortable"
      variant={item.urgent ? "error" : item.kind === "action" ? "warning" : "default"}
    >
      <ComposerBanner.Row
        render={<button type="button" />}
        aria-expanded={expanded}
        onClick={() => setToggled(!expanded)}
        className="py-0.5"
      >
        <ComposerBanner.Icon
          className={cn(
            item.urgent && "text-destructive-foreground",
            !item.urgent && item.kind === "action" && "text-warning",
          )}
        >
          {item.urgent ? (
            <ComposerBanner.Dot />
          ) : item.kind === "action" ? (
            <HandIcon />
          ) : (
            <MessageCircleQuestionIcon />
          )}
        </ComposerBanner.Icon>
        <ComposerBanner.Content>
          {item.urgent ? (
            <>
              <span className="shrink-0 font-medium text-destructive-foreground">
                {t("inbox.urgent")}
              </span>
              <ComposerBanner.Separator />
            </>
          ) : item.kind === "action" ? (
            <>
              <span className="shrink-0 font-medium text-warning">{t("inbox.action")}</span>
              <ComposerBanner.Separator />
            </>
          ) : null}
          <span className={cn("min-w-0 truncate text-muted-foreground", !expanded && "max-w-1/2")}>
            {environmentLabel ? `${environmentLabel} › ${where}` : where}
          </span>
          {!expanded ? (
            <>
              <ComposerBanner.Separator />
              <span className="min-w-0 flex-1 truncate text-secondary-label">{item.question}</span>
            </>
          ) : null}
        </ComposerBanner.Content>
        <ComposerBanner.Actions className="gap-0">
          <span className="px-1 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
            <CompactTime timestamp={item.urgentAt ?? item.createdAt} />
          </span>
          {/* The composer's banner opens upward; cards here open downward, so flip the chevron. */}
          <ComposerBanner.ToggleIcon expanded={!expanded} />
          <ComposerBanner.Dismiss
            render={<span role="button" tabIndex={0} />}
            aria-label={t("inbox.close")}
            title={t("inbox.close")}
            disabled={busy || !canClose}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!busy && canClose) void run("close", "");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              if (!busy && canClose) void run("close", "");
            }}
          />
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
      {expanded ? (
        <ComposerBanner.Body className="flex flex-col gap-1.5 ps-6 pe-4 pb-2 wrap-anywhere sm:ps-5.5">
          <ChatMarkdown
            text={item.question}
            cwd={item.workspace || undefined}
            className="pt-0.5 text-foreground/85"
          />
          {item.urgent && item.urgentReason ? (
            <p className="text-2xs text-destructive-foreground">
              {t("inbox.urgentReason", { reason: item.urgentReason })}
            </p>
          ) : null}
          {item.context ? (
            <p className="text-2xs whitespace-pre-wrap text-secondary-label">{item.context}</p>
          ) : null}
          {item.options.length > 0 ? (
            <div className="-ms-2 sm:-ms-1.5">
              {item.options.map((option) => {
                const checked = selected === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={checked}
                    disabled={disabled}
                    onClick={() => {
                      setSelected(option);
                      void run("answer", option);
                    }}
                    className={cn(
                      "group flex w-full items-start gap-2.5 rounded-md bg-transparent py-1.5 ps-2 text-start outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/25 sm:ps-1.5",
                      checked ? "text-foreground" : "text-foreground/70 hover:bg-muted/30",
                      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    )}
                  >
                    <span className="pointer-events-none flex h-5 shrink-0 items-center">
                      <OptionRadio checked={checked} />
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="text-sm font-medium">{option}</span>
                      {option === item.recommend ? (
                        <span className="text-2xs text-muted-foreground">
                          {t("inbox.recommend")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {item.recommend && !item.options.includes(item.recommend) ? (
            <p className="text-2xs text-secondary-label">
              {t("inbox.recommend")}: {item.recommend}
            </p>
          ) : null}
          <form
            className="flex items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) void run("answer", text.trim());
            }}
          >
            <div className="min-w-0 flex-1">
              <Textarea
                aria-label={t("inbox.answerPlaceholder")}
                placeholder={t("inbox.answerPlaceholder")}
                rows={1}
                size="sm"
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={disabled}
              />
            </div>
            <Button type="submit" size="xs" disabled={disabled || !text.trim()}>
              {t("inbox.answer")}
            </Button>
          </form>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            {item.agent && thread !== null ? <span className="truncate">{item.agent}</span> : null}
            {thread === null && item.workspace ? (
              <span className="min-w-0 truncate font-mono">{item.workspace}</span>
            ) : null}
            {!canAnswer ? <span>{t("inbox.readOnly")}</span> : null}
            {thread !== null ? (
              <Button
                variant="ghost"
                size="xs"
                className="ms-auto"
                render={
                  <Link
                    to="/$environmentId/$threadId"
                    params={{ environmentId, threadId: thread.id }}
                  />
                }
              >
                {t("inbox.openThread")}
              </Button>
            ) : null}
          </div>
        </ComposerBanner.Body>
      ) : null}
    </ComposerBanner.Root>
  );
}
