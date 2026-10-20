import * as Dialog from "../../components/ui/Dialog";
import { i18n } from "@t3tools/shared/i18n";
import { buildNewThreadLink, type LinkedPrompt } from "@t3tools/shared/promptLinks";

import { tryCopyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import {
  getComposerDraftSnapshot,
  setComposerDraftText,
  waitForComposerDraftsLoaded,
} from "../../state/use-composer-drafts";
import { linkedThreadDraftAction } from "./prompt-link-model";

export function showPromptLinkNotice(notice: string): void {
  Dialog.alert(i18n.t("mobile.promptlinkactions.promptFromALink"), notice);
}

export async function applyLinkedPromptToThreadDraft(
  draftKey: string,
  prompt: LinkedPrompt,
  notice: string,
): Promise<void> {
  try {
    await waitForComposerDraftsLoaded();
  } catch {
    Dialog.alert(
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
  Dialog.alert(i18n.t("mobile.promptlinkactions.linkedPromptReadyReplaceDraft"), notice, [
    { text: i18n.t("mobile.promptlinkactions.keepMine"), style: "cancel" },
    {
      text: i18n.t("mobile.promptlinkactions.replace"),
      onPress: () => setComposerDraftText(draftKey, prompt.text),
    },
  ]);
}

export async function copyPromptLink(prompt: string): Promise<void> {
  if (!(await tryCopyTextWithHaptic(buildNewThreadLink({ prompt }), { target: "prompt link" }))) {
    Dialog.alert(
      i18n.t("mobile.promptlinkactions.couldNotCopy"),
      i18n.t("mobile.promptlinkactions.tryAgain"),
    );
  }
}
