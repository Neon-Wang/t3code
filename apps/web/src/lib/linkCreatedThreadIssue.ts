import type { ScopedThreadRef } from "@t3tools/contracts";
import { parseIssueLink } from "@t3tools/client-runtime/issues";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { i18n } from "@t3tools/shared/i18n";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { threadEnvironment } from "~/state/threads";
import { toastManager } from "~/components/ui/toast";

/** Called after the server owns the draft; a link failure must not resend its message. */
export async function linkCreatedThreadIssue(ref: ScopedThreadRef, url: string) {
  const issue = parseIssueLink(url);
  if (!issue) {
    toastManager.add({
      type: "error",
      title: i18n.t("issue.linkFailed"),
      description: i18n.t("issue.invalidLink"),
    });
    return;
  }
  await runAtomCommand(
    appAtomRegistry,
    threadEnvironment.linkIssue,
    {
      environmentId: ref.environmentId,
      input: { threadId: ref.threadId, ...issue, source: "created" },
    },
    { label: i18n.t("issue.linkFailed") },
  );
}
