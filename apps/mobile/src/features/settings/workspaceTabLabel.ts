import { Platform } from "react-native";

import type { useI18n } from "../../i18n/useI18n";
import type { NavigationTab } from "../workspace/navigation-tab-order";

/** Visible tab name; the tab id stays the route and preference identifier. */
export function workspaceTabLabel(t: ReturnType<typeof useI18n>["t"], tab: NavigationTab) {
  const ios = Platform.OS === "ios";
  switch (tab) {
    case "threads":
      return ios ? t("mobile.navigation.chats") : t("mobile.workspaceToolbar.threads");
    case "pullRequests":
      return ios ? t("mobile.workspaceToolbar.prs") : t("mobile.settingsRouteScreen.pulls");
    case "usage":
      return t("mobile.usageRouteScreen.usage");
  }
}
