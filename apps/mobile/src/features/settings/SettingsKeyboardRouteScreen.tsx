import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import {
  DEFAULT_COMPOSER_ENTER_BEHAVIOR,
  type ComposerEnterBehavior,
} from "../../lib/composerEnterBehavior";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";

const SEND_MODIFIER = Platform.OS === "android" ? "Ctrl" : "Command";

const ENTER_BEHAVIOR_OPTIONS = (
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{
  readonly behavior: ComposerEnterBehavior;
  readonly label: string;
  readonly description: string;
}> => [
  {
    behavior: "send",
    label: t("mobile.settingsKeyboardRouteScreen.sendMessage"),
    description: t(
      "mobile.settingsKeyboardRouteScreen.returnSendsTheMessageShiftReturnInsertsANewLine",
    ),
  },
  {
    behavior: "newline",
    label: t("mobile.settingsKeyboardRouteScreen.insertNewLine"),
    description: t("mobile.settingsKeyboardRouteScreen.returnInsertsNewLine", {
      modifier: SEND_MODIFIER,
    }),
  },
];

export function SettingsKeyboardRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedBehavior = AsyncResult.isSuccess(preferencesResult)
    ? (preferencesResult.value.composerEnterBehavior ?? DEFAULT_COMPOSER_ENTER_BEHAVIOR)
    : null;

  return (
    <SettingsScreen title={t("mobile.navigation.keyboard")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title={t("mobile.settingsKeyboardRouteScreen.returnKey")}>
          {ENTER_BEHAVIOR_OPTIONS(t).map((option, index) => (
            <SettingsChoiceRow
              key={option.behavior}
              label={option.label}
              description={option.description}
              selected={selectedBehavior === option.behavior}
              separated={index > 0}
              disabled={!preferencesReady}
              onPress={() => savePreferences({ composerEnterBehavior: option.behavior })}
            />
          ))}
        </SettingsSection>
        <Text className="px-2 text-sm text-foreground-muted">
          {t(
            "mobile.settingsKeyboardRouteScreen.appliesToTheComposerWhenAHardwareKeyboardIsConnected",
          )}
        </Text>
      </ScrollView>
    </SettingsScreen>
  );
}
