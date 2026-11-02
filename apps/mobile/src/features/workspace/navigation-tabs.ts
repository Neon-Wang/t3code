import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Platform } from "react-native";
import {
  NAVIGATION_TAB_LABELS,
  navigationCustomizationAvailable,
  resolveHiddenNavigationTabs,
  enabledNavigationTabs,
  type NavigationTab,
} from "./navigation-tab-order";
import type { AppSymbolName } from "../../components/ui/AppSymbol";
import { mobilePreferencesAtom } from "../../state/preferences";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";
import { resolveWorkspaceTabOrder } from "./workspace-tabs-state";
import { i18n } from "@t3tools/shared/i18n";

// Getters keep the label resolved at read time so a language switch applies without a reload.
export const WORKSPACE_TAB_LABELS: Readonly<Record<NavigationTab, string>> = {
  get threads() {
    return Platform.OS === "ios"
      ? i18n.t("mobile.navigation.chats")
      : NAVIGATION_TAB_LABELS.threads;
  },
  get pullRequests() {
    return Platform.OS === "ios"
      ? i18n.t("mobile.workspaceToolbar.prs")
      : NAVIGATION_TAB_LABELS.pullRequests;
  },
  get usage() {
    return NAVIGATION_TAB_LABELS.usage;
  },
};

export const NAVIGATION_TAB_ICONS = {
  threads: "text.bubble",
  pullRequests: PullRequestGlyph.pullRequest,
  usage: "chart.bar.xaxis",
} as const satisfies Readonly<Record<NavigationTab, AppSymbolName>>;

export function useNavigationTabOrder() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const saved = AsyncResult.isSuccess(preferences)
    ? preferences.value.navigationTabOrder
    : undefined;
  return resolveWorkspaceTabOrder(saved);
}

export function useHiddenNavigationTabs() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const saved = AsyncResult.isSuccess(preferences)
    ? preferences.value.hiddenNavigationTabs
    : undefined;
  return navigationCustomizationAvailable() ? resolveHiddenNavigationTabs(saved) : [];
}

export function useEnabledNavigationTabs() {
  const order = useNavigationTabOrder();
  const hidden = useHiddenNavigationTabs();
  return enabledNavigationTabs(order, hidden);
}
