import { i18n, type I18n } from "@t3tools/shared/i18n";
import {
  codexFeedbackNotice,
  type CodexFeedbackSubmission,
} from "@t3tools/client-runtime/state/threads";
import { MessageSquareIcon } from "lucide-react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

export function feedbackBannerItem(
  submission: CodexFeedbackSubmission,
  onDismiss: () => void,
  t: I18n["t"] = i18n.t,
): ComposerBannerStackItem | null {
  const notice = codexFeedbackNotice(submission);
  if (!notice) return null;
  return {
    id: `feedback:${submission.id}`,
    variant:
      submission.status === "failed" ? "error" : submission.status === "sent" ? "success" : "info",
    priority: submission.status === "uploading" ? "activity" : "notice",
    icon: <MessageSquareIcon />,
    ...notice,
    actions:
      submission.status === "sent" ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void writeTextToClipboard(
              submission.feedbackId,
              t("chat.ui.codexFeedbackThreadId"),
            ).catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: t("chat.ui.couldNotCopyThreadId"),
                description:
                  error instanceof Error ? error.message : t("settings.misc.unknownError"),
              });
            });
          }}
        >
          {t("chat.ui.copyId")}
        </Button>
      ) : undefined,
    ...(submission.status !== "uploading"
      ? { dismissLabel: t("chat.ui.dismissFeedbackNotice"), onDismiss }
      : {}),
  };
}
