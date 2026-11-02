import { useNativeWorkspaceColumnsSupported } from "../../native/NativeWorkspaceColumns";
import { useAdaptiveWorkspaceLayout } from "./AdaptiveWorkspaceLayout";
import { withNativeGlassHeaderItem } from "./native-glass-header-items";
import { useI18n } from "../../i18n/useI18n";

export function useWorkspaceSidebarHeaderItem() {
  const { t } = useI18n();
  const usesNativeWorkspaceColumns = useNativeWorkspaceColumnsSupported();
  const { layout, panes, togglePrimarySidebar } = useAdaptiveWorkspaceLayout();
  const label = panes.primarySidebarVisible
    ? layout.primarySidebarOverlaysContent
      ? t("mobile.useWorkspaceSidebarHeaderItem.hideThreadSidebar")
      : t("mobile.useWorkspaceSidebarHeaderItem.maximizeContent")
    : t("mobile.useWorkspaceSidebarHeaderItem.showThreadSidebar");
  return withNativeGlassHeaderItem({
    axisBehavior: usesNativeWorkspaceColumns ? "horizontalOnly" : undefined,
    accessibilityLabel: label,
    icon: {
      name:
        panes.primarySidebarVisible && !layout.primarySidebarOverlaysContent
          ? "arrow.up.left.and.arrow.down.right"
          : "sidebar.left",
      type: "sfSymbol" as const,
    },
    identifier: "thread-left-sidebar",
    label,
    onPress: togglePrimarySidebar,
    type: "button" as const,
  });
}
