import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, InboxItem } from "@t3tools/contracts";
import { CircleAlertIcon, HandIcon, MessageCircleQuestionIcon } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../../hooks/useI18n";
import { useRelativeTimeState } from "../../hooks/useRelativeTimeState";
import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import ChatMarkdown from "../ChatMarkdown";
import { OptionRadio } from "../chat/ComposerPendingUserInputPanel";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon } from "../ui/input-group";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";

// Unsent answers outlive the panel, so switching questions or closing a popover keeps them.
const drafts = new Map<string, string>();

/** The sidebar's compact age ("5m", "2d", "now"), so every list reads the same. */
export function CompactTime({ timestamp }: { timestamp: string }) {
  const relative = useRelativeTimeState(timestamp);
  if (relative.status !== "relative") return null;
  return relative.value === "just now" ? "now" : relative.value;
}

/** Urgent questions read red and hands-on actions amber; plain decisions stay quiet. */
export function InboxItemIcon({ item, className }: { item: InboxItem; className?: string }) {
  const Icon = item.urgent
    ? CircleAlertIcon
    : item.kind === "action"
      ? HandIcon
      : MessageCircleQuestionIcon;
  return (
    <Icon
      aria-hidden
      className={cn(
        "shrink-0",
        item.urgent
          ? "text-destructive-foreground"
          : item.kind === "action"
            ? "text-warning-foreground"
            : "text-muted-foreground",
        className,
      )}
    />
  );
}

/** One ask-human question with everything needed to answer or close it. */
export function InboxQuestionPanel({
  item,
  environmentId,
  size = "popover",
  className,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  /** "page" gives the question more room in the inbox's detail pane. */
  size?: "popover" | "page";
  className?: string;
}) {
  const { t } = useI18n();
  const draftKey = `${environmentId}:${item.id}`;
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canAnswer = useAtomValue(serverEnvironment.answerAskHuman.permissionAtom(environmentId));
  const canClose = useAtomValue(serverEnvironment.closeAskHuman.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.answerAskHuman, { reportFailure: false });
  const close = useAtomCommand(serverEnvironment.closeAskHuman, { reportFailure: false });

  const setText = (value: string) => {
    setTextState(value);
    if (value) drafts.set(draftKey, value);
    else drafts.delete(draftKey);
  };

  const run = async (action: "answer" | "close", value: string) => {
    setBusy(true);
    const result =
      action === "close"
        ? await close({ environmentId, input: { id: item.id, reason: value } })
        : await answer({ environmentId, input: { id: item.id, text: value } });
    setBusy(false);
    if (result._tag === "Success") {
      drafts.delete(draftKey);
      return;
    }
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
  };

  const disabled = busy || !canAnswer;
  const submit = () => {
    const value = text.trim();
    if (value && !disabled) void run("answer", value);
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-3 wrap-anywhere", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {item.urgent || item.kind === "action" ? (
          <>
            <InboxItemIcon item={item} className="size-3.5" />
            <span
              className={cn(
                "shrink-0 font-medium",
                item.urgent ? "text-destructive-foreground" : "text-warning-foreground",
              )}
            >
              {item.urgent ? t("inbox.urgent") : t("inbox.action")}
            </span>
            {item.agent ? <span aria-hidden>·</span> : null}
          </>
        ) : null}
        <span className="min-w-0 truncate">{item.agent}</span>
        <span className="ms-auto shrink-0 tabular-nums">
          <CompactTime timestamp={item.urgentAt ?? item.createdAt} />
        </span>
      </div>

      <ChatMarkdown
        text={item.question}
        cwd={item.workspace || undefined}
        className={cn("font-medium text-foreground", size === "page" && "text-base")}
      />

      {item.urgent && item.urgentReason ? (
        <p className="rounded-lg bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive-foreground">
          {t("inbox.urgentReason", { reason: item.urgentReason })}
        </p>
      ) : null}

      {item.context ? (
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {item.context}
        </p>
      ) : null}

      {item.options.length > 0 ? (
        <div className="-mx-1.5 flex flex-col">
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
                  "flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-start outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/25",
                  checked ? "text-foreground" : "text-foreground/80 hover:bg-muted/40",
                  disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                )}
              >
                <span className="pointer-events-none flex h-5 shrink-0 items-center">
                  <OptionRadio checked={checked} />
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="text-sm">{option}</span>
                  {option === item.recommend ? (
                    <span className="shrink-0 text-2xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground">
          {t("inbox.recommendValue", { value: item.recommend })}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <InputGroup>
          <Textarea
            unstyled
            rows={2}
            aria-label={t("inbox.answerPlaceholder")}
            placeholder={t("inbox.answerPlaceholder")}
            value={text}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
              event.preventDefault();
              submit();
            }}
          />
          <InputGroupAddon align="block-end">
            {canClose ? (
              <Button
                type="button"
                variant="ghost-muted"
                size="xs"
                disabled={busy}
                onClick={() => void run("close", "")}
              >
                {t("inbox.close")}
              </Button>
            ) : null}
            {!canAnswer ? (
              <span className="text-xs text-muted-foreground">{t("inbox.readOnly")}</span>
            ) : null}
            <Button type="submit" size="xs" className="ms-auto" disabled={disabled || !text.trim()}>
              {t("inbox.answer")}
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
