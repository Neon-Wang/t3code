import { View } from "react-native";

import { useI18n } from "../../../../i18n/useI18n";
import { ListChoiceRow as SettingsChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { SettingsSection } from "../../components/SettingsSection";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

export function AndroidNavigationAppearanceSection() {
  const { t } = useI18n();
  const { isReady, androidNavigationStyle, setAndroidNavigationStyle } = useAppearancePreferences();
  return (
    <SettingsSection title={t("preview.navigation")}>
      <View accessibilityRole="radiogroup">
        <SettingsChoiceRow
          label={t("mobile.androidNavigationAppearanceSection.oneUi")}
          description={t("mobile.androidNavigationAppearanceSection.oneUiDescription")}
          disabled={!isReady}
          selected={androidNavigationStyle === "one-ui"}
          onPress={() => setAndroidNavigationStyle("one-ui")}
        />
        <SettingsChoiceRow
          label={t("mobile.androidNavigationAppearanceSection.material")}
          description={t("mobile.androidNavigationAppearanceSection.materialDescription")}
          disabled={!isReady}
          selected={androidNavigationStyle === "material"}
          onPress={() => setAndroidNavigationStyle("material")}
          separated
        />
      </View>
    </SettingsSection>
  );
}
