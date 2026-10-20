import { Toolbar } from "../../components/ui/Toolbar";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import { useAuth, useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import { Platform, View } from "react-native";
import { deriveProjectGroupLabel } from "@t3tools/client-runtime/state/project-grouping";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";

export function SettingsRouteScreen() {
  const { t } = useI18n();
  const navigation = useNavigation();
  const { layout } = useAdaptiveWorkspaceLayout();
  const content = hasCloudPublicConfig() ? (
    <ConfiguredSettingsRouteScreen />
  ) : (
    <LocalSettingsRouteScreen />
  );

  return (
    <>
      {Platform.OS === "ios" ? (
        <NativeStackScreenOptions options={{ headerBackVisible: !layout.usesSplitView }} />
      ) : null}
      {Platform.OS === "ios" && layout.usesSplitView ? (
        <>
          <Toolbar placement="left">
            <Toolbar.Button
              accessibilityLabel={t("mobile.settings.goBack")}
              icon="chevron.left"
              onPress={() => navigation.goBack()}
            />
          </Toolbar>
        </>
      ) : null}
      <SettingsEnvironmentFilterHeader closeSettings />
      {Platform.OS === "android" ? (
        <SettingsScreen
          title={t("mobile.settings.settings")}
          trailing={<AndroidSettingsEnvironmentFilter />}
        >
          {content}
        </SettingsScreen>
      ) : (
        content
      )}
    </>
  );
}

function ConfiguredSettingsRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const accountLabel = !isLoaded
    ? "Checking"
    : !isSignedIn
      ? "Sign in"
      : (user?.primaryEmailAddress?.emailAddress ?? "Signed in");

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title={t("mobile.settings.connections")}>
          <SettingsRow
            icon="person.crop.circle"
            label={t("mobile.settings.t3Account")}
            value={accountLabel}
            disabled={!isLoaded}
            onPress={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
          />
          <SettingsRow
            icon="desktopcomputer"
            label={t("mobile.settings.environments")}
            value={`${Object.keys(savedConnectionsById).length}`}
            valuePosition="trailing"
            target="SettingsEnvironments"
          />
          <SettingsRow
            icon="bell.badge"
            label={t("mobile.settings.notifications")}
            target="SettingsNotifications"
          />
        </SettingsSection>

        <SettingsIndexSections />
      </ScrollView>
    </View>
  );
}

function LocalSettingsRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environmentCount = Object.keys(savedConnectionsById).length;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
      >
        <SettingsSection title={t("mobile.settings.connections")}>
          <SettingsRow
            icon="desktopcomputer"
            label={t("mobile.settings.environments")}
            value={`${environmentCount}`}
            valuePosition="trailing"
            target="SettingsEnvironments"
          />
        </SettingsSection>

        <SettingsIndexSections />
      </ScrollView>
    </View>
  );
}

function SettingsIndexSections() {
  const { t } = useI18n();
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const noServerTargets = selectedTargets.length === 0;
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const scopedProjectMembers =
    selectedProject?.members
      .map((member) => member.project)
      .filter((project) =>
        selectedTargets.some((target) => target.environmentId === project.environmentId),
      ) ?? [];
  const projectLabel =
    scopedProjectMembers.length > 0
      ? deriveProjectGroupLabel({
          representative: scopedProjectMembers[0]!,
          members: scopedProjectMembers,
        })
      : (selectedProject?.label ?? "Unavailable project");
  return (
    <>
      <SettingsSection title={t("mobile.settings.interface")}>
        <SettingsRow
          icon="paintbrush"
          label={t("mobile.settings.appearance")}
          target="SettingsAppearance"
        />
        {Platform.OS === "ios" ? (
          <>
            <SettingsRow
              icon="keyboard"
              label={t("mobile.settings.keyboard")}
              target="SettingsKeyboard"
            />
            <SettingsRow
              icon="mic"
              label={t("mobile.settings.microphone")}
              target="SettingsMicrophone"
            />
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t("mobile.settings.automations")}>
        <SettingsRow
          icon="clock"
          label={t("mobile.settings.scheduledTasks")}
          target="SettingsScheduledTasks"
        />
      </SettingsSection>

      <SettingsSection title={t("mobile.settings.projectsThreads")}>
        {selectedProjectKey !== null ? (
          <SettingsRow
            icon="folder"
            label={t("mobile.settings.overview")}
            value={projectLabel}
            target="SettingsProjectOverview"
          />
        ) : null}
        <SettingsRow
          icon="folder"
          label={t("mobile.settings.organization")}
          target="SettingsOrganization"
        />
        <SettingsRow
          icon="text.bubble"
          label={t("mobile.settings.threadBehavior")}
          target="SettingsThreads"
        />
        <SettingsRow
          icon="arrow.turn.left.up"
          label={t("mobile.settings.followups")}
          target="SettingsFollowUp"
        />
        <SettingsRow
          icon="archivebox"
          label={t("mobile.settings.archivedThreads")}
          target="SettingsArchive"
        />
      </SettingsSection>

      <SettingsSection title={t("mobile.settings.serverSettings")}>
        <SettingsRow
          icon="person.crop.circle"
          label={t("mobile.settings.providerAccounts")}
          target="SettingsProviderAccounts"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="text.bubble"
          label={t("mobile.settings.newThreads")}
          target="SettingsEnvironmentNewThreads"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="arrow.triangle.branch"
          label={t("mobile.settings.sourceControl")}
          target="SettingsEnvironmentSourceControl"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="text.alignleft"
          label={t("mobile.settings.agentBehavior")}
          target="SettingsEnvironmentAgentBehavior"
          disabled={noServerTargets}
        />
        <SettingsRow
          icon="arrow.clockwise"
          label={t("mobile.settings.maintenance")}
          target="SettingsEnvironmentMaintenance"
          disabled={noServerTargets}
        />
      </SettingsSection>

      <SettingsSection title={t("mobile.settings.app")}>
        <SettingsRow
          icon="chart.bar.xaxis"
          label={t("mobile.settings.usage")}
          target="SettingsUsage"
        />
        <SettingsRow
          icon="info.circle"
          label={t("mobile.settings.aboutT3Code")}
          target="SettingsAbout"
        />
      </SettingsSection>
    </>
  );
}
