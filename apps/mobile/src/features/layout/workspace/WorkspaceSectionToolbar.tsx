import { Pressable, View } from "react-native";
import { SymbolView } from "../../../components/ui/AppSymbol";
import { AppText } from "../../../components/ui/AppText";
import { useInboxCount } from "../../../state/inbox";
import { selectedNavigationTab, visibleNavigationTabs } from "./navigation-tab-order";
import { Toolbar } from "../../../components/ui/Toolbar";
import { useControlTheme } from "../../../components/ui/useControlTheme";
import { useDeviceType } from "../../../native/native-layout-metrics";
import {
  NAVIGATION_TAB_ICONS,
  WORKSPACE_TAB_LABELS,
  useNavigationTabOrder,
  useHiddenNavigationTabs,
} from "./navigation-tabs";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import { useSelectWorkspaceTab } from "./useSelectWorkspaceTab";
import { useCompactWorkspaceTabs, useSidebarWorkspaceTabs } from "./useSystemWorkspaceTabBar";
import { useI18n } from "../../../i18n/useI18n";

const PULL_REQUEST_ICON = require("../../../../assets/icons/pull-request.png");

export function WorkspaceTabToolbarButtons() {
  const { t } = useI18n();
  const inboxCount = useInboxCount();
  const order = useNavigationTabOrder();
  const hidden = useHiddenNavigationTabs();
  const workspace = useWorkspaceTabs()!;
  const selectTab = useSelectWorkspaceTab();
  const selected = selectedNavigationTab(
    order,
    workspace.state.selectedTab,
    workspace.settingsOpen,
    hidden,
  );
  const selectedTint = useControlTheme().colors["--color-primary"];
  return (
    <>
      {visibleNavigationTabs(order, hidden).map((tab) =>
        tab === "inbox" ? (
          <Toolbar.Custom key="inbox">
            <Pressable
              testID="workspace-tab-inbox"
              accessibilityRole="tab"
              accessibilityState={{ selected: selected === "inbox" }}
              accessibilityLabel={t("inbox.countLabel", { count: inboxCount })}
              onPress={() => selectTab("inbox")}
              className="relative min-h-11 min-w-11 items-center justify-center"
            >
              <SymbolView
                name="archivebox"
                size={22}
                tintColorClassName={selected === "inbox" ? "accent-primary" : "accent-foreground"}
              />
              {inboxCount > 0 ? (
                <View className="absolute right-0 top-0 min-w-4 items-center rounded-full bg-danger px-1">
                  <AppText className="text-xs text-danger-foreground">{inboxCount}</AppText>
                </View>
              ) : null}
            </Pressable>
          </Toolbar.Custom>
        ) : (
          <Toolbar.Button
            key={tab}
            identifier={`workspace-tab-${tab}`}
            accessibilityLabel={WORKSPACE_TAB_LABELS[tab]}
            icon={
              tab === "pullRequests"
                ? { type: "image", source: PULL_REQUEST_ICON, tinted: true }
                : NAVIGATION_TAB_ICONS[tab]
            }
            tintColor={selected === tab ? selectedTint : undefined}
            onPress={() => selectTab(tab)}
          />
        ),
      )}
      <Toolbar.Button
        identifier="workspace-tab-settings"
        accessibilityLabel={t("mobile.workspaceRootScreen.settings")}
        icon="gearshape"
        tintColor={selected === "settings" ? selectedTint : undefined}
        onPress={() => selectTab("settings")}
      />
    </>
  );
}

export function WorkspaceSectionToolbar({
  onNewTask,
  showCompose = true,
}: {
  readonly onNewTask: () => void;
  readonly showCompose?: boolean;
}) {
  const { t } = useI18n();
  const sidebarTabs = useSidebarWorkspaceTabs();
  const compactTabs = useCompactWorkspaceTabs();
  const deviceType = useDeviceType();
  return (
    <>
      {showCompose && sidebarTabs !== "picker" && deviceType !== "duo-unfolded" && !compactTabs ? (
        <Toolbar placement="right">
          <Toolbar.Button
            accessibilityLabel={t("mobile.workspaceDock.newChat")}
            icon="square.and.pencil"
            onPress={onNewTask}
          />
        </Toolbar>
      ) : null}
      {sidebarTabs === "toolbar" ? (
        <Toolbar placement="bottom">
          <WorkspaceTabToolbarButtons />
        </Toolbar>
      ) : null}
    </>
  );
}
