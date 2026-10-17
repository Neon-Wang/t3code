import { useI18n } from "../../../i18n/useI18n";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../../components/AppText";
import { SettingsSection } from "./SettingsSection";

export function SettingsProjectOverridesSection(props: {
  readonly projectLabel: string;
  readonly hasOverrides: boolean;
  readonly supportsOverrides: boolean;
  readonly pending: boolean;
  readonly disabled?: boolean;
  readonly onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <SettingsSection title={t("mobile.settingsProjectOverridesSection.project")}>
      <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
        <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={2}>
          {props.projectLabel}
        </Text>
        {!props.pending && props.supportsOverrides && props.hasOverrides ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("mobile.settingsProjectOverridesSection.useEnvironmentDefaults")}
            disabled={props.disabled}
            onPress={props.onClear}
            className="px-2 py-2 active:opacity-70"
          >
            <Text className="text-sm font-t3-medium text-primary-text">
              {t("mobile.settingsProjectOverridesSection.useDefaults")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {!props.supportsOverrides ? (
        <Text className="px-4 pb-3 text-sm text-foreground-muted">
          {t(
            "mobile.settingsProjectOverridesSection.updateTheSelectedEnvironmentsToEditProjectOverrides",
          )}
        </Text>
      ) : null}
    </SettingsSection>
  );
}
