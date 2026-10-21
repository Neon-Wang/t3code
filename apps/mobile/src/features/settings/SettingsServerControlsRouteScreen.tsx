import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../i18n/useI18n";
import { useNavigation } from "@react-navigation/native";
import { SettingsRow } from "./components/SettingsRow";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { readEnvironmentScope, useEnvironmentsWithScope } from "../../state/session";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { AppText as Text } from "../../components/ui/AppText";
import {
  type ResponseStreamingMode,
  type ServerSettings,
  type ServerSettingsPatch,
  type ThreadEnvMode,
  type WorktreeSubmodules,
  PROJECT_SCOPED_SERVER_SETTING_KEYS,
  type ProjectScopedServerSettingKey,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RUNTIME_MODE_CHOICES } from "../threads/thread-settings-options";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { BranchNamingSettings } from "./components/BranchNamingSettings";
import { DatabaseStorageNotice } from "./components/DatabaseStorageNotice";
import { SettingsChoiceRow } from "./components/SettingsChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { SettingsProjectOverridesSection } from "./components/SettingsProjectOverridesSection";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import { useSettingsWriter } from "./useSettingsWriter";
import {
  planMobileScopedSettingsClear,
  planMobileScopedSettingsPatch,
  resolveMobileSettingsTargets,
  uniformMobileSetting,
  type ScopedMobileSettingsTarget,
} from "./settings-scoped-server";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";

type SettingsPage = "new-threads" | "source-control" | "agent-behavior" | "maintenance";

const PAGE_TITLES: Record<SettingsPage, string> = {
  get "new-threads"() {
    return i18n.t("mobile.navigation.newThreads");
  },
  get "source-control"() {
    return i18n.t("mobile.navigation.sourceControl");
  },
  get "agent-behavior"() {
    return i18n.t("mobile.navigation.agentBehavior");
  },
  get maintenance() {
    return i18n.t("mobile.navigation.maintenance");
  },
};

const PAGE_PROJECT_KEYS: Record<SettingsPage, readonly ProjectScopedServerSettingKey[]> = {
  "new-threads": ["defaultThreadEnvMode", "worktreeSubmodules", "defaultRuntimeMode"],
  "source-control": [
    "defaultAutoPull",
    "removeAgentCreditsOnMerge",
    "newWorktreesStartFromOrigin",
    "branchNamingMode",
    "branchNamePrefix",
    "branchNameInstructions",
  ],
  "agent-behavior": ["responseStreamingMode", "enableAgentBrowserAccess"],
  maintenance: ["continueThreadsAfterServerUpdate"],
};

const SUBMODULE_CHOICES = (
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{
  readonly mode: WorktreeSubmodules | null;
  readonly label: string;
  readonly description: string;
}> => [
  {
    mode: null,
    label: t("mobile.settingsServerControlsRouteScreen.inherit"),
    description: t(
      "mobile.settingsServerControlsRouteScreen.useTheRepositorysT3jsonOrInitializeRecursively",
    ),
  },
  {
    mode: "recursive",
    label: t("mobile.settingsServerControlsRouteScreen.recursive"),
    description: t("mobile.settingsServerControlsRouteScreen.initializeNestedSubmodulesToo"),
  },
  {
    mode: "top-level",
    label: t("mobile.settingsServerControlsRouteScreen.topLevelOnly"),
    description: t(
      "mobile.settingsServerControlsRouteScreen.skipSubmodulesDeclaredInsideOtherSubmodules",
    ),
  },
  {
    mode: "none",
    label: t("mobile.settingsServerControlsRouteScreen.skip"),
    description: t("mobile.settingsServerControlsRouteScreen.leaveSubmodulesEmptyForASetupScript"),
  },
];

const WORKSPACE_CHOICES = (
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{
  readonly mode: ThreadEnvMode | null;
  readonly label: string;
  readonly description: string;
}> => [
  {
    mode: null,
    label: t("mobile.settingsServerControlsRouteScreen.inherit"),
    description: t(
      "mobile.settingsServerControlsRouteScreen.useTheRepositorysT3jsonOrTheCurrentCheckout",
    ),
  },
  {
    mode: "local",
    label: t("mobile.settingsServerControlsRouteScreen.currentCheckout"),
    description: t(
      "mobile.settingsServerControlsRouteScreen.startNewThreadsInTheExistingWorkspace",
    ),
  },
  {
    mode: "worktree",
    label: t("mobile.settingsServerControlsRouteScreen.newWorktree"),
    description: t("mobile.settingsServerControlsRouteScreen.giveEachNewThreadASeparateCheckout"),
  },
];

const STREAMING_CHOICES = (
  t: ReturnType<typeof useI18n>["t"],
): ReadonlyArray<{
  readonly mode: ResponseStreamingMode;
  readonly label: string;
  readonly description: string;
}> => [
  {
    mode: "turn",
    label: t("mobile.settingsServerControlsRouteScreen.afterTheTurn"),
    description: t("mobile.settingsServerControlsRouteScreen.showTheAnswerWhenTheAgentFinishes"),
  },
  {
    mode: "paragraph",
    label: t("mobile.settingsServerControlsRouteScreen.finishedParagraphs"),
    description: t(
      "mobile.settingsServerControlsRouteScreen.showEachParagraphOrCodeBlockAsItCompletes",
    ),
  },
];

export function SettingsEnvironmentNewThreadsRouteScreen() {
  return <ServerSettingsDetail page="new-threads" />;
}

export function SettingsEnvironmentSourceControlRouteScreen() {
  return <ServerSettingsDetail page="source-control" />;
}

export function SettingsEnvironmentAgentBehaviorRouteScreen() {
  return <ServerSettingsDetail page="agent-behavior" />;
}

export function SettingsEnvironmentMaintenanceRouteScreen() {
  return <ServerSettingsDetail page="maintenance" />;
}

function ServerSettingsDetail(props: { readonly page: SettingsPage }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const writableEnvironments = useEnvironmentsWithScope(selectedTargets, AuthSettingsWriteScope);
  const projectSelected = selectedProjectKey !== null;
  const targets = resolveMobileSettingsTargets(
    selectedTargets,
    projectSelected ? (selectedProject?.members.map((member) => member.project) ?? []) : null,
  );
  const [pendingWrites, setPendingWrites] = useState(0);
  const writeInFlight = useRef(false);
  // A closing view can still save its drafts while a write is pending, after
  // the controls disabled. Those patches run once the current write settles.
  const queuedPatch = useRef<{ key: string; patch: ServerSettingsPatch } | null>(null);
  const targetsKey = targets
    .map((target) => `${target.environment.environmentId}:${target.projectId}`)
    .join(",");
  const [pendingTargets, setPendingTargets] = useState<
    readonly ScopedMobileSettingsTarget[] | null
  >(null);
  const canWriteSettings =
    targets.length > 0 &&
    targets.every((target) => writableEnvironments.has(target.environment.environmentId));
  const displayTargets = pendingWrites > 0 && pendingTargets !== null ? pendingTargets : targets;
  const hasConnectedSelection = targets.length > 0;
  const reference = displayTargets[0] ?? null;
  const uniform = <K extends keyof ServerSettings>(key: K) =>
    uniformMobileSetting(displayTargets, key);
  // `uniform` folds a real null into "mixed"; nullable keys need the distinction.
  const isMixed = (key: keyof ServerSettings) =>
    reference === null ||
    displayTargets.some((entry) => entry.settings[key] !== reference.settings[key]);
  const writeSettings = useSettingsWriter();
  const write = (patch: ServerSettingsPatch) => {
    if (writeInFlight.current) {
      const queued = queuedPatch.current;
      queuedPatch.current = {
        key: targetsKey,
        patch: queued?.key === targetsKey ? { ...queued.patch, ...patch } : patch,
      };
      return;
    }
    if (
      !hasConnectedSelection ||
      !targets.every((target) =>
        readEnvironmentScope(target.environment.environmentId, AuthSettingsWriteScope),
      )
    )
      return;
    const writes = planMobileScopedSettingsPatch(targets, projectSelected, patch);
    if (writes.length === 0) return;
    writeInFlight.current = true;
    setPendingTargets(targets);
    setPendingWrites((count) => count + 1);
    void writeSettings(targets, writes).finally(() => {
      writeInFlight.current = false;
      setPendingTargets(null);
      setPendingWrites((count) => count - 1);
      const queued = queuedPatch.current;
      queuedPatch.current = null;
      // These targets may not show this write yet, so send it again with the
      // queued patch; project overrides are replaced whole.
      if (queued?.key === targetsKey) write({ ...patch, ...queued.patch });
    });
  };
  const clearProjectOverrides = () => {
    if (
      writeInFlight.current ||
      !targets.every((target) =>
        readEnvironmentScope(target.environment.environmentId, AuthSettingsWriteScope),
      )
    )
      return;
    const writes = planMobileScopedSettingsClear(targets, PAGE_PROJECT_KEYS[props.page]);
    if (writes.length === 0) return;
    writeInFlight.current = true;
    setPendingTargets(targets);
    setPendingWrites((count) => count + 1);
    void writeSettings(targets, writes).finally(() => {
      writeInFlight.current = false;
      // Resending a draft over these pre-clear targets would undo the clear.
      queuedPatch.current = null;
      setPendingTargets(null);
      setPendingWrites((count) => count - 1);
    });
  };
  const supportsProjectOverrides = targets.every(
    (target) =>
      target.environment.serverConfig.environment.capabilities.projectSettingsOverrides === true,
  );
  const disabled =
    !canWriteSettings ||
    pendingWrites > 0 ||
    !hasConnectedSelection ||
    (projectSelected && !supportsProjectOverrides);
  const supportsContinuation = targets.every(
    (target) =>
      target.environment.serverConfig.environment.capabilities.threadRestartContinuation === true,
  );
  const disabledFor = (key: string) =>
    disabled ||
    (projectSelected &&
      !PROJECT_SCOPED_SERVER_SETTING_KEYS.includes(
        key as (typeof PROJECT_SCOPED_SERVER_SETTING_KEYS)[number],
      ));

  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen
        title={PAGE_TITLES[props.page]}
        trailing={<AndroidSettingsEnvironmentFilter />}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          {!hasConnectedSelection || reference === null ? (
            <Text className="px-2 text-base text-foreground-muted">
              {projectSelected
                ? t("mobile.settingsServerControlsRouteScreen.selectAProjectWithACheckout")
                : t("mobile.settingsServerControlsRouteScreen.useTheFilterAbove")}
            </Text>
          ) : (
            <>
              {projectSelected ? (
                <SettingsProjectOverridesSection
                  projectLabel={
                    selectedProject?.label ?? t("settings.settingsScopeSentence.unavailableProject")
                  }
                  hasOverrides={targets.some((target) =>
                    PAGE_PROJECT_KEYS[props.page].some((key) => target.sources[key] === "project"),
                  )}
                  supportsOverrides={supportsProjectOverrides}
                  pending={pendingWrites > 0}
                  disabled={!canWriteSettings}
                  onClear={clearProjectOverrides}
                />
              ) : null}
              {props.page === "new-threads" ? (
                <>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.defaultWorkspace")}
                    trailing={
                      pendingWrites === 0 && isMixed("defaultThreadEnvMode") ? (
                        <MixedValuesLabel projectSelected={projectSelected} />
                      ) : null
                    }
                  >
                    {WORKSPACE_CHOICES(t)
                      .filter((choice) => choice.mode !== null || !projectSelected)
                      .map((choice, index) => (
                        <SettingsChoiceRow
                          key={choice.mode ?? "inherit"}
                          label={choice.label}
                          description={choice.description}
                          selected={
                            !isMixed("defaultThreadEnvMode") &&
                            uniform("defaultThreadEnvMode") === choice.mode
                          }
                          separated={index > 0}
                          disabled={disabledFor("defaultThreadEnvMode")}
                          onPress={() => write({ defaultThreadEnvMode: choice.mode })}
                        />
                      ))}
                  </SettingsSection>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.worktreeSubmodules")}
                    trailing={
                      pendingWrites === 0 && isMixed("worktreeSubmodules") ? (
                        <MixedValuesLabel projectSelected={projectSelected} />
                      ) : null
                    }
                  >
                    {SUBMODULE_CHOICES(t)
                      .filter((choice) => choice.mode !== null || !projectSelected)
                      .map((choice, index) => (
                        <SettingsChoiceRow
                          key={choice.mode ?? "inherit"}
                          label={choice.label}
                          description={choice.description}
                          selected={
                            !isMixed("worktreeSubmodules") &&
                            uniform("worktreeSubmodules") === choice.mode
                          }
                          separated={index > 0}
                          disabled={disabledFor("worktreeSubmodules")}
                          onPress={() => write({ worktreeSubmodules: choice.mode })}
                        />
                      ))}
                  </SettingsSection>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.defaultPermissions")}
                    trailing={
                      pendingWrites === 0 && uniform("defaultRuntimeMode") === null ? (
                        <MixedValuesLabel projectSelected={projectSelected} />
                      ) : null
                    }
                  >
                    {RUNTIME_MODE_CHOICES.map((choice, index) => (
                      <SettingsChoiceRow
                        key={choice.mode}
                        label={choice.label}
                        description={choice.description}
                        selected={uniform("defaultRuntimeMode") === choice.mode}
                        separated={index > 0}
                        disabled={disabledFor("defaultRuntimeMode")}
                        onPress={() => write({ defaultRuntimeMode: choice.mode })}
                      />
                    ))}
                  </SettingsSection>
                </>
              ) : null}

              {props.page === "source-control" ? (
                <>
                  <BranchNamingSettings
                    key={targetsKey}
                    mode={uniform("branchNamingMode")}
                    prefix={uniform("branchNamePrefix")}
                    instructions={uniform("branchNameInstructions")}
                    disabled={disabledFor("branchNamingMode")}
                    onChange={write}
                  />
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.pullRequests")}
                  >
                    <SettingsSwitchRow
                      icon={PullRequestGlyph.merged}
                      label={i18n.t(
                        "mobile.settingsServerControlsRouteScreen.removeAgentCreditsWhenMerging",
                      )}
                      subtitle={i18n.t(
                        "mobile.settingsServerControlsRouteScreen.removeRecognizedAgentCreditsFromGitHubMergeAndSquashMessagesKeepingHumanCoauthorsIncludesAutomergeExcludesMergeQueuesStackMergesAndExistingCommits",
                      )}
                      value={uniform("removeAgentCreditsOnMerge")}
                      disabled={disabledFor("removeAgentCreditsOnMerge")}
                      onValueChange={(value) => write({ removeAgentCreditsOnMerge: value })}
                    />
                  </SettingsSection>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.defaultBranch")}
                  >
                    <SettingsSwitchRow
                      icon="arrow.down.circle"
                      label={t("mobile.settingsServerControlsRouteScreen.automaticallyPull")}
                      subtitle={t(
                        "mobile.settingsServerControlsRouteScreen.keepTheDefaultBranchCurrentWhenThereAreNoLocalChanges",
                      )}
                      value={uniform("defaultAutoPull")}
                      disabled={disabledFor("defaultAutoPull")}
                      onValueChange={(value) => write({ defaultAutoPull: value })}
                    />
                  </SettingsSection>
                  <SettingsSection title={t("mobile.settingsServerControlsRouteScreen.worktrees")}>
                    <SettingsSwitchRow
                      icon="arrow.triangle.branch"
                      label={t("mobile.settingsServerControlsRouteScreen.startFromOrigin")}
                      subtitle={t("branchToolbar.worktreeFromOriginHint")}
                      value={uniform("newWorktreesStartFromOrigin")}
                      disabled={disabledFor("newWorktreesStartFromOrigin")}
                      onValueChange={(value) => write({ newWorktreesStartFromOrigin: value })}
                    />
                  </SettingsSection>
                </>
              ) : null}

              {props.page === "agent-behavior" ? (
                <>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.responseStreaming")}
                    trailing={
                      pendingWrites === 0 && uniform("responseStreamingMode") === null ? (
                        <MixedValuesLabel projectSelected={projectSelected} />
                      ) : null
                    }
                  >
                    {STREAMING_CHOICES(t).map((choice, index) => (
                      <SettingsChoiceRow
                        key={choice.mode}
                        label={choice.label}
                        description={choice.description}
                        selected={uniform("responseStreamingMode") === choice.mode}
                        separated={index > 0}
                        disabled={disabledFor("responseStreamingMode")}
                        onPress={() => write({ responseStreamingMode: choice.mode })}
                      />
                    ))}
                  </SettingsSection>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.previewBrowser")}
                  >
                    <SettingsSwitchRow
                      icon="globe"
                      label={t("mobile.settingsServerControlsRouteScreen.agentBrowserAccess")}
                      subtitle={t(
                        "mobile.settingsServerControlsRouteScreen.allowAgentsToUseTheInappPreviewBrowser",
                      )}
                      value={uniform("enableAgentBrowserAccess")}
                      disabled={disabledFor("enableAgentBrowserAccess")}
                      onValueChange={(value) => write({ enableAgentBrowserAccess: value })}
                    />
                  </SettingsSection>
                </>
              ) : null}

              {props.page === "maintenance" ? (
                <>
                  {!projectSelected ? (
                    <DatabaseStorageNotice
                      targets={selectedTargets.filter(
                        (target) =>
                          target.serverConfig.environment.capabilities.databaseStorage === true,
                      )}
                    />
                  ) : null}
                  {!projectSelected ? (
                    <SettingsSection
                      title={t("mobile.settingsServerControlsRouteScreen.manageEnvironments")}
                    >
                      {selectedTargets.map((target) => (
                        <SettingsRow
                          key={target.environmentId}
                          icon="server.rack"
                          label={target.label}
                          value="Server and provider updates"
                          onPress={() =>
                            navigation.navigate("SettingsSheet", {
                              screen: "SettingsContent",
                              params: {
                                screen: "SettingsEnvironmentDetail",
                                params: { environmentId: target.environmentId },
                              },
                            })
                          }
                        />
                      ))}
                    </SettingsSection>
                  ) : null}
                  <SettingsSection title={t("mobile.settingsServerControlsRouteScreen.updates")}>
                    <SettingsSwitchRow
                      icon="arrow.clockwise"
                      label={t("mobile.settingsServerControlsRouteScreen.checkProviderUpdates")}
                      subtitle={
                        projectSelected
                          ? t("mobile.settingsServerControlsRouteScreen.environmentWideSetting")
                          : t("mobile.settingsServerControlsRouteScreen.checkInstalledProviderClis")
                      }
                      value={uniform("enableProviderUpdateChecks")}
                      disabled={disabledFor("enableProviderUpdateChecks")}
                      onValueChange={(value) => write({ enableProviderUpdateChecks: value })}
                    />
                    <View className="border-t border-border-subtle">
                      <SettingsSwitchRow
                        icon="arrow.uturn.forward"
                        label={t("mobile.settingsServerControlsRouteScreen.continueAfterRestart")}
                        subtitle={
                          supportsContinuation
                            ? t("mobile.settingsServerControlsRouteScreen.resumeInterruptedThreads")
                            : t("mobile.settingsServerControlsRouteScreen.updateOlderServers")
                        }
                        value={uniform("continueThreadsAfterServerUpdate")}
                        disabled={
                          disabledFor("continueThreadsAfterServerUpdate") || !supportsContinuation
                        }
                        onValueChange={(value) =>
                          write({ continueThreadsAfterServerUpdate: value })
                        }
                      />
                    </View>
                  </SettingsSection>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </SettingsScreen>
    </>
  );
}

function MixedValuesLabel(props: { readonly projectSelected: boolean }) {
  const { t } = useI18n();
  return (
    <Text
      accessibilityLabel={
        props.projectSelected
          ? t("mobile.settingsServerControlsRouteScreen.selectedProjectCheckoutsDiffer")
          : t("mobile.settingsServerControlsRouteScreen.selectedEnvironmentsDiffer")
      }
      className="px-2 text-sm text-foreground-muted android:px-4"
    >
      {t("mobile.settingsServerControlsRouteScreen.mixed")}
    </Text>
  );
}
