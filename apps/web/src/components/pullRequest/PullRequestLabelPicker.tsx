import { useI18n } from "../../hooks/useI18n";
import { useAtomCommand } from "~/state/use-atom-command";
import type { EnvironmentId, PullRequestLabelCandidate, PullRequestRef } from "@t3tools/contracts";
import { useState } from "react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { toastManager } from "../ui/toast";
import { LabelPicker } from "../sourceControl/LabelPicker";
import { readableFailure } from "./pullRequestDetail.logic";

function matches(candidate: PullRequestLabelCandidate, query: string): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return (
    candidate.name.toLowerCase().includes(needle) ||
    (candidate.description ?? "").toLowerCase().includes(needle)
  );
}

export function PullRequestLabelPicker({
  environmentId,
  reference,
  allowed,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  allowed: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const candidatesQuery = useEnvironmentQuery(
    open ? pullRequestEnvironment.labelCandidates({ environmentId, input: reference }) : null,
  );
  const setLabels = useAtomCommand(pullRequestEnvironment.setLabels, {
    reportFailure: false,
  });

  const candidates = (candidatesQuery.data?.candidates ?? []).filter((entry) =>
    matches(entry, query),
  );

  const toggle = async (candidate: PullRequestLabelCandidate) => {
    if (pending !== null) return;
    setPending(candidate.name);
    const result = await setLabels({
      environmentId,
      input: { ...reference, labels: [candidate.name], applied: !candidate.isApplied },
    });
    setPending(null);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: candidate.isApplied
          ? t("pr.couldNotTakeValueOff", { arg0: candidate.name })
          : t("pr.couldNotPutValueOn", { arg0: candidate.name }),
        description: readableFailure(
          squashAtomCommandFailure(result),
          t("pr.theHostRefusedItCheckThatYouHaveTriageAccessOnThisRepository"),
        ),
      });
      return;
    }
  };

  return (
    <LabelPicker
      allowed={allowed}
      open={open}
      setOpen={setOpen}
      query={query}
      setQuery={setQuery}
      loading={candidatesQuery.isPending && candidatesQuery.data === null}
      error={candidatesQuery.data === null ? candidatesQuery.error : null}
      candidates={candidates}
      truncated={candidatesQuery.data?.truncated === true}
      pending={pending !== null}
      onToggle={(candidate) => void toggle(candidate)}
    />
  );
}
