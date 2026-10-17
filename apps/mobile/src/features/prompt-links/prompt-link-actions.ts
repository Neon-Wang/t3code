import { i18n } from "@t3tools/shared/i18n";
import { buildNewThreadLink, type LinkedPrompt } from "@t3tools/shared/promptLinks";
import { Alert } from "react-native";

import { tryCopyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import {
  getComposerDraftSnapshot,
  setComposerDraftText,
  waitForComposerDraftsLoaded,
} from "../../state/use-composer-drafts";
import { linkedThreadDraftAction } from "./prompt-link-model";

/** Shows the one notice a prompt link owes the user, built with `promptLinkNotice`. */
export function showPromptLinkNotice(notice: string): void {
  Alert.alert(i18n.t("mobile.promptlinkactions.promptFromALink"), notice);
}

/**
 * Puts a linked prompt into an existing thread's composer draft. An empty composer is filled;
 * typed text is replaced only when the user says so. The notice rides in the same alert, so a
 * link never stacks two dialogs.
 */
export async function applyLinkedPromptToThreadDraft(
  draftKey: string,
  prompt: LinkedPrompt,
  notice: string,
): Promise<void> {
  try {
    await waitForComposerDraftsLoaded();
  } catch {
    Alert.alert(
      i18n.t("mobile.promptlinkactions.couldNotOpenLink"),
      i18n.t("mobile.promptlinkactions.draftsCouldNotBeLoadedSoThePromptWasNotAdded"),
    );
    return;
  }
  const action = linkedThreadDraftAction(getComposerDraftSnapshot(draftKey).text, prompt.text);
  if (action !== "ask") {
    if (action === "fill") setComposerDraftText(draftKey, prompt.text);
    showPromptLinkNotice(notice);
    return;
  }
  Alert.alert(i18n.t("mobile.promptlinkactions.linkedPromptReadyReplaceDraft"), notice, [
    { text: i18n.t("mobile.promptlinkactions.keepMine"), style: "cancel" },
    {
      text: i18n.t("mobile.promptlinkactions.replace"),
      onPress: () => setComposerDraftText(draftKey, prompt.text),
    },
  ]);
}

/** Copies a shareable link that opens a new task with this prompt. Used by sent user messages. */
export async function copyPromptLink(prompt: string): Promise<void> {
  if (!(await tryCopyTextWithHaptic(buildNewThreadLink({ prompt }), { target: "prompt link" }))) {
    Alert.alert(
      i18n.t("mobile.promptlinkactions.couldNotCopy"),
      i18n.t("mobile.promptlinkactions.tryAgain"),
    );
  }
}
