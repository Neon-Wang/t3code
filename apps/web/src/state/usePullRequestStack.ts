import { useI18n } from "../hooks/useI18n";
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import { useMemo } from "react";
import {
  savedPullRequestStack,
  pullRequestStackView,
} from "../components/pullRequest/pullRequestStackSnapshot";
import { useThreadShells } from "./entities";
import { pullRequestStackAtom } from "./pullRequests";
import { useEnvironmentQuery } from "./query";

/** Detail headers and list popovers keep saved navigation during an unavailable refresh. */
export function usePullRequestStack(
  environmentId: EnvironmentId,
  reference: PullRequestRef | null,
) {
  const { t } = useI18n();
  const threads = useThreadShells();
  const saved = useMemo(
    () =>
      reference === null
        ? null
        : savedPullRequestStack(
            threads
              .filter((thread) => thread.environmentId === environmentId)
              .flatMap((thread) => thread.pullRequests ?? []),
            reference,
          ),
    [environmentId, reference, threads],
  );
  const query = useEnvironmentQuery(
    reference === null ? null : pullRequestStackAtom({ environmentId, input: reference }),
  );
  return { ...query, ...pullRequestStackView(query, saved, t) };
}
