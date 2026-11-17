import type { PullRequestLabelCandidate } from "@t3tools/contracts";
import { CheckIcon, TagIcon } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { CandidatePicker } from "./CandidatePicker";
import { pullRequestLabelColor } from "../pullRequest/pullRequestList.logic";

export function LabelPicker({
  allowed,
  open,
  setOpen,
  query,
  setQuery,
  loading,
  error,
  candidates,
  truncated,
  pending,
  onToggle,
}: {
  allowed: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  loading: boolean;
  error: string | null;
  candidates: readonly PullRequestLabelCandidate[];
  truncated: boolean;
  pending: boolean;
  onToggle: (candidate: PullRequestLabelCandidate) => void;
}) {
  const { t } = useI18n();
  return (
    <CandidatePicker
      icon={<TagIcon className="size-3.5" />}
      label={t("pr.changeLabels")}
      allowed={allowed}
      disabledReason={t("pr.labelsRequireTriageAccess")}
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQueryChange={setQuery}
      searchLabel={t("pr.searchLabels")}
      isPending={loading}
      error={error}
      candidates={candidates}
      emptyLabel={t("pr.thisRepositoryHasNoLabels")}
      noMatchLabel={t("pr.noMatchingLabel")}
      errorLabel={t("pr.labelsCouldNotBeRead")}
      truncated={truncated}
      truncatedLabel={t("pr.labelsTruncated")}
      candidateKey={(candidate) => candidate.name}
      disabled={pending}
      onSelect={onToggle}
    >
      {(candidate) => {
        const dot = pullRequestLabelColor(candidate.color);
        return (
          <>
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-muted-foreground"
              {...(dot ? { style: { backgroundColor: dot } } : {})}
            />
            <span className="min-w-0 flex-1 truncate">
              {candidate.name}
              {candidate.description ? (
                <span className="text-muted-foreground"> · {candidate.description}</span>
              ) : null}
            </span>
            {candidate.isApplied ? (
              <CheckIcon aria-label={t("pr.applied")} className="size-3.5 shrink-0" />
            ) : null}
          </>
        );
      }}
    </CandidatePicker>
  );
}
