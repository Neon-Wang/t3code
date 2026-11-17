import { issueKey } from "@t3tools/client-runtime/issues";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import { CircleDotIcon, LinkIcon, UnlinkIcon } from "lucide-react";
import { useState } from "react";
import { useI18n } from "~/hooks/useI18n";
import { useThreadShell } from "~/state/entities";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { useEnvironmentScope } from "~/state/session";
import { useOpenLinkedReference } from "../sourceControl/LinkedReferences";
import { Button } from "../ui/button";
import { openLinkIssueDialog } from "./LinkIssueDialog";
import { IssueIcon } from "./IssueIcon";

export function ThreadIssues({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useThreadShell(threadRef);
  return thread ? <ThreadIssueRows threadRef={threadRef} thread={thread} /> : null;
}
function ThreadIssueRows({
  threadRef,
  thread,
}: {
  threadRef: ScopedThreadRef;
  thread: NonNullable<ReturnType<typeof useThreadShell>>;
}) {
  const { t } = useI18n();
  const open = useOpenLinkedReference(threadRef.environmentId, thread.projectId, threadRef);
  const unlink = useOrchestrationCommand(threadEnvironment.unlinkIssue);
  const allowed = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const [pending, setPending] = useState<string | null>(null);
  return (
    <div className="min-w-0 space-y-1">
      {(thread.issues ?? []).map((issue) => (
        <div key={issueKey(issue)} className="flex min-w-0 items-center gap-1">
          <a
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
            href={issue.url}
            onClick={(event) => open(event, issue, "issue")}
          >
            <IssueIcon
              state={issue.snapshot?.state ?? "open"}
              closeReason={issue.snapshot?.closeReason ?? null}
            />
            <span className="shrink-0">#{issue.number}</span>
            <span className="truncate">{issue.snapshot?.title ?? issue.repository}</span>
          </a>
          {allowed ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`${t("issue.unlink")} #${issue.number}`}
              disabled={pending !== null}
              onClick={() => {
                setPending(issue.url);
                void unlink({
                  environmentId: threadRef.environmentId,
                  input: {
                    threadId: threadRef.threadId,
                    host: issue.host,
                    repository: issue.repository,
                    number: issue.number,
                  },
                }).then(() => setPending(null));
              }}
            >
              <UnlinkIcon className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ))}
      {(thread.issues ?? []).length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">{t("issue.noLinkedIssues")}</p>
      ) : null}
      {allowed ? (
        <Button size="xs" variant="ghost" onClick={() => openLinkIssueDialog(threadRef)}>
          <LinkIcon className="size-3.5" />
          {t("issue.link")}
        </Button>
      ) : null}
    </div>
  );
}

export function ThreadIssuesPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const { t } = useI18n();
  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <CircleDotIcon className="size-4" />
        {t("issue.linkedIssues")}
      </h2>
      <ThreadIssues threadRef={threadRef} />
    </div>
  );
}
