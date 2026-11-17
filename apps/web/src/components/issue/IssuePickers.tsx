import type { EnvironmentId, IssueRef } from "@t3tools/contracts";
import { CheckIcon, UserRoundPlusIcon } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { issueEnvironment } from "~/state/issues";
import { useEnvironmentQuery } from "~/state/query";
import { useDebouncedValue } from "~/state/queries";
import { useAtomCommand } from "~/state/use-atom-command";
import { LabelPicker } from "../sourceControl/LabelPicker";
import { CandidatePicker } from "../sourceControl/CandidatePicker";
import { PullRequestActorAvatar } from "../pullRequest/pullRequestPresentation";

interface Props {
  environmentId: EnvironmentId;
  reference: IssueRef;
  allowed: boolean;
}

export function IssueLabelPicker({ environmentId, reference, allowed }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const search = useDebouncedValue(query.trim(), 250);
  const result = useEnvironmentQuery(
    open
      ? issueEnvironment.labelCandidates({
          environmentId,
          input: { ...reference, ...(search ? { query: search } : {}) },
        })
      : null,
  );
  const change = useAtomCommand(issueEnvironment.setLabels);
  return (
    <LabelPicker
      allowed={allowed}
      open={open}
      setOpen={setOpen}
      query={query}
      setQuery={setQuery}
      loading={result.isPending && result.data === null}
      error={result.error}
      candidates={result.data?.candidates ?? []}
      truncated={result.data?.truncated === true}
      pending={pending}
      onToggle={(candidate) => {
        if (pending) return;
        setPending(true);
        void change({
          environmentId,
          input: { ...reference, labels: [candidate.name], applied: !candidate.isApplied },
        }).then(() => setPending(false));
      }}
    />
  );
}

export function IssueAssigneePicker({ environmentId, reference, allowed }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const search = useDebouncedValue(query.trim(), 250);
  const result = useEnvironmentQuery(
    open
      ? issueEnvironment.assigneeCandidates({
          environmentId,
          input: { ...reference, ...(search ? { query: search } : {}) },
        })
      : null,
  );
  const change = useAtomCommand(issueEnvironment.setAssignees);
  return (
    <CandidatePicker
      icon={<UserRoundPlusIcon className="size-3.5" />}
      label={t("issue.changeAssignees")}
      allowed={allowed}
      disabledReason={t("pr.labelsRequireTriageAccess")}
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={setQuery}
      searchLabel={t("issue.searchAssignees")}
      isPending={result.isPending && result.data === null}
      error={result.error}
      candidates={result.data?.candidates ?? []}
      emptyLabel={t("issue.noAssignees")}
      noMatchLabel={t("issue.noAssignees")}
      errorLabel={t("issue.assigneesFailed")}
      truncated={result.data?.truncated === true}
      truncatedLabel={t("issue.assigneesTruncated")}
      candidateKey={(candidate) => candidate.id}
      disabled={pending}
      onSelect={(candidate) => {
        if (pending) return;
        setPending(true);
        void change({
          environmentId,
          input: { ...reference, assigneeIds: [candidate.id], assigned: !candidate.isAssigned },
        }).then(() => setPending(false));
      }}
    >
      {(candidate) => (
        <>
          <PullRequestActorAvatar actor={candidate} className="size-5" />
          <span className="min-w-0 flex-1 truncate">{candidate.login}</span>
          {candidate.isAssigned ? <CheckIcon className="size-3.5" /> : null}
        </>
      )}
    </CandidatePicker>
  );
}
