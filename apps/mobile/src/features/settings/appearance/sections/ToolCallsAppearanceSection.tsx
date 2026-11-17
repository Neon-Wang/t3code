import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { ToolCallVisibility } from "@t3tools/contracts/settings";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";

import { AppText as Text } from "../../../../components/ui/AppText";
import { ListChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../../state/preferences";
import { SettingsSection } from "../../components/SettingsSection";

import { useI18n } from "../../../../i18n/useI18n";
import type { MessageKey } from "@t3tools/shared/i18n";
const TOOL_CALL_VISIBILITY_OPTIONS: ReadonlyArray<{
  readonly value: ToolCallVisibility;
  readonly label: MessageKey;
}> = [
  { value: "showAll", label: "settings.toolCalls.showAll" },
  { value: "hideSuccessful", label: "settings.toolCalls.hideSuccessful" },
  { value: "hideAll", label: "settings.toolCalls.hideAll" },
  { value: "zen", label: "settings.toolCalls.zen" },
];

export function ToolCallsAppearanceSection() {
  const { t } = useI18n();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const selected = AsyncResult.isSuccess(preferences)
    ? (preferences.value.toolCallVisibility ?? "showAll")
    : null;

  return (
    <View className="gap-3">
      <SettingsSection title={t("settings.toolCalls.title")}>
        {TOOL_CALL_VISIBILITY_OPTIONS.map((option, index) => (
          <ListChoiceRow
            key={option.value}
            label={t(option.label)}
            selected={selected === option.value}
            separated={index > 0}
            disabled={selected === null}
            onPress={() => savePreferences({ toolCallVisibility: option.value })}
          />
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {t("settings.toolCalls.description")}
      </Text>
    </View>
  );
}
