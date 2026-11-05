import { useI18n } from "../../i18n/useI18n";
import type { MessageKey } from "@t3tools/shared/i18n";
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

import {
  RUNTIME_MODE_CHOICES,
  withManagedRuntimeModeLimits,
} from "../threads/thread-settings-options";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { BranchNamingSettings } from "./components/BranchNamingSettings";
import { DatabaseStorageNotice } from "./components/DatabaseStorageNotice";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { SourceControlSignInSection } from "./components/SourceControlSignInSection";
import { SettingsProjectOverridesSection } from "./components/SettingsProjectOverridesSection";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import { useSettingsWriter } from "./useSettingsWriter";
import {
  managedSettingReason,
  planMobileScopedSettingsClear,
  planMobileScopedSettingsPatch,
  resolveMobileSettingsTargets,
  uniformMobileSetting,
  type ScopedMobileSettingsTarget,
} from "./settings-scoped-server";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";
import { AutoSettleSettingsRows } from "./ThreadSettingsSections";
import { supportsSharedSettingsSync } from "@t3tools/client-runtime/state/shared-settings";

type SettingsPage = "threads" | "source-control" | "worktrees" | "maintenance";

const PAGE_TITLES: Record<SettingsPage, MessageKey> = {
  threads: "mobile.workspaceToolbar.threads",
  "source-control": "mobile.settings.sourceControl",
  worktrees: "settings.integrations.worktrees",
  maintenance: "mobile.settings.maintenance",
};

const PAGE_PROJECT_KEYS: Record<SettingsPage, readonly ProjectScopedServerSettingKey[]> = {
  threads: [
    "defaultThreadEnvMode",
    "defaultRuntimeMode",
    "responseStreamingMode",
    "enableAgentBrowserAccess",
    "sidebarAutoSettleOnMerge",
    "sidebarAutoSettleAfterDays",
  ],
  "source-control": ["defaultAutoPull", "removeAgentCreditsOnMerge"],
  worktrees: [
    "newWorktreesStartFromOrigin",
    "worktreeSubmodules",
    "branchNamingMode",
    "branchNamePrefix",
    "branchNameInstructions",
  ],
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

// Only servers with thread auto-settlement store these, so other targets get the rest of a patch.
const AUTO_SETTLE_SETTING_KEYS: ReadonlySet<string> = new Set([
  "sidebarAutoSettleOnMerge",
  "sidebarAutoSettleAfterDays",
  "autoResumeLimitedThreads",
  "snoozeLimitedThreads",
]);

function planServerSettingsWrites(
  targets: readonly ScopedMobileSettingsTarget[],
  projectSelected: boolean,
  patch: ServerSettingsPatch,
) {
  const capable = targets.filter((target) => supportsSharedSettingsSync(target.environment));
  const others = targets.filter((target) => !supportsSharedSettingsSync(target.environment));
  const othersPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => !AUTO_SETTLE_SETTING_KEYS.has(key)),
  ) as ServerSettingsPatch;
  return [
    ...planMobileScopedSettingsPatch(capable, projectSelected, patch),
    ...(Object.keys(othersPatch).length > 0
      ? planMobileScopedSettingsPatch(others, projectSelected, othersPatch)
      : []),
  ];
}

export function SettingsThreadsRouteScreen() {
  return <ServerSettingsDetail page="threads" />;
}

export function SettingsEnvironmentSourceControlRouteScreen() {
  return <ServerSettingsDetail page="source-control" />;
}

export function SettingsWorktreesRouteScreen() {
  return <ServerSettingsDetail page="worktrees" />;
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
  // Closing views can save after controls disable; queue those patches behind the pending write.
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
    const writes = planServerSettingsWrites(targets, projectSelected, patch);
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
  const disabled = !canWriteSettings || pendingWrites > 0 || !hasConnectedSelection;
  const managed = (...keys: string[]) => managedSettingReason(targets, ...keys);
  // A locked row keeps its explanation and says who manages it.
  const managedSubtitle = (key: string, subtitle: string) => {
    const reason = managed(key);
    return reason === undefined ? subtitle : `${subtitle} ${reason}`;
  };
  const runtimeModeChoices = withManagedRuntimeModeLimits(
    RUNTIME_MODE_CHOICES,
    targets.map((target) => target.environment.serverConfig.managedPolicy),
  );
  const disabledFor = (key: string) =>
    disabled ||
    managed(key) !== undefined ||
    (projectSelected &&
      !PROJECT_SCOPED_SERVER_SETTING_KEYS.includes(
        key as (typeof PROJECT_SCOPED_SERVER_SETTING_KEYS)[number],
      ));

  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen
        title={t(PAGE_TITLES[props.page])}
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
              <ManagedPolicyNotice targets={targets} />
              {projectSelected ? (
                <SettingsProjectOverridesSection
                  projectLabel={
                    selectedProject?.label ?? t("settings.settingsScopeSentence.unavailableProject")
                  }
                  hasOverrides={targets.some((target) =>
                    PAGE_PROJECT_KEYS[props.page].some((key) => target.sources[key] === "project"),
                  )}
                  pending={pendingWrites > 0}
                  disabled={!canWriteSettings}
                  onClear={clearProjectOverrides}
                />
              ) : null}
              {props.page === "threads" ? (
                <>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.defaultWorkspace")}
                    footer={managed("defaultThreadEnvMode")}
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
                    title={t("mobile.settingsServerControlsRouteScreen.defaultPermissions")}
                    footer={managed("defaultRuntimeMode")}
                    trailing={
                      pendingWrites === 0 && uniform("defaultRuntimeMode") === null ? (
                        <MixedValuesLabel projectSelected={projectSelected} />
                      ) : null
                    }
                  >
                    {runtimeModeChoices.map((choice, index) => (
                      <SettingsChoiceRow
                        key={choice.mode}
                        label={choice.label}
                        description={choice.disabledReason ?? choice.description}
                        selected={uniform("defaultRuntimeMode") === choice.mode}
                        separated={index > 0}
                        disabled={
                          disabledFor("defaultRuntimeMode") || choice.disabledReason !== undefined
                        }
                        onPress={() => write({ defaultRuntimeMode: choice.mode })}
                      />
                    ))}
                  </SettingsSection>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.responseStreaming")}
                    footer={managed("responseStreamingMode")}
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
                      subtitle={managedSubtitle(
                        "enableAgentBrowserAccess",
                        t(
                          "mobile.settingsServerControlsRouteScreen.allowAgentsToUseTheInappPreviewBrowser",
                        ),
                      )}
                      value={uniform("enableAgentBrowserAccess")}
                      disabled={disabledFor("enableAgentBrowserAccess")}
                      onValueChange={(value) => write({ enableAgentBrowserAccess: value })}
                    />
                  </SettingsSection>
                  <AutoSettleSettingsRows write={write} pending={pendingWrites > 0} />
                </>
              ) : null}

              {props.page === "source-control" ? (
                <>
                  {projectSelected ? null : (
                    <SourceControlSignInSection
                      environments={selectedTargets}
                      canWrite={(environmentId) => writableEnvironments.has(environmentId)}
                    />
                  )}
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.pullRequests")}
                  >
                    <SettingsSwitchRow
                      icon={PullRequestGlyph.merged}
                      label={t("mobile.settingsServerControlsRouteScreen.removeAgentCredits")}
                      subtitle={managedSubtitle(
                        "removeAgentCreditsOnMerge",
                        t("mobile.settingsServerControlsRouteScreen.removeAgentCreditsDescription"),
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
                      subtitle={managedSubtitle(
                        "defaultAutoPull",
                        t("mobile.settingsServerControlsRouteScreen.automaticallyPullDescription"),
                      )}
                      value={uniform("defaultAutoPull")}
                      disabled={disabledFor("defaultAutoPull")}
                      onValueChange={(value) => write({ defaultAutoPull: value })}
                    />
                  </SettingsSection>
                </>
              ) : null}

              {props.page === "worktrees" ? (
                <>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.newWorktrees")}
                  >
                    <SettingsSwitchRow
                      icon="arrow.triangle.branch"
                      label={t("mobile.settingsServerControlsRouteScreen.startFromRemote")}
                      subtitle={managedSubtitle(
                        "newWorktreesStartFromOrigin",
                        t("mobile.settingsServerControlsRouteScreen.startFromRemoteDescription"),
                      )}
                      value={uniform("newWorktreesStartFromOrigin")}
                      disabled={disabledFor("newWorktreesStartFromOrigin")}
                      onValueChange={(value) => write({ newWorktreesStartFromOrigin: value })}
                    />
                  </SettingsSection>
                  <SettingsSection
                    title={t("mobile.settingsServerControlsRouteScreen.worktreeSubmodules")}
                    footer={managed("worktreeSubmodules")}
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
                  <BranchNamingSettings
                    key={targetsKey}
                    mode={uniform("branchNamingMode")}
                    prefix={uniform("branchNamePrefix")}
                    instructions={uniform("branchNameInstructions")}
                    disabled={{
                      mode: disabledFor("branchNamingMode"),
                      prefix: disabledFor("branchNamePrefix"),
                      instructions: disabledFor("branchNameInstructions"),
                    }}
                    onChange={write}
                  />
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
                          value={t(
                            "mobile.settingsServerControlsRouteScreen.serverAndProviderUpdates",
                          )}
                          onPress={() =>
                            navigation.navigate("SettingsEnvironmentDetail", {
                              environmentId: target.environmentId,
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
                      subtitle={managedSubtitle(
                        "enableProviderUpdateChecks",
                        projectSelected
                          ? t("mobile.settingsServerControlsRouteScreen.environmentWideSetting")
                          : t(
                              "mobile.settingsServerControlsRouteScreen.checkInstalledProviderClis",
                            ),
                      )}
                      value={uniform("enableProviderUpdateChecks")}
                      disabled={disabledFor("enableProviderUpdateChecks")}
                      onValueChange={(value) => write({ enableProviderUpdateChecks: value })}
                    />
                    <View className="border-t border-border-subtle">
                      <SettingsSwitchRow
                        icon="arrow.uturn.forward"
                        label={t("mobile.settingsServerControlsRouteScreen.continueAfterRestart")}
                        subtitle={managedSubtitle(
                          "continueThreadsAfterServerUpdate",
                          t("mobile.settingsServerControlsRouteScreen.resumeInterruptedThreads"),
                        )}
                        value={uniform("continueThreadsAfterServerUpdate")}
                        disabled={disabledFor("continueThreadsAfterServerUpdate")}
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

/** Locked settings are refused when saved; say so before the user tries. */
function ManagedPolicyNotice(props: { readonly targets: readonly ScopedMobileSettingsTarget[] }) {
  const organizations = [
    ...new Set(
      props.targets.flatMap((target) => {
        const policy = target.environment.serverConfig.managedPolicy;
        return policy !== undefined && policy.lockedSettings.length > 0
          ? [policy.organization]
          : [];
      }),
    ),
  ];
  if (organizations.length === 0) return null;
  return (
    <Text className="px-2 text-sm text-foreground-muted android:px-4">
      Some settings are managed by {organizations.join(", ")} and cannot be changed here.
    </Text>
  );
}
