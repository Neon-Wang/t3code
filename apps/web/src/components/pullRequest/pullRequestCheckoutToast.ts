import { i18n } from "@t3tools/shared/i18n";
import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export function offHeadPullRequestCheckoutToast(terminology: ChangeRequestTerminology) {
  return {
    type: "warning",
    title: i18n.t("pr.checkedOutButNotConfirmedOnThe"),
    description: i18n.t("pr.checkoutNotConfirmed", { term: terminology.singular }),
  } as const;
}
