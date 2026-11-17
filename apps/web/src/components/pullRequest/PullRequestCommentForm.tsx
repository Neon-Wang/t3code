import type { ComponentProps } from "react";
import type { PullRequestDetailView } from "@t3tools/contracts";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { useAtomCommand } from "~/state/use-atom-command";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { CommentForm } from "../sourceControl/CommentForm";
import { pullRequestCompletionScope } from "./PullRequestMarkdownTextarea";

export function PullRequestCommentForm({
  detail,
  ...props
}: Omit<
  ComponentProps<typeof CommentForm>,
  "term" | "completionScope" | "followUpAction" | "onPost"
> & { detail: PullRequestDetailView }) {
  const post = useAtomCommand(pullRequestEnvironment.comment, { reportFailure: false });
  const action = detail.state === "open" ? "close" : detail.state === "closed" ? "reopen" : null;
  const followUpAction =
    action !== null &&
    detail.capabilities.actions.includes(action) &&
    detail.viewerPermissions.actions.includes(action)
      ? action
      : null;
  return (
    <CommentForm
      {...props}
      term={sourceControlClients.get(detail.provider).changeRequest.singular}
      completionScope={pullRequestCompletionScope(detail, props.environmentId, props.reference)}
      followUpAction={followUpAction}
      onPost={async (body) =>
        (await post({ environmentId: props.environmentId, input: { ...props.reference, body } }))
          ._tag === "Success"
      }
    />
  );
}
