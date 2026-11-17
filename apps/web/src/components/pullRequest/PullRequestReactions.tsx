import type { ComponentProps } from "react";
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import { useAtomCommand } from "~/state/use-atom-command";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { ReactionBar } from "../sourceControl/ReactionBar";

export function PullRequestReactionBar({
  environmentId,
  reference,
  subjectId,
  ...props
}: Omit<ComponentProps<typeof ReactionBar>, "onToggle"> & {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  subjectId?: string | undefined;
}) {
  const setReaction = useAtomCommand(pullRequestEnvironment.setReaction, { reportFailure: false });
  return (
    <ReactionBar
      {...props}
      onToggle={async (content, reacted) => {
        const result = await setReaction({
          environmentId,
          input: {
            ...reference,
            ...(subjectId === undefined ? {} : { subjectId }),
            content,
            reacted,
          },
        });
        return result._tag === "Success";
      }}
    />
  );
}
