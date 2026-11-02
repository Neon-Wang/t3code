import { useI18n } from "../../../i18n/useI18n";
import { View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { AppText as Text } from "../../../components/ui/AppText";
import { SettingsSection } from "./SettingsSection";

export function SettingsProjectOverridesSection(props: {
  readonly projectLabel: string;
  readonly hasOverrides: boolean;
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
        {!props.pending && props.hasOverrides ? (
          <Button
            label={t("mobile.settingsProjectOverridesSection.useDefaults")}
            accessibilityHint={t("integration.useEnvironmentDefaults")}
            tone="text"
            disabled={props.disabled}
            onPress={props.onClear}
          />
        ) : null}
      </View>
    </SettingsSection>
  );
}
