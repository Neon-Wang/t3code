import { useI18n } from "../../hooks/useI18n";
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import { SendIcon } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

import { TextFieldSpeechControls, useTextFieldSpeech } from "~/speech/useTextFieldSpeech";

import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { MarkdownTextarea, type CompletionScope } from "./MarkdownTextarea";
import { pullRequestReviewKey } from "../pullRequest/pullRequestReviewStore";
import { useInlineActionConfirm } from "../pullRequest/useInlineActionConfirm";

export function CommentForm({
  environmentId,
  active,
  reference,
  term,
  completionScope,
  followUpAction,
  onPost,
  actionPending,
  textareaRef,
  onCommentAction,
  onCommented,
  onClose,
}: {
  environmentId: EnvironmentId;
  /** False while the form stays mounted but hidden; dictation is cancelled then. */
  active: boolean;
  reference: PullRequestRef;
  term: string;
  completionScope: CompletionScope | null;
  followUpAction: "close" | "reopen" | null;
  onPost: (body: string) => Promise<boolean>;
  actionPending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onCommentAction: (
    body: string,
    action: "close" | "reopen",
  ) => Promise<{ readonly commentPosted: boolean }>;
  onCommented: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState<"comment" | "close" | "reopen" | null>(null);
  const locked = submitting !== null || actionPending;
  const speech = useTextFieldSpeech({
    environmentId,
    projectId: reference.projectId,
    ownerKey: JSON.stringify(["pr-comment", environmentId, reference]),
    text: body,
    textareaRef,
    onTextChange: setBody,
    disabled: !active || locked,
  });
  const { cancel } = speech;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- discards a recording when the hidden form can no longer be submitted
  useEffect(() => {
    if (!active) cancel();
  }, [active, cancel]);
  const inlineConfirm = useInlineActionConfirm(pullRequestReviewKey(reference));

  const submit = async (action: "comment" | "close" | "reopen", text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || submitting !== null || actionPending) return;
    setSubmitting(action);
    if (action !== "comment") {
      const result = await onCommentAction(trimmed, action);
      if (result.commentPosted) {
        setBody("");
        onClose();
      }
      setSubmitting(null);
      return;
    }
    const saved = await onPost(trimmed);
    if (!saved) {
      setSubmitting(null);
      toastManager.add({ type: "error", title: t("pr.couldNotPostTheComment") });
      return;
    }
    setBody("");
    setSubmitting(null);
    onClose();
    onCommented();
  };
  const submitAfterDictation = (action: "comment" | "close" | "reopen") =>
    speech.submitAfterDictation((text) => void submit(action, text));
  const submitDisabled =
    speech.preparing || (body.trim().length === 0 && !speech.blocksSubmission) || locked;

  return (
    <div className="space-y-2">
      <MarkdownTextarea
        ref={textareaRef}
        completionScope={completionScope}
        // Lock while posting because success clears the draft.
        disabled={locked}
        readOnly={speech.freezesEditor}
        value={body}
        rows={3}
        placeholder={t("pr.leaveAComment")}
        aria-label={t("pr.commentOnThisTerm", {
          term,
        })}
        onValueChange={setBody}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            !event.shiftKey &&
            !event.altKey
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) submitAfterDictation("comment");
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-1">
          <TextFieldSpeechControls speech={speech} disabled={locked} />
        </div>
        {followUpAction === null ? null : (
          <Button
            size="xs"
            variant={followUpAction === "close" ? "destructive-outline" : "outline"}
            disabled={submitDisabled}
            {...(followUpAction === "close"
              ? inlineConfirm.props("close", () => submitAfterDictation("close"))
              : { onClick: () => submitAfterDictation("reopen") })}
          >
            {followUpAction === "close" ? (
              <PullRequestGlyph.closed className="size-3.5" />
            ) : (
              <PullRequestGlyph.reopen className="size-3.5" />
            )}
            {followUpAction === "close" ? (
              // The longest label holds the width, so the confirming click lands on the button.
              <span className="inline-grid">
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {t("pr.closeWithComment")}
                </span>
                <span className="col-start-1 row-start-1">
                  {submitting === "close"
                    ? t("pr.closing")
                    : inlineConfirm.isArmed("close")
                      ? t("v2.surfaces.copy211")
                      : t("pr.closeWithComment")}
                </span>
              </span>
            ) : submitting === "reopen" ? (
              t("pr.reopening")
            ) : (
              t("pr.reopenWithComment")
            )}
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={submitDisabled}
          onClick={() => submitAfterDictation("comment")}
        >
          <SendIcon className="size-3.5" />
          {submitting === "comment" ? t("pr.posting") : t("pr.comment")}
        </Button>
      </div>
    </div>
  );
}
