import { useRelativeTimeState } from "../../hooks/useRelativeTimeState";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type InboxItem,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { cn } from "../../lib/utils";
import { useInboxEnvironments, type EnvironmentInbox } from "../../state/inbox";
import { useEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

function InboxTime({ createdAt }: { createdAt: string }) {
  const { t } = useI18n();
  const state = useRelativeTimeState(createdAt);
  const value = state.status === "relative" ? state.value : "just now";
  const count = Number.parseInt(value, 10);
  const label = value.endsWith("m")
    ? t("inbox.timeMinutes", { count })
    : value.endsWith("h")
      ? t("inbox.timeHours", { count })
      : value.endsWith("d")
        ? t("inbox.timeDays", { count })
        : t("inbox.timeJustNow");
  return (
    <Tooltip>
      <TooltipTrigger render={<time dateTime={createdAt} />}>{label}</TooltipTrigger>
      <TooltipPopup>{new Date(createdAt).toLocaleString()}</TooltipPopup>
    </Tooltip>
  );
}

export function InboxPage() {
  const { t } = useI18n();
  const environments = useInboxEnvironments();
  return (
    <AppRouteModal label={t("inbox.title")}>
      <header className="flex min-h-12 shrink-0 items-center justify-between border-b ps-5 pe-2">
        <h1 className="font-medium">{t("inbox.title")}</h1>
        <AppRouteModalClose />
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
          {environments.length === 0 ? <p>{t("inbox.noEnvironments")}</p> : null}
          {environments.map((environment) => (
            <EnvironmentQuestions
              key={environment.environmentId}
              environment={environment}
              showEnvironment={environments.length > 1}
            />
          ))}
        </div>
      </ScrollArea>
    </AppRouteModal>
  );
}

function EnvironmentQuestions({
  environment,
  showEnvironment,
}: {
  environment: EnvironmentInbox;
  showEnvironment: boolean;
}) {
  const { t } = useI18n();
  const items = environment.snapshot?.items ?? [];
  // Urgent questions sit above the project groups; the server already sorts them first.
  const urgent = items.filter((item) => item.urgent);
  const groups = new Map<string, InboxItem[]>();
  for (const item of items) {
    if (item.urgent) continue;
    const key = item.thread?.projectId ?? "";
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return (
    <section className="flex flex-col gap-4">
      {showEnvironment ? <h2 className="text-lg font-medium">{environment.label}</h2> : null}
      {environment.failed ? (
        <p role="alert">{t("inbox.failed")}</p>
      ) : environment.pending && environment.snapshot === null ? (
        <p>{t("inbox.loading")}</p>
      ) : null}
      {environment.snapshot?.askHumanAvailable === false ? (
        <p className="text-sm text-muted-foreground">{t("inbox.unavailable")}</p>
      ) : null}
      {environment.snapshot?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("inbox.empty")}</p>
      ) : null}
      {urgent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-medium text-destructive-foreground">{t("inbox.urgent")}</h3>
          {urgent.map((item) => (
            <InboxQuestion
              key={item.id}
              item={item}
              environmentId={environment.environmentId}
              showThread
            />
          ))}
        </section>
      ) : null}
      {[...groups].map(([projectId, items]) => {
        const threads = new Map<string, InboxItem[]>();
        for (const item of items) {
          const key = item.thread?.id ?? "";
          const group = threads.get(key) ?? [];
          group.push(item);
          threads.set(key, group);
        }
        return (
          <section key={projectId} className="flex flex-col gap-3">
            <h3 className="font-medium">{items[0]?.thread?.projectTitle || t("inbox.other")}</h3>
            {[...threads].map(([threadId, questions]) => (
              <section key={threadId} className="flex flex-col gap-3">
                {threadId ? (
                  <h4 className="text-sm text-muted-foreground">
                    {questions[0]?.thread?.title || t("inbox.untitledThread")}
                  </h4>
                ) : null}
                {questions.map((item) => (
                  <InboxQuestion
                    key={item.id}
                    item={item}
                    environmentId={environment.environmentId}
                  />
                ))}
              </section>
            ))}
          </section>
        );
      })}
    </section>
  );
}

function InboxQuestion({
  item,
  environmentId,
  showThread = false,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  /** Urgent cards sit outside their project group, so they name their thread themselves. */
  showThread?: boolean;
}) {
  const { t } = useI18n();
  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 break-words",
        item.urgent && "border-destructive/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {item.urgent ? <Badge variant="destructive">{t("inbox.urgent")}</Badge> : null}
        <Badge variant={item.kind === "action" ? "warning" : "secondary"}>
          {item.kind === "action" ? t("inbox.action") : t("inbox.decision")}
        </Badge>
        <span>
          {item.thread === null
            ? t("inbox.unknownThread")
            : item.thread.active
              ? t("inbox.running")
              : t("inbox.ended")}
        </span>
        <InboxTime createdAt={item.createdAt} />
        {item.agent ? <span>{item.agent}</span> : null}
        {showThread && item.thread !== null ? (
          <span>
            {item.thread.projectTitle || t("inbox.other")} ·{" "}
            {item.thread.title || t("inbox.untitledThread")}
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap font-medium">{item.question}</p>
      {item.urgent && item.urgentReason ? (
        <p className="whitespace-pre-wrap text-sm text-destructive-foreground">
          {t("inbox.urgentReason")}: {item.urgentReason}
        </p>
      ) : null}
      {item.context ? (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t("inbox.context")}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm">{item.context}</p>
        </details>
      ) : null}
      {item.thread === null ? (
        <div className="text-xs text-muted-foreground">
          {item.threadId ? (
            <p>
              {t("inbox.threadId")}: {item.threadId}
            </p>
          ) : null}
          {item.workspace ? (
            <p>
              {t("inbox.workspace")}: {item.workspace}
            </p>
          ) : null}
        </div>
      ) : null}
      <AskHumanAnswer item={item} environmentId={environmentId} />
      {!canOperate ? <p className="text-xs text-muted-foreground">{t("inbox.readOnly")}</p> : null}
      {item.thread !== null ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                to="/$environmentId/$threadId"
                params={{ environmentId, threadId: item.thread.id }}
              />
            }
          >
            {t("inbox.openThread")}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function AskHumanAnswer({
  item,
  environmentId,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canAnswer = useAtomValue(serverEnvironment.answerAskHuman.permissionAtom(environmentId));
  const canClose = useAtomValue(serverEnvironment.closeAskHuman.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.answerAskHuman, { reportFailure: false });
  const close = useAtomCommand(serverEnvironment.closeAskHuman, { reportFailure: false });
  const submit = async (value: string, isClose = false) => {
    setBusy(true);
    const result = isClose
      ? await close({ environmentId, input: { id: item.id, reason: value } })
      : await answer({ environmentId, input: { id: item.id, text: value } });
    setBusy(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title:
          error instanceof Error && "code" in error && error.code === "already_processed"
            ? t("inbox.alreadyProcessed")
            : isClose
              ? t("inbox.closeFailed")
              : t("inbox.submitFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {item.options.map((option) => (
          <Button
            key={option}
            variant={option === item.recommend ? "default" : "outline"}
            disabled={busy || !canAnswer}
            onClick={() => void submit(option)}
          >
            {option}
            {option === item.recommend ? ` · ${t("inbox.recommend")}` : ""}
          </Button>
        ))}
      </div>
      {item.recommend && !item.options.includes(item.recommend) ? (
        <p className="text-sm">
          {t("inbox.recommend")}: {item.recommend}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text.trim());
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
            disabled={busy || !canAnswer}
          />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy || !canAnswer || !text.trim()}>
            {t("inbox.answer")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !canClose}
            onClick={() => setClosing(!closing)}
          >
            {closing ? t("inbox.cancel") : t("inbox.close")}
          </Button>
        </div>
      </form>
      {closing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(reason, true);
          }}
        >
          <Textarea
            aria-label={t("inbox.reason")}
            placeholder={t("inbox.reason")}
            rows={1}
            size="sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy || !canClose}
          />
          <div>
            <Button type="submit" variant="destructive" disabled={busy || !canClose}>
              {t("inbox.close")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
