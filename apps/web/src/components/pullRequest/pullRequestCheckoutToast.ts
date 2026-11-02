import { i18n } from "@t3tools/shared/i18n";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export function offHeadPullRequestCheckoutToast(terminology: ChangeRequestTerminology) {
  return {
    type: "warning",
    title: i18n.t("pr.checkedOutButNotConfirmedOnThe"),
    description: `This checkout could not be confirmed at the ${terminology.singular}'s latest commit, so its code may differ. Local commits or uncommitted work keep a checkout where it is.`,
  } as const;
}
