import type {
  ChangeRequestIssueLink,
  EnvironmentId,
  ProjectId,
  RemoteIssueRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { useOpenLink } from "~/browser/useOpenLink";
import { readProject } from "~/state/entities";
import { useRightPanelStore } from "~/rightPanelStore";
import { useI18n } from "~/hooks/useI18n";
import { SummarySection } from "./SummarySection";
import { IssueIcon } from "../issue/IssueIcon";
import { PullRequestStateGlyph } from "../pullRequest/pullRequestPresentation";

export function useOpenLinkedReference(
  environmentId: EnvironmentId,
  projectId: ProjectId,
  threadRef: ScopedThreadRef | null,
) {
  const navigate = useNavigate();
  const openLink = useOpenLink(threadRef);
  return (
    event: MouseEvent<HTMLElement>,
    target: RemoteIssueRef & { url: string },
    kind: "issue" | "pull-request",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const identity = readProject({ environmentId, projectId })?.repositoryIdentity;
    const sameProject =
      identity &&
      sourceControlClients.repositorySelector(identity)?.toLowerCase() ===
        target.repository.toLowerCase() &&
      sourceControlClients.changeRequestHost(identity, identity.provider)?.toLowerCase() ===
        target.host.toLowerCase();
    if (
      !sameProject ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button === 1
    ) {
      void openLink(target.url, { event });
      return;
    }
    if (threadRef && kind === "pull-request") {
      useRightPanelStore
        .getState()
        .openPullRequest(threadRef, { ...target, environmentId, projectId });
      return;
    }
    const selection = {
      projectId,
      environmentId,
      state: "all" as const,
      involvement: "all" as const,
      repository: target.repository,
      number: target.number,
      selectedProjectId: projectId,
      selectedEnvironmentId: environmentId,
      selectedHost: target.host,
    };
    if (kind === "issue") void navigate({ to: "/issues", search: selection });
    else void navigate({ to: "/pull-requests", search: selection });
  };
}

export function LinkedReferences({
  links,
  side,
  environmentId,
  projectId,
  threadRef,
}: {
  links: readonly ChangeRequestIssueLink[];
  side: "issue" | "pull-request";
  environmentId: EnvironmentId;
  projectId: ProjectId;
  threadRef: ScopedThreadRef | null;
}) {
  const { t } = useI18n();
  const open = useOpenLinkedReference(environmentId, projectId, threadRef);
  if (links.length === 0) return null;
  return (
    <SummarySection title={t(side === "issue" ? "issue.linkedIssues" : "issue.linkedPRs")}>
      <div className="space-y-2">
        {links.map((link) => {
          const target = side === "issue" ? link.issue : link.changeRequest;
          return (
            <a
              key={`${target.host}/${target.repository}/${target.number}:${link.kind}`}
              href={target.url}
              onClick={(event) => open(event, target, side)}
              className="flex min-w-0 items-center gap-2 text-xs hover:text-primary"
            >
              {side === "issue" ? (
                <IssueIcon state={link.issue.state} closeReason={null} />
              ) : (
                <PullRequestStateGlyph state={link.changeRequest.state} isDraft={false} />
              )}
              <span className="shrink-0 text-muted-foreground">
                {t(link.kind === "closes" ? "issue.closes" : "issue.mentions")}
              </span>
              <span className="shrink-0 font-mono">#{target.number}</span>
              <span className="truncate">{target.title || target.repository}</span>
            </a>
          );
        })}
      </div>
    </SummarySection>
  );
}
