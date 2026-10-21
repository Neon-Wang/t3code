import { i18n } from "@t3tools/shared/i18n";
import { Toolbar } from "../../components/ui/Toolbar";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useI18n } from "../../i18n/useI18n";
import { use, useCallback, useEffect, useRef } from "react";
import { useNavigation, type ParamListBase } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Platform } from "react-native";
import type { SearchBarCommands } from "react-native-screens";
import { NativePrimaryColumnContext } from "../../native/v5-workspace-context";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { useHardwareKeyboardCommand } from "../keyboard/hardwareKeyboardCommands";
import { withNativeGlassHeaderItem } from "../layout/native-glass-header-items";
import { createNativeMailSearchToolbarItem } from "../layout/native-mail-search-toolbar";
import { useNativeMailSearchToolbar } from "../../native/use-native-mail-search-toolbar";
import { useDeviceType } from "../../native/native-layout-metrics";
import { buildHomeListFilterMenu } from "./home-list-filter-menu";
import {
  createSidebarFilterHeaderItem,
  createSidebarHeaderItems,
} from "../threads/sidebar-native-header-items";
import type { HomeHeaderProps } from "./HomeHeader.types";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";

export type { HomeHeaderEnvironment } from "./HomeHeader.types";

export function HomeHeader(props: HomeHeaderProps) {
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();
  const usesNativeMailSearchToolbar = useNativeMailSearchToolbar();
  const deviceType = useDeviceType();
  const primaryColumn = use(NativePrimaryColumnContext);
  const sidebarHeader =
    Platform.OS === "ios" &&
    primaryColumn !== null &&
    (deviceType === "pad" || !usesNativeMailSearchToolbar);
  const showsCompactCompose = deviceType === "pad" && !layout.usesSplitView;
  const searchBarRef = useRef<SearchBarCommands>(null);
  const focusAfterReveal = useRef(false);
  useEffect(
    () =>
      navigation.addListener("transitionEnd", (event) => {
        if (focusAfterReveal.current && !event.data.closing) {
          focusAfterReveal.current = false;
          searchBarRef.current?.focus();
        }
      }),
    [navigation],
  );
  const iconColor = useUniwindTheme()["--color-icon"];
  const hasCustomListOptions =
    props.selectedEnvironmentId !== null || props.selectedProjectKey !== null;
  const focusSearch = useCallback(() => {
    if (primaryColumn && !panes.primarySidebarVisible) {
      focusAfterReveal.current = true;
      togglePrimarySidebar();
      return true;
    }
    searchBarRef.current?.focus();
    return searchBarRef.current !== null;
  }, [primaryColumn, panes.primarySidebarVisible, togglePrimarySidebar]);
  useHardwareKeyboardCommand("focusSearch", focusSearch);
  const filterMenu = buildHomeListFilterMenu(props);

  if (props.usesWorkspaceToolbar) {
    return deviceType === "duo-unfolded" ? (
      <NativeStackScreenOptions
        optionsVersion={filterMenu.items}
        options={{
          nativeSidebarFilter: createSidebarFilterHeaderItem({
            filterIcon: hasCustomListOptions
              ? "line.3.horizontal.decrease.circle.fill"
              : "line.3.horizontal.decrease.circle",
            filterMenu,
          }),
        }}
      />
    ) : null;
  }

  return (
    <>
      <NativeStackScreenOptions
        optionsVersion={[filterMenu.items, showsCompactCompose]}
        options={{
          headerTintColor: iconColor,
          unstable_headerRightItems: () =>
            sidebarHeader
              ? [
                  ...createSidebarHeaderItems({
                    filterIcon: hasCustomListOptions
                      ? "line.3.horizontal.decrease.circle.fill"
                      : "line.3.horizontal.decrease.circle",
                    filterMenu,
                    onOpenSettings: props.onOpenSettings,
                  }),
                  ...(showsCompactCompose
                    ? [
                        withNativeGlassHeaderItem({
                          accessibilityLabel: t("mobile.home.newTask"),
                          axisBehavior: "horizontalOnly",
                          icon: { name: "square.and.pencil", type: "sfSymbol" } as const,
                          identifier: "home-new-task",
                          label: "",
                          onPress: props.onStartNewTask,
                          type: "button",
                        }),
                      ]
                    : []),
                ]
              : [
                  withNativeGlassHeaderItem({
                    accessibilityLabel: t("mobile.home.openSettings"),
                    icon: { name: "ellipsis", type: "sfSymbol" } as const,
                    identifier: "home-settings",
                    label: "",
                    onPress: props.onOpenSettings,
                    type: "button",
                  }),
                ],
          // The keys below are set per-branch (not `undefined`) so a later
          // reapply cannot clobber options owned by Toolbar.
          ...(sidebarHeader
            ? {
                headerSearchBarOptions: {
                  ref: searchBarRef,
                  autoCapitalize: "none" as const,
                  hideNavigationBar: false,
                  hideWhenScrolling: false,
                  obscureBackground: false,
                  placement: "stacked" as const,
                  allowToolbarIntegration: false,
                  placeholder: t("mobile.home.search"),
                  onCancelButtonPress: () => props.onSearchQueryChange(""),
                  onChangeText: (event) => props.onSearchQueryChange(event.nativeEvent.text),
                },
                unstable_headerToolbarItems: () => [],
              }
            : usesNativeMailSearchToolbar
              ? {
                  headerSearchBarOptions: {
                    ref: searchBarRef,
                    autoCapitalize: "none" as const,
                    onCancelButtonPress: () => props.onSearchQueryChange(""),
                  },
                  unstable_headerToolbarItems: () => [
                    createNativeMailSearchToolbarItem({
                      composeButtonId: "home-new-task",
                      composeSystemImageName: "square.and.pencil",
                      filterMenu,
                      filterButtonId: "home-filter",
                      filterSystemImageName: hasCustomListOptions
                        ? "line.3.horizontal.decrease.circle.fill"
                        : "line.3.horizontal.decrease",
                      onComposePress: props.onStartNewTask,
                      onSearchTextChange: props.onSearchQueryChange,
                      placeholder: t("mobile.home.search"),
                      searchTextChangeId: "home-search-text",
                      showsSearchDismissButton: true,
                    }),
                  ],
                }
              : {
                  headerSearchBarOptions: {
                    ref: searchBarRef,
                    autoCapitalize: "none" as const,
                    hideNavigationBar: false,
                    placeholder: t("mobile.home.search"),
                    onCancelButtonPress: () => {
                      props.onSearchQueryChange("");
                    },
                    onChangeText: (event) => {
                      props.onSearchQueryChange(event.nativeEvent.text);
                    },
                  },
                }),
        }}
      />

      {sidebarHeader || usesNativeMailSearchToolbar ? null : (
        <Toolbar placement="bottom">
          <Toolbar.Menu
            accessibilityLabel={t("mobile.home.filterThreads")}
            icon={
              hasCustomListOptions
                ? "line.3.horizontal.decrease.circle.fill"
                : "line.3.horizontal.decrease.circle"
            }
            title={t("mobile.home.threadListOptions")}
            separateBackground
          >
            <Toolbar.Menu title={t("mobile.home.environment")}>
              <Toolbar.Label>{i18n.t("mobile.home.environment")}</Toolbar.Label>
              <Toolbar.MenuAction
                isOn={props.selectedEnvironmentId === null}
                onPress={() => props.onEnvironmentChange(null)}
                subtitle={t("mobile.home.showThreadsFromEveryEnvironment")}
              >
                <Toolbar.Label>{i18n.t("mobile.home.allEnvironments")}</Toolbar.Label>
              </Toolbar.MenuAction>
              {props.environments.map((environment) => (
                <Toolbar.MenuAction
                  key={environment.environmentId}
                  isOn={props.selectedEnvironmentId === environment.environmentId}
                  onPress={() => props.onEnvironmentChange(environment.environmentId)}
                >
                  <Toolbar.Label>{environment.label}</Toolbar.Label>
                </Toolbar.MenuAction>
              ))}
            </Toolbar.Menu>

            {props.projects.length > 0 ? (
              <Toolbar.Menu title={t("mobile.home.project")}>
                <Toolbar.Label>{i18n.t("mobile.home.project")}</Toolbar.Label>
                <Toolbar.MenuAction
                  isOn={props.selectedProjectKey === null}
                  onPress={() => props.onProjectChange(null)}
                  subtitle={t("mobile.home.showThreadsFromEveryProject")}
                >
                  <Toolbar.Label>{i18n.t("mobile.home.allProjects")}</Toolbar.Label>
                </Toolbar.MenuAction>
                {props.projects.map((project) => (
                  <Toolbar.MenuAction
                    key={project.key}
                    isOn={props.selectedProjectKey === project.key}
                    onPress={() => props.onProjectChange(project.key)}
                  >
                    <Toolbar.Label>{project.label}</Toolbar.Label>
                  </Toolbar.MenuAction>
                ))}
              </Toolbar.Menu>
            ) : null}
          </Toolbar.Menu>
          <Toolbar.Spacer flexible />
          <Toolbar.Button
            accessibilityLabel={t("mobile.home.newTask")}
            icon="square.and.pencil"
            onPress={props.onStartNewTask}
            separateBackground
          />
        </Toolbar>
      )}
    </>
  );
}
