import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { DEFAULT_FOLLOW_UP_BEHAVIOR, type FollowUpBehavior } from "../../lib/followUpBehavior";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";

const FOLLOW_UP_OPTIONS = (
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{
  readonly behavior: FollowUpBehavior;
  readonly label: string;
  readonly description: string;
}> => [
  {
    behavior: "queue",
    label: t("mobile.settingsFollowUpRouteScreen.queue"),
    description: t(
      "mobile.settingsFollowUpRouteScreen.yourMessageWaitsAndRunsAfterTheCurrentTurnFinishes",
    ),
  },
  {
    behavior: "steer",
    label: t("mobile.settingsFollowUpRouteScreen.steer"),
    description: t(
      "mobile.settingsFollowUpRouteScreen.yourMessageReachesTheAgentRightAwayChangingWhatItIsWorkingOn",
    ),
  },
];

export function SettingsFollowUpRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedBehavior = AsyncResult.isSuccess(preferencesResult)
    ? (preferencesResult.value.followUpBehavior ?? DEFAULT_FOLLOW_UP_BEHAVIOR)
    : null;

  const content = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      className="flex-1"
      contentContainerClassName="gap-3 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      <SettingsSection title={t("mobile.settingsFollowUpRouteScreen.whileTheAgentIsRunning")}>
        {FOLLOW_UP_OPTIONS(t).map((option, index) => (
          <SettingsChoiceRow
            key={option.behavior}
            label={option.label}
            description={option.description}
            selected={selectedBehavior === option.behavior}
            separated={index > 0}
            disabled={!preferencesReady}
            onPress={() => savePreferences({ followUpBehavior: option.behavior })}
          />
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {t("mobile.settingsFollowUpRouteScreen.longPressSend")}
      </Text>
    </ScrollView>
  );

  return Platform.OS === "android" ? (
    <SettingsScreen title={t("chat.ui.chat")}>{content}</SettingsScreen>
  ) : (
    <View collapsable={false} className="flex-1 bg-sheet">
      {content}
    </View>
  );
}
