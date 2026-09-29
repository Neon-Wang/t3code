import { i18n } from "@t3tools/shared/i18n";
import type { ContextMenuItem } from "@t3tools/contracts";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-external";

/** Named for the host rather than "externally": the point is where you will land. */
function getOpenOnHostLabels(t: typeof i18n.t = i18n.t): Partial<Record<string, string>> {
  return {
    github: t("pr.openOnGithub"),
    gitlab: t("pr.openOnGitlab"),
    forgejo: t("pr.openOnForgejo"),
    bitbucket: t("pr.openOnBitbucket"),
    "azure-devops": t("pr.openOnAzureDevops"),
  };
}

export const openOnHostLabel = (provider: string, t: typeof i18n.t = i18n.t): string =>
  getOpenOnHostLabels(t)[provider] ?? t("pr.openOnHost");

/** Copy first: it is the reason to right-click a number rather than click it. */
function pullRequestLinkContextMenuItems(
  openLabel: string,
  t: typeof i18n.t = i18n.t,
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "copy-link", label: t("pr.copyLink"), icon: "copy" },
    { id: "open-external", label: openLabel },
  ];
}

/**
 * The right-click on a change request's number. Everywhere else that number is written it is a
 * link, and the gesture that copies a link is the one hand reaches for — so without this the
 * platform's own edit menu opens over a control that has nothing to cut, paste or select.
 *
 * The host is named by the caller rather than guessed here: the same number belongs to GitHub,
 * GitLab, Bitbucket or Azure DevOps depending on where it was read, and the `url` the contract
 * carries is already whichever of them it came from.
 */
export async function showPullRequestLinkContextMenu(
  {
    url,
    openLabel,
    position,
  }: {
    readonly url: string;
    readonly openLabel: string;
    readonly position: { readonly x: number; readonly y: number };
  },
  t: typeof i18n.t = i18n.t,
): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(pullRequestLinkContextMenuItems(openLabel, t), position);
  } catch {
    // A menu that could not be shown has already cost the reader their right-click; there is
    // nothing to say about it that a second popup would not make worse.
    return;
  }
  try {
    if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title: action === "copy-link" ? t("pr.couldNotCopyTheLink") : t("pr.couldNotOpenTheLink"),
    });
  }
}
