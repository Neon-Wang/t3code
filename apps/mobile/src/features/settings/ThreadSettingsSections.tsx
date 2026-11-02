import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/useI18n";
import { AuthSettingsWriteScope, type ServerSettingsPatch } from "@t3tools/contracts";
import { useEnvironmentsWithScope } from "../../state/session";
import { AutoSettleDaysField } from "./components/AutoSettleDaysField";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { supportsSharedSettingsSync } from "@t3tools/client-runtime/state/shared-settings";
import { AppText as Text } from "../../components/ui/AppText";
import { useEnvironments } from "../../state/environments";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { planAutoSettleSettingsSync, type AutoSettleSettings } from "./autoSettleSettingsSync";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import { resolveMobileSettingsTargets, uniformMobileSetting } from "./settings-scoped-server";

export function SettingsLabsRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <SettingsScreen title={t("mobile.settingsRouteScreen.labs")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <BetaSettingsSection />
        <LegacySettingsSection />
      </ScrollView>
    </SettingsScreen>
  );
}

const AUTO_SETTLE_DEFAULT_DAYS = DEFAULT_SERVER_SETTINGS.sidebarAutoSettleAfterDays ?? 3;

/**
 * Usage-limit and auto-settle rows. The Threads page owns their writes, so they share its queue
 * with the page's other project overrides, and their project override reset.
 */
export function AutoSettleSettingsRows(props: {
  readonly write: (patch: ServerSettingsPatch) => void;
  readonly pending: boolean;
}) {
  const { t } = useI18n();
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const writableEnvironments = useEnvironmentsWithScope(selectedTargets, AuthSettingsWriteScope);
  const projectSelected = selectedProjectKey !== null;

  const projectMembers = projectSelected
    ? (selectedProject?.members.map((member) => member.project) ?? [])
    : null;
  const displayTargets = resolveMobileSettingsTargets(
    selectedTargets.filter(supportsSharedSettingsSync),
    projectMembers,
  );
  // The page saves to all its targets, so any read-only one blocks the save.
  const canWriteSettings =
    displayTargets.length > 0 &&
    resolveMobileSettingsTargets(selectedTargets, projectMembers).every((target) =>
      writableEnvironments.has(target.environment.environmentId),
    );
  const reference = displayTargets[0] ?? null;
  const referenceSettings = reference?.settings ?? null;

  if (reference === null || referenceSettings === null) {
    return null;
  }

  const writeToAll = (
    patch: Partial<AutoSettleSettings> & {
      autoResumeLimitedThreads?: boolean;
      snoozeLimitedThreads?: boolean;
    },
  ) => props.write(patch);

  const { patch: autoSettlePatch, mismatches } = planAutoSettleSettingsSync(
    {
      environmentId: reference.environment.environmentId,
      projectId: reference.projectId,
      settings: referenceSettings,
    },
    displayTargets.map((target) => ({
      environmentId: target.environment.environmentId,
      projectId: target.projectId,
      label: target.environment.label,
      settings: target.settings,
    })),
  );

  const disabled = !canWriteSettings || props.pending;
  const afterDays = referenceSettings.sidebarAutoSettleAfterDays;

  return (
    <View className="gap-6">
      {!projectSelected ? (
        <SettingsSection title={t("mobile.settingsThreadsRouteScreen.usageLimits")}>
          <SettingsSwitchRow
            icon="clock"
            label={t("mobile.threadSettingsSections.resumeAfterUsageLimits")}
            value={uniformMobileSetting(displayTargets, "autoResumeLimitedThreads")}
            disabled={disabled}
            onValueChange={(value) => writeToAll({ autoResumeLimitedThreads: value })}
          />
          <SettingsSwitchRow
            icon="clock"
            label={t("mobile.threadSettingsSections.snoozeUntilLimitsReset")}
            value={uniformMobileSetting(displayTargets, "snoozeLimitedThreads")}
            disabled={disabled}
            onValueChange={(value) => writeToAll({ snoozeLimitedThreads: value })}
          />
        </SettingsSection>
      ) : null}
      <SettingsSection title={t("mobile.settingsThreadsRouteScreen.autosettle")}>
        <SettingsSwitchRow
          icon="arrow.triangle.branch"
          label={t("mobile.settingsThreadsRouteScreen.autosettleMergedThreads")}
          value={referenceSettings.sidebarAutoSettleOnMerge}
          disabled={disabled}
          onValueChange={(value) => writeToAll({ sidebarAutoSettleOnMerge: value })}
        />
        <SettingsSwitchRow
          icon="clock"
          label={t("mobile.settingsThreadsRouteScreen.autosettleInactiveThreads")}
          value={afterDays !== null}
          disabled={disabled}
          onValueChange={(value) =>
            writeToAll({ sidebarAutoSettleAfterDays: value ? AUTO_SETTLE_DEFAULT_DAYS : null })
          }
        />
        {afterDays !== null ? (
          <View className="flex-row items-center gap-4 px-4 py-4 android:min-h-14 android:py-3">
            <View className="w-[22px] android:w-6" />
            <Text className="flex-1 text-foreground text-lg android:text-base">
              {t("mobile.settingsThreadsRouteScreen.inactiveDays")}
            </Text>
            <AutoSettleDaysField
              value={afterDays}
              disabled={disabled}
              onValueChange={(value) => writeToAll({ sidebarAutoSettleAfterDays: value })}
            />
          </View>
        ) : null}
      </SettingsSection>
      {!props.pending && mismatches.length > 0 ? (
        <SettingsSection title={t("mobile.settingsThreadsRouteScreen.acrossEnvironments")}>
          <View className="gap-3 p-4">
            <Text className="text-base text-foreground">
              {t("mobile.settingsThreadsRouteScreen.autosettleDefaultsDiffer")}
            </Text>
            <Text className="text-sm text-foreground-muted">
              {mismatches.map((mismatch) => mismatch.label).join(", ")}
            </Text>
            <Button
              label={t("mobile.settingsThreadsRouteScreen.applyAutosettleDefaults")}
              tone="secondary"
              disabled={disabled}
              onPress={() => writeToAll(autoSettlePatch)}
            />
          </View>
        </SettingsSection>
      ) : null}
    </View>
  );
}

export function WorkingSectionSettings() {
  const { t } = useI18n();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const workingShelfEnabled =
    AsyncResult.isSuccess(preferences) && preferences.value.workingShelfEnabled !== false;

  return (
    <View className="gap-3">
      <SettingsSection title={t("settings.theme.role.sidebar")}>
        <SettingsSwitchRow
          icon="bolt.circle"
          label={t("mobile.settingsThreadsRouteScreen.workingSection")}
          value={workingShelfEnabled}
          onValueChange={(value) => savePreferences({ workingShelfEnabled: value })}
        />
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {t(
          "mobile.settingsThreadsRouteScreen.foldWorkingAndMonitoringThreadsIntoAWorkingSectionTheyReturnToTheTopOfTheListWhenTheyNeedYouWhileThisIsOnActiveThreadsAreOrderedByTimeAndCannotBeMoved",
        )}
      </Text>
    </View>
  );
}

export function NewThreadSettingsSection() {
  const { t } = useI18n();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const useLastProject =
    AsyncResult.isSuccess(preferences) && preferences.value.useLastProjectForNewThreads !== false;

  return (
    <SettingsSection title={t("mobile.settings.newThreads")}>
      <SettingsSwitchRow
        icon="square.and.pencil"
        label={t("mobile.threadSettingsSections.useLastProject")}
        subtitle={t("mobile.threadSettingsSections.useLastProjectDescription")}
        value={useLastProject}
        onValueChange={(value) => savePreferences({ useLastProjectForNewThreads: value })}
      />
    </SettingsSection>
  );
}

/** Per machine, since each machine's own setting decides whether it links and answers links. */
function BetaSettingsSection() {
  const { t } = useI18n();
  const { environments } = useEnvironments();
  const supported = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" &&
      environment.serverConfig?.environment.capabilities.peerLinks === true,
  );
  const writable = useEnvironmentsWithScope(supported, AuthSettingsWriteScope);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "linked environments beta update",
    reportFailure: true,
  });
  if (supported.length === 0) return null;
  return (
    <View className="gap-3">
      <SettingsSection title={t("mobile.threadSettingsSections.betaLinkedEnvironments")}>
        {supported.map((environment) => (
          <SettingsSwitchRow
            key={environment.environmentId}
            icon="link"
            label={environment.label}
            value={environment.serverConfig?.settings.linkedEnvironmentsEnabled === true}
            disabled={!writable.has(environment.environmentId)}
            onValueChange={(value) =>
              void updateSettings({
                environmentId: environment.environmentId,
                input: { patch: { linkedEnvironmentsEnabled: value } },
              })
            }
          />
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {t("mobile.threadSettingsSections.linkedEnvironmentsDescription")}
      </Text>
    </View>
  );
}

function LegacySettingsSection() {
  const { t } = useI18n();
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const planModeEnabled =
    AsyncResult.isSuccess(preferences) && preferences.value.planModeEnabled === true;

  return (
    <View className="gap-3">
      <SettingsSection title={t("mobile.settingsThreadsRouteScreen.legacy")}>
        <SettingsSwitchRow
          icon="hammer"
          label={t("mobile.settingsThreadsRouteScreen.planMode")}
          value={planModeEnabled}
          onValueChange={(value) => savePreferences({ planModeEnabled: value })}
        />
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {t(
          "mobile.settingsThreadsRouteScreen.optIntoRetiredInterfacesKeptForCompatibilityPlanModeRestoresTheBuildPlanControlOtherwiseEveryTaskRunsInBuildMode",
        )}
      </Text>
    </View>
  );
}
