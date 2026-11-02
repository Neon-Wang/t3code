import { i18n } from "@t3tools/shared/i18n";

/** Diff failures currently include transport wrappers, so recognize the reason inside them. */
export function describePullRequestDiffError(error: string, providerName: string, term: string) {
  if (/\brate limit\b|\brate[-_]limited\b|\btoo many requests\b/i.test(error)) {
    return {
      title: i18n.t("pr.diffRateLimited", { provider: providerName }),
      description: i18n.t("pr.diffRateLimitedDescription", { provider: providerName }),
    };
  }

  return {
    title: i18n.t("pr.couldNotLoadChanges"),
    description: i18n.t("pr.environmentCouldNotLoadDiff", { term, provider: providerName }),
  };
}
