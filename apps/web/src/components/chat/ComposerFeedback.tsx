import { i18n } from "@t3tools/shared/i18n";
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
              i18n.t("chat.ui.codexFeedbackThreadId"),
            ).catch((error: unknown) => {
              toastManager.add({
                type: "error",
                title: i18n.t("chat.ui.couldNotCopyThreadId"),
                description: error instanceof Error ? error.message : i18n.t("pr.anErrorOccurred"),
              });
            });
          }}
        >
          {i18n.t("chat.ui.copyId")}
        </Button>
      ) : undefined,
    ...(submission.status !== "uploading"
      ? { dismissLabel: "Dismiss feedback notice", onDismiss }
      : {}),
  };
}
