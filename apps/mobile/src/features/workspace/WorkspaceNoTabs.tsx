import { useNavigation } from "@react-navigation/native";
import { View } from "react-native";
import { EmptyState } from "../../components/ui/EmptyState";
import { openSettings } from "../settings/settings-navigation";
import { useI18n } from "../../i18n/useI18n";

export function WorkspaceNoTabs() {
  const { t } = useI18n();
  const navigation = useNavigation();
  return (
    <View className="flex-1 items-center justify-center bg-screen">
      <EmptyState
        title={t("mobile.workspaceNoTabs.allSectionsHidden")}
        detail={t("mobile.workspaceNoTabs.showASection")}
        actionLabel={t("mobile.workspaceNoTabs.editNavigationTabs")}
        variant="plain"
        onAction={() => openSettings(navigation, "SettingsNavigation")}
      />
    </View>
  );
}
