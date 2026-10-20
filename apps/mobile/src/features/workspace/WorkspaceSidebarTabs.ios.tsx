import { View } from "react-native";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useI18n } from "../../i18n/useI18n";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";
import { useSelectWorkspaceTab } from "./useSelectWorkspaceTab";

export function WorkspaceSidebarTabs() {
  const { t } = useI18n();
  const workspace = useWorkspaceTabs()!;
  const selectTab = useSelectWorkspaceTab();
  return (
    <View className="px-4 pb-3 pt-2">
      <SegmentedControl
        role="tab"
        options={[
          { value: "threads", label: t("mobile.workspaceSidebarTabs.threads") },
          { value: "pullRequests", label: t("mobile.workspaceSidebarTabs.pullRequests") },
        ]}
        selected={workspace.state.selectedTab}
        onSelect={(tab: WorkspaceTab) => selectTab(tab)}
      />
    </View>
  );
}
