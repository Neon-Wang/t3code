import { i18n } from "@t3tools/shared/i18n";
export const OFF_HEAD_PULL_REQUEST_CHECKOUT_TOAST = {
  type: "warning",
  get title() {
    return i18n.t("pr.checkedOutButNotConfirmedOnThe");
  },
  get description() {
    return i18n.t("pr.thisCheckoutCouldNotBeConfirmed");
  },
} as const;
