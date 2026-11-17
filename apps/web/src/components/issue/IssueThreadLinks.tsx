import type { EnvironmentId, IssueDetail } from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { issueKey } from "@t3tools/client-runtime/issues";
import { MessageSquareIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useThreadShells } from "~/state/entities";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useI18n } from "~/hooks/useI18n";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "../ui/button";
import { SummarySection } from "../sourceControl/SummarySection";

export function IssueThreadLinks({
  environmentId,
  detail,
}: {
  environmentId: EnvironmentId;
  detail: IssueDetail;
}) {
  const { t } = useI18n();
  const threads = useThreadShells().filter(
    (thread) =>
      thread.environmentId === environmentId &&
      thread.issues?.some((issue) => issueKey(issue) === issueKey(detail)),
  );
  const navigate = useNavigate();
  const newThread = useNewThreadHandler();
  const [pending, setPending] = useState(false);
  return (
    <SummarySection title={t("issue.linkedThreads")}>
      <div className="space-y-2">
        {threads.map((thread) => (
          <button
            type="button"
            key={thread.id}
            className="flex min-w-0 items-center gap-2 text-xs hover:text-primary"
            onClick={() =>
              void navigate({
                to: "/$environmentId/$threadId",
                params: buildThreadRouteParams(scopeThreadRef(environmentId, thread.id)),
              })
            }
          >
            <MessageSquareIcon className="size-3.5 shrink-0" />
            <span className="truncate">{thread.title}</span>
          </button>
        ))}
        {threads.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("issue.noLinkedThreads")}</p>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void newThread(scopeProjectRef(environmentId, detail.projectId), {
              prompt: t("issue.threadPrompt", { url: detail.url }),
              issueUrl: detail.url,
            }).finally(() => setPending(false));
          }}
        >
          <MessageSquareIcon className="size-3.5" />
          {t("issue.startThread")}
        </Button>
      </div>
    </SummarySection>
  );
}
