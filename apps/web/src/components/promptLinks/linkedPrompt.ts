import { i18n } from "@t3tools/shared/i18n";
import type { LinkedPrompt } from "@t3tools/shared/promptLinks";

import { type ComposerThreadTarget, useComposerDraftStore } from "~/composerDraftStore";

import { toastManager } from "../ui/toast";

/** A warning that stays until dismissed when the link's prompt hid characters from the reader. */
export function warnAboutHiddenCharacters(prompt: LinkedPrompt): void {
  if (prompt.hiddenCharacters === 0) return;
  toastManager.add({
    type: "warning",
    title: i18n.t("v2.surfaces.copy45"),
    description: `T3 Code removed ${prompt.hiddenCharacters} hidden character${prompt.hiddenCharacters === 1 ? "" : "s"}. Read the prompt before you send it.`,
    timeout: 0,
  });
}

/**
 * Puts a linked prompt in a composer for the user to read and send. Text the user already typed
 * there is never replaced without asking: a toast offers to swap it for the linked prompt.
 * `notes` carry anything the link asked for and did not get, such as a model.
 */
export function placeLinkedPrompt(
  target: ComposerThreadTarget,
  prompt: LinkedPrompt,
  notes: ReadonlyArray<string> = [],
): void {
  warnAboutHiddenCharacters(prompt);
  const place = () => {
    useComposerDraftStore.getState().setPrompt(target, prompt.text);
    // It was not written here, so it must be read before it is sent.
    toastManager.add({
      type: "info",
      title: i18n.t("v2.surfaces.copy258"),
      description: ["Read it before you send.", ...notes].join(" "),
    });
  };
  const existing = useComposerDraftStore.getState().getComposerDraft(target)?.prompt ?? "";
  if (existing.trim().length === 0 || existing === prompt.text) {
    place();
    return;
  }
  const id = toastManager.add({
    type: "info",
    title: i18n.t("v2.surfaces.copy259"),
    description: i18n.t("v2.surfaces.copy260"),
    timeout: 0,
    actionProps: {
      children: "Replace draft",
      onClick: () => {
        toastManager.close(id);
        place();
      },
    },
  });
}
