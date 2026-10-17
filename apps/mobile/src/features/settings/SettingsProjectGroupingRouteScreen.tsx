import { useI18n } from "../../i18n/useI18n";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { SidebarProjectGroupingMode } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsScreen } from "./components/SettingsScreen";
import {
  mobileProjectGroupingModePatch,
  resolveMobileProjectGroupingSettings,
} from "../../state/project-grouping";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { SettingsChoiceRow } from "./components/SettingsChoiceRow";
import { SettingsSection } from "./components/SettingsSection";

const GROUPING_OPTIONS = (
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{
  readonly mode: SidebarProjectGroupingMode;
  readonly label: string;
  readonly description: string;
}> => [
  {
    mode: "repository",
    label: t("mobile.settingsProjectGroupingRouteScreen.groupByRepository"),
    description: t(
      "mobile.settingsProjectGroupingRouteScreen.matchingRepositoriesAppearAsOneProject",
    ),
  },
  {
    mode: "repository_path",
    label: t("mobile.settingsProjectGroupingRouteScreen.groupByRepositoryPath"),
    description: t("mobile.settingsProjectGroupingRouteScreen.keepMonorepoPathsSeparate"),
  },
  {
    mode: "separate",
    label: t("mobile.settingsProjectGroupingRouteScreen.keepSeparate"),
    description: t("mobile.settingsProjectGroupingRouteScreen.showEveryWorkspaceAsItsOwnProject"),
  },
];

export function SettingsProjectGroupingRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedMode = AsyncResult.isSuccess(preferencesResult)
    ? resolveMobileProjectGroupingSettings(preferencesResult.value).sidebarProjectGroupingMode
    : null;

  return (
    <SettingsScreen title={t("mobile.settingsProjectGroupingRouteScreen.organization")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title={t("mobile.settingsProjectGroupingRouteScreen.projectGrouping")}>
          {GROUPING_OPTIONS(t).map((option, index) => (
            <SettingsChoiceRow
              key={option.mode}
              label={option.label}
              description={option.description}
              selected={selectedMode === option.mode}
              separated={index > 0}
              disabled={!preferencesReady}
              onPress={() => savePreferences(mobileProjectGroupingModePatch(option.mode))}
            />
          ))}
        </SettingsSection>
      </ScrollView>
    </SettingsScreen>
  );
}
