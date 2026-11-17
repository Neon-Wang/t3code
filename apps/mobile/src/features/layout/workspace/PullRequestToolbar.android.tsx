import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";
import { BackHandler, Keyboard } from "react-native";
import { AppBar } from "../../../components/ui/AppBar";
import { appBarMenuItemsFromActions } from "../../../components/ui/menuActionItems";
import { useHardwareKeyboardCommand } from "../../keyboard/hardwareKeyboardCommands";
import { WorkspaceBrandTitle } from "./WorkspaceBrandTitle";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { PullRequestFilterMenu } from "../../pull-requests/PullRequestListFilters";
import { openSettings } from "../../settings/settings-navigation";
import { useI18n } from "../../../i18n/useI18n";

/** PR search shares the thread list's Android header. */
export function PullRequestToolbar(props: {
  readonly tab?: "pullRequests" | "issues";
  readonly filters: PullRequestFilterMenu | null;
  readonly onRequestVisibility?: () => void;
}) {
  const { t } = useI18n();
  const tabName = props.tab ?? "pullRequests";
  const navigation = useNavigation();
  const { filters } = props;
  const workspace = useWorkspaceTabs()!;
  const { dispatch, getScrollOffset, recordScrollOffset, isTabActive } = workspace;
  const { onRequestVisibility } = props;
  const tab = workspace.state.tabs[tabName];
  const searching = tab.searchMode !== "resting";
  const openSearch = () => {
    onRequestVisibility?.();
    dispatch({
      type: "scroll",
      tab: tabName,
      offset: getScrollOffset(tabName),
    });
    dispatch({ type: "search", tab: tabName });
    return true;
  };
  useHardwareKeyboardCommand("focusSearch", openSearch);
  const closeSearch = () => {
    Keyboard.dismiss();
    recordScrollOffset(tabName, tab.searchEntryOffset);
    dispatch({ type: "cancel", tab: tabName });
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to BackHandler while searching to close the PR search on Android back
  useEffect(() => {
    if (!searching) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Frozen Home screens stay mounted under a detail route or another tab,
      // so back only applies while the PR list is in front.
      const state = navigation.getState();
      if (!state || state.routes[state.index]?.name !== "Home" || !isTabActive(tabName))
        return false;
      if (Keyboard.isVisible()) Keyboard.dismiss();
      else closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [searching, closeSearch, navigation, isTabActive, tabName]);
  return (
    <AppBar
      title="T3 Code"
      titleContent={
        <WorkspaceBrandTitle
          accessibilityLabel={
            tabName === "issues"
              ? t("issue.title")
              : t("mobile.materialPullRequestToolbar.t3CodePullRequests")
          }
          onOpenEnvironments={() => openSettings(navigation, "SettingsEnvironments")}
        />
      }
      search={{
        value: tab.query,
        onChangeText: (query) => dispatch({ type: "query", tab: tabName, query }),
        placeholder:
          tabName === "issues"
            ? t("issue.search")
            : t("mobile.materialPullRequestToolbar.searchPullRequests"),
        active: searching,
        onOpen: openSearch,
        onClose: closeSearch,
      }}
      menus={
        filters
          ? [
              {
                title:
                  tabName === "issues" ? t("issue.title") : t("integration.filterPullRequests"),
                icon: filters.customized
                  ? "line.3.horizontal.decrease.circle.fill"
                  : "line.3.horizontal.decrease.circle",
                items: appBarMenuItemsFromActions(filters.actions, filters.onSelect),
              },
            ]
          : undefined
      }
    />
  );
}
