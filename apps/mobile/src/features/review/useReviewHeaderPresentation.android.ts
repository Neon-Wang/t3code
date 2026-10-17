import { useI18n } from "../../i18n/useI18n";
import type { useReviewHeaderPresentation as useIosReviewHeaderPresentation } from "./useReviewHeaderPresentation";

export function useReviewHeaderPresentation(
  props: Parameters<typeof useIosReviewHeaderPresentation>[0],
): ReturnType<typeof useIosReviewHeaderPresentation> {
  const { t } = useI18n();
  return {
    title: t("mobile.useReviewHeaderPresentation.reviewChanges"),
    subtitle: props.androidSubtitle || "Select a diff",
    gitMenu: null,
    menuIcon: "ellipsis.circle",
    refreshAction: {
      id: "refresh",
      title: t("mobile.useReviewHeaderPresentation.refreshCurrentDiff"),
      disabled: !props.selectedSection || props.selectedSection.isLoading,
      onPress: () => {
        void props.onRefresh();
      },
    },
  };
}
