import { Platform } from "react-native";

import { AndroidHeaderIconButton } from "../../components/ui/AndroidScreenHeader";

import { useAdaptiveWorkspaceLayout } from "./adaptive-workspace-context";
import { useI18n } from "../../i18n/useI18n";

export function AndroidWorkspaceSidebarButton() {
  const { t } = useI18n();
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();
  if (Platform.OS !== "android" || !layout.usesSplitView) return null;

  return (
    <AndroidHeaderIconButton
      accessibilityLabel={
        panes.primarySidebarVisible
          ? t("mobile.useWorkspaceSidebarHeaderItem.maximizeContent")
          : t("mobile.workspaceSidebarToolbar.showSidebar")
      }
      icon={panes.primarySidebarVisible ? "arrow.up.left.and.arrow.down.right" : "sidebar.left"}
      onPress={togglePrimarySidebar}
    />
  );
}
