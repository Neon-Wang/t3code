import type {
  StorageCleanupReport,
  StorageCleanupSettings,
  WorktreeCleanupRules,
} from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useI18n } from "../../hooks/useI18n";
import { formatBytes } from "../../lib/formatBytes";
import { environmentAtomList, environmentIdsKey } from "../../state/environmentAtomList";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useDebouncedValue } from "../../state/queries";
import { AnimatedHeight } from "../AnimatedHeight";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { DatabaseStorageNotice } from "./DatabaseStorageNotice";
import { AdvancedSettings } from "./AdvancedSettings";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { SettingsGroup } from "./SettingsGroup";
import type { ScopedSettingsTarget } from "./scopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";
import {
  useClearScopedSettings,
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { settingsScopeEnvironmentLabel } from "./settingsScopeAxis";

export function WorktreesDirectoryRow() {
  const { t } = useI18n();
  const { connectedEnvironments, targets } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["worktreesDirectory"]);
  const edited = useRef(false);
  if (
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.worktreesDirectory !== true,
    )
  )
    return null;
  const scopeKey = targets.map((target) => target.environmentId).join(",");

  return (
    <SettingsRow
      {...searchableSetting("storage-worktrees-location", t)}
      description={t("v2.settings.folderWhereNewWorktreesAreCreatedOnAnyDriveSuchAsD")}
      serverScoped
      settingKeys={["worktreesDirectory"]}
      resetAction={
        mixed || settings.worktreesDirectory !== "" ? (
          <SettingResetButton
            label={t("v2.settings.worktreeLocation")}
            onClick={() => updateSettings({ worktreesDirectory: "" })}
          />
        ) : null
      }
      control={
        <Input
          key={`${scopeKey}:${mixed}:${settings.worktreesDirectory}`}
          aria-label={t("v2.settings.worktreeLocationLabel")}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={mixed ? t("settings.label.mixed") : t("common.default")}
          defaultValue={mixed ? "" : settings.worktreesDirectory}
          onChange={() => {
            edited.current = true;
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (edited.current && (mixed || value !== settings.worktreesDirectory))
              updateSettings({ worktreesDirectory: value });
            edited.current = false;
          }}
        />
      }
    />
  );
}

function RetentionControl({
  label,
  value,
  onChange,
  minimum = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  minimum?: number;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const [savedValue, setSavedValue] = useState(value);
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(value);
  }

  return (
    <div className="flex items-center gap-3">
      {value !== null ? (
        <NumberField
          value={draft}
          min={minimum}
          max={3650}
          step={1}
          size="sm"
          className="w-auto"
          onValueChange={setDraft}
          onValueCommitted={(next) => {
            if (next === null) setDraft(value);
            else {
              const days = Math.min(3650, Math.max(minimum, Math.round(next)));
              setDraft(days);
              onChange(days);
            }
          }}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label={t("settings.storage.retentionDecrease", { label })} />
            <NumberFieldInput
              aria-label={t("settings.storage.retentionInDays", { label })}
              size={5}
              className="w-auto grow-0 text-right"
            />
            <span aria-hidden="true" className="self-center pr-2 text-xs">
              {t("settings.integrations.days")}
            </span>
            <NumberFieldIncrement aria-label={t("settings.storage.retentionIncrease", { label })} />
          </NumberFieldGroup>
        </NumberField>
      ) : (
        <span className="text-xs text-muted-foreground">{t("settings.connections.off")}</span>
      )}
      <Switch
        aria-label={label}
        checked={value !== null}
        onCheckedChange={(enabled) => onChange(enabled ? 8 : null)}
      />
    </div>
  );
}

const KEEP_WHEN_LABEL_KEYS = {
  "any-local-files": "v2.settings.anyLocalFiles",
  "uncommitted-changes": "v2.settings.uncommittedChanges",
  "tracked-changes": "v2.settings.editedTrackedFiles",
} as const;

function lastRunSummary(
  entries: readonly { readonly label: string; readonly counts: string }[],
  machineCount: number,
  t: ReturnType<typeof useI18n>["t"],
) {
  const first = entries[0];
  if (!first) return "";
  if (machineCount <= 1) return first.counts;
  if (entries.length === machineCount && entries.every((entry) => entry.counts === first.counts)) {
    return t("settings.storage.countOnEveryMachine", { counts: first.counts });
  }
  return entries.map((entry) => `${entry.label}: ${entry.counts}`).join(" · ");
}

function CleanupResults({
  report,
  environmentLabel,
}: {
  report: StorageCleanupReport;
  environmentLabel: string;
}) {
  const { t } = useI18n();
  return (
    <>
      {report.entries.map((entry, index) => {
        const name =
          entry.kind === "worktree"
            ? ((entry.threadId === null
                ? entry.path
                : entry.path?.split(/[\\/]/).findLast(Boolean)) ??
              t("settings.integrations.worktrees"))
            : entry.kind === "logs"
              ? t("v2.settings.rotatedLogs")
              : t("v2.settings.browserArtifacts");
        return (
          <SettingsRow
            key={`${entry.path ?? entry.kind}:${entry.threadId ?? index}`}
            title={<span className="wrap-anywhere select-text">{name}</span>}
            description={
              <span className="block space-y-2 wrap-anywhere select-text">
                <span className={`block ${entry.outcome === "failed" ? "text-destructive" : ""}`}>
                  {entry.reason}
                </span>
                <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-l border-border/60 pl-3">
                  <span>{t("integration.machine")}</span>
                  <span className="text-foreground/80">{environmentLabel}</span>
                  {entry.projectPath && (
                    <>
                      <span>{t("pr.project")}</span>
                      <code className="text-foreground/80">{entry.projectPath}</code>
                    </>
                  )}
                  {entry.path && (
                    <>
                      <span>{t("integration.folder")}</span>
                      <code className="text-foreground/80">{entry.path}</code>
                    </>
                  )}
                  {entry.threadTitle && (
                    <>
                      <span>{t("mobile.components.thread")}</span>
                      <span>{entry.threadTitle}</span>
                    </>
                  )}
                </span>
              </span>
            }
            control={
              (entry.outcome === "removed" ||
                (entry.outcome === "kept" && entry.bytes !== null)) && (
                <span className="text-xs text-muted-foreground">
                  {[
                    entry.kind !== "worktree" && entry.files !== null
                      ? t(
                          entry.files === 1
                            ? "settings.storage.fileCount"
                            : "settings.storage.filesCount",
                          { count: entry.files.toLocaleString() },
                        )
                      : null,
                    entry.bytes !== null ? formatBytes(entry.bytes) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )
            }
          />
        );
      })}
      {report.omittedCount > 0 && (
        <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
          {t("settings.storage.environmentMessage", {
            environment: environmentLabel,
            message: t("settings.storage.moreResults", {
              count: report.omittedCount.toLocaleString(),
            }),
          })}
        </p>
      )}
      {report.entries.length === 0 && report.omittedCount === 0 && (
        <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
          {t("settings.storage.environmentMessage", {
            environment: environmentLabel,
            message: t("v2.settings.nothingNeededCleanup"),
          })}
        </p>
      )}
    </>
  );
}

const storageCleanupReportsAtom = environmentAtomList(
  "web-storage-cleanup-reports",
  (environmentId) => serverEnvironment.storageCleanupReport({ environmentId, input: {} }),
);
const storageCleanupPermissionsAtom = environmentAtomList(
  "web-storage-cleanup-permissions",
  serverEnvironment.runStorageCleanup.permissionAtom,
);

function CleanupSection() {
  const { t } = useI18n();
  const nowMinute = useNowMinute();
  const nowMs = Date.parse(`${nowMinute}:00.000Z`);
  const { connectedEnvironments } = useSettingsScope();
  const [pending, setPending] = useState(false);
  const run = useAtomCommand(serverEnvironment.runStorageCleanup);
  const supported = connectedEnvironments.filter(
    (environment) => environment.serverConfig?.environment.capabilities.storageCleanupRun === true,
  );
  const supportedIds = supported.map(({ environmentId }) => environmentId);
  const reports = useAtomValue(storageCleanupReportsAtom(environmentIdsKey(supportedIds)));
  const permissions = useAtomValue(storageCleanupPermissionsAtom(environmentIdsKey(supportedIds)));
  const state = supportedIds.map((environmentId, index) => {
    const query = reports[index]!;
    return {
      environmentId,
      allowed: permissions[index]!,
      report: query._tag === "Success" ? query.value : null,
      loading: query.waiting,
      failed: query._tag === "Failure",
    };
  });
  const hasRules = supported.some((environment) => {
    const settings = environment.serverConfig?.settings;
    if (!settings) return false;
    const enabled = (rules: WorktreeCleanupRules) =>
      rules.worktreeAfterDays !== null ||
      rules.worktreeSettledAfterDays !== null ||
      rules.worktreeOnMerge ||
      rules.worktreeOnDelete ||
      rules.worktreeUnchanged;
    return (
      settings.storageCleanup.browserArtifactsAfterDays !== null ||
      settings.storageCleanup.logsAfterDays !== null ||
      enabled(resolveWorktreeCleanup(settings, null)) ||
      Object.values(settings.projectSettingsOverrides).some(
        (override) =>
          override.worktreeCleanup?.mode === "custom" && enabled(override.worktreeCleanup.rules),
      )
    );
  });
  if (supported.length === 0) return null;
  const summaries = supported.map((environment) => {
    const query = state.find((entry) => entry.environmentId === environment.environmentId);
    const report = query?.report ?? null;
    return {
      environment,
      report,
      label: settingsScopeEnvironmentLabel(environment, connectedEnvironments),
      counts: report
        ? report.counts.failed > 0
          ? t("settings.storage.cleanupCountsFailed", {
              removed: report.counts.removed,
              kept: report.counts.kept,
              failed: report.counts.failed,
            })
          : t("settings.storage.cleanupCounts", {
              removed: report.counts.removed,
              kept: report.counts.kept,
            })
        : "",
      description: report
        ? `${t("settings.storage.lastRunSummary", {
            when: formatRelativeTimeLabel(report.finishedAt, nowMs),
            bytes: formatBytes(report.bytesFreed),
          })}${
            report.counts.failed > 0
              ? ` ${t(
                  report.counts.failed === 1
                    ? "settings.storage.itemsCouldNotBeRemovedOne"
                    : "settings.storage.itemsCouldNotBeRemovedOther",
                  { count: report.counts.failed },
                )}`
              : ""
          }`
        : query?.failed
          ? t("v2.settings.couldNotLoadTheLastRun")
          : query?.loading
            ? t("v2.settings.loadingLastRun")
            : t("v2.settings.cleanupHasnTRunYet"),
    };
  });
  const deleteNow = async () => {
    if (pending) return;
    setPending(true);
    await Promise.all(
      supported
        .filter((environment) =>
          state.some((entry) => entry.environmentId === environment.environmentId && entry.allowed),
        )
        .map(async (environment) => {
          const result = await run({ environmentId: environment.environmentId, input: {} });
          if (result._tag === "Success") {
            const failures = result.value.entries.filter((entry) => entry.outcome === "failed");
            if (failures.length > 0)
              toastManager.add({
                type: "error",
                title: t("settings.storage.cleanupFailedOn", { environment: environment.label }),
                description: failures[0]!.reason,
              });
          } else if (!isAtomCommandInterrupted(result)) {
            toastManager.add({
              type: "error",
              title: t("settings.storage.cleanupRunFailedOn", { environment: environment.label }),
              description: String(squashAtomCommandFailure(result)),
            });
          }
        }),
    ).finally(() => setPending(false));
  };
  return (
    <SettingsSection id="storage-cleanup" title={t("v2.settings.cleanup")} variant="plain">
      <SettingsGroup>
        <SettingsRow
          {...searchableSetting("storage-delete-now", t)}
          description={
            <span>
              {!hasRules
                ? t("v2.settings.turnOnACleanupRuleToUseThis")
                : summaries.map(({ environment, label, description }) => (
                    <span key={environment.environmentId} className="block">
                      {supported.length > 1 ? `${label}: ` : ""}
                      {description}
                    </span>
                  ))}
            </span>
          }
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !hasRules || !state.some((entry) => entry.allowed)}
              onClick={() => void deleteNow()}
            >
              {pending ? t("v2.settings.deleting") : t("v2.settings.deleteNow")}
            </Button>
          }
        />
      </SettingsGroup>
      {summaries.some(({ report }) => report !== null) && (
        <FoldedSettingsSection
          id="storage-cleanup-last-run"
          title={t("v2.settings.lastRun")}
          headerPlacement="inside"
          summary={lastRunSummary(
            summaries.filter(({ report }) => report !== null),
            connectedEnvironments.length,
            t,
          )}
        >
          {summaries.map(
            ({ environment, label, report }) =>
              report && (
                <CleanupResults
                  key={environment.environmentId}
                  report={report}
                  environmentLabel={label}
                />
              ),
          )}
        </FoldedSettingsSection>
      )}
    </SettingsSection>
  );
}

function supportsStorageCleanup(
  environments: ReadonlyArray<{
    readonly serverConfig: {
      readonly environment: { readonly capabilities: { readonly storageCleanup?: boolean } };
    } | null;
  }>,
) {
  return environments.every(
    (environment) => environment.serverConfig?.environment.capabilities.storageCleanup === true,
  );
}

/** Narrows a mixed selection to the machines that support cleanup. */
function StorageCleanupScopeNotice() {
  const { t } = useI18n();
  const { connectedEnvironments } = useSettingsScope();
  return (
    <SettingsScopeNotice
      inline
      target="environment"
      eligibleEnvironmentIds={connectedEnvironments
        .filter(
          (environment) =>
            environment.serverConfig?.environment.capabilities.storageCleanup === true,
        )
        .map((environment) => environment.environmentId)}
    >
      {t(
        "settings.integrations.updateTheSelectedEnvironmentsToUseStorageCleanupOrChooseAMachineThatSupportsIt",
      )}
    </SettingsScopeNotice>
  );
}

export function WorktreeCleanupSection() {
  const { t } = useI18n();
  const { scope, environments, connectedEnvironments, targets, target } = useSettingsScope();
  const scopedSettings = useScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const settings = {
    ...scopedSettings.storageCleanup,
    ...resolveWorktreeCleanup(scopedSettings, null),
  };
  const projectMode = (entry: ScopedSettingsTarget | null) =>
    entry?.sources.worktreeCleanup === "project"
      ? (entry.settings.worktreeCleanup?.mode ?? "inherit")
      : "inherit";
  const mode = projectMode(target);
  const mixedModes = targets.some((entry) => projectMode(entry) !== mode);
  const updateSettings = useUpdateScopedSettings();
  const clearSettings = useClearScopedSettings();
  const ruleStatus = (key: keyof StorageCleanupSettings) =>
    targets.some(
      (target) =>
        ({ ...target.settings.storageCleanup, ...resolveWorktreeCleanup(target.settings, null) })[
          key
        ] !== settings[key],
    )
      ? t("settings.integrations.mixedAcrossSelectedMachines")
      : undefined;
  const update = (patch: Partial<StorageCleanupSettings>) =>
    updateSettings({ storageCleanup: patch });
  const updateWorktree = (patch: Partial<WorktreeCleanupRules>) =>
    isProjectScope
      ? updateSettings({ worktreeCleanup: { mode: "custom", rules: patch } })
      : update(patch);

  if (
    isProjectScope &&
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.projectWorktreeCleanup !== true,
    )
  ) {
    return (
      <SettingsSection id="storage-worktrees" title={t("v2.settings.cleanup")} variant="plain">
        <SettingsScopeNotice inline target="all">
          {t("settings.integrations.updateTheSelectedMachinesToConfigureProjectWorktreeCleanup")}
        </SettingsScopeNotice>
      </SettingsSection>
    );
  }
  if (!supportsStorageCleanup(connectedEnvironments)) {
    return (
      <SettingsSection id="storage-worktrees" title={t("v2.settings.cleanup")} variant="plain">
        <StorageCleanupScopeNotice />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection id="storage-worktrees" title={t("v2.settings.cleanup")}>
      <>
        {isProjectScope && (
          <SettingsRow
            title={t("settings.integrations.automaticWorktreeCleanup")}
            description={
              mode === "off"
                ? t("settings.integrations.keepThisProjectSWorktreesUntilYouDeleteThemManually")
                : mode === "custom"
                  ? t("settings.integrations.useTheseRulesForThisProject")
                  : t("settings.integrations.useEachMachineSWorktreeCleanupSettings")
            }
            serverScoped
            settingKeys={["worktreeCleanup"]}
            mixed={mixedModes}
            control={
              <Select
                value={mixedModes ? null : mode}
                onValueChange={(next) => {
                  if (next === "inherit") clearSettings(["worktreeCleanup"]);
                  else if (next === "off") updateSettings({ worktreeCleanup: { mode: "off" } });
                  else if (next === "custom")
                    updateSettings({ worktreeCleanup: { mode: "custom", rules: {} } });
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t("settings.integrations.automaticWorktreeCleanup")}
                >
                  <SelectValue>
                    {mixedModes
                      ? t("settings.label.mixed")
                      : mode === "inherit"
                        ? t("settings.misc.inherit")
                        : mode === "off"
                          ? t("settings.connections.off")
                          : t("settings.misc.custom")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="inherit">{t("settings.misc.inherit")}</SelectItem>
                  <SelectItem value="off">{t("settings.connections.off")}</SelectItem>
                  <SelectItem value="custom">{t("settings.misc.custom")}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        )}
        {(!isProjectScope || (!mixedModes && mode === "custom")) && (
          <>
            <SettingsRow
              title={t("settings.integrations.deleteWorktreesWithDeletedThreads")}
              status={ruleStatus("worktreeOnDelete")}
              description={t(
                "settings.integrations.removeUnusedWorktreesWhenActiveOrArchivedThreadsAreDeletedWorktreesWithLocalChangesAreKept",
              )}
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label={t("settings.integrations.deleteWorktreesWithDeletedThreads")}
                  checked={settings.worktreeOnDelete}
                  onCheckedChange={(worktreeOnDelete) => updateWorktree({ worktreeOnDelete })}
                />
              }
            />
            <SettingsRow
              title={t("settings.integrations.deleteMergedWorktrees")}
              status={ruleStatus("worktreeOnMerge")}
              description={t(
                "settings.integrations.removeWorktreesWhosePullRequestIsMergedAndWhoseCommitsAreIncludedInTheDefaultBranch",
              )}
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label={t("settings.integrations.deleteMergedWorktrees")}
                  checked={settings.worktreeOnMerge}
                  onCheckedChange={(worktreeOnMerge) => updateWorktree({ worktreeOnMerge })}
                />
              }
            />
            <SettingsRow
              title={t("settings.integrations.deleteInactiveWorktrees")}
              status={ruleStatus("worktreeAfterDays")}
              description={t(
                "settings.integrations.removeWorktreesAfterTheirThreadsHaveBeenInactiveForThisManyDaysBranchesAndThreadHistoryAreKept",
              )}
              serverScoped={!isProjectScope}
              control={
                <RetentionControl
                  label={t("settings.integrations.deleteInactiveWorktrees")}
                  value={settings.worktreeAfterDays}
                  onChange={(worktreeAfterDays) => updateWorktree({ worktreeAfterDays })}
                />
              }
            />
            <AdvancedSettings
              // The keep-when search result lands on this section, not its row.
              targetIds={[
                "storage-worktrees",
                searchableSetting("storage-worktree-keep-when", t).id,
              ]}
            >
              {connectedEnvironments.length > 0 &&
                connectedEnvironments.every(
                  (environment) =>
                    environment.serverConfig?.environment.capabilities.settledWorktreeCleanup ===
                    true,
                ) && (
                  <SettingsRow
                    title={t("v2.settings.deleteSettledWorktrees")}
                    status={[
                      ruleStatus("worktreeSettledAfterDays"),
                      environments.length > connectedEnvironments.length
                        ? t("v2.settings.offlineMachinesWillNotGetThisSetting")
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(". ")}
                    description={t(
                      "v2.settings.removeWorktreesThisManyDaysAfterTheirThreadSettlesSet0Days",
                    )}
                    serverScoped={!isProjectScope}
                    control={
                      <RetentionControl
                        label={t("v2.settings.deleteSettledWorktrees")}
                        value={settings.worktreeSettledAfterDays}
                        minimum={0}
                        onChange={(worktreeSettledAfterDays) =>
                          updateWorktree({ worktreeSettledAfterDays })
                        }
                      />
                    }
                  />
                )}
              <SettingsRow
                title={t("settings.integrations.deleteUnchangedWorktrees")}
                status={ruleStatus("worktreeUnchanged")}
                description={t(
                  "settings.integrations.removeWorktreesWithNoCommitsBeyondTheDefaultBranch",
                )}
                serverScoped={!isProjectScope}
                control={
                  <Switch
                    aria-label={t("settings.integrations.deleteUnchangedWorktrees")}
                    checked={settings.worktreeUnchanged}
                    onCheckedChange={(worktreeUnchanged) => updateWorktree({ worktreeUnchanged })}
                  />
                }
              />
              {connectedEnvironments.every(
                (environment) =>
                  environment.serverConfig?.environment.capabilities.storageCleanupRun === true,
              ) && (
                <SettingsRow
                  {...searchableSetting("storage-worktree-keep-when", t)}
                  status={ruleStatus("worktreeKeepWhen")}
                  description={
                    settings.worktreeKeepWhen === "any-local-files"
                      ? t("v2.settings.includesIgnoredFilesExceptNodeModules")
                      : settings.worktreeKeepWhen === "tracked-changes"
                        ? t("v2.settings.deletesUntrackedAndIgnoredFilesIncludingEnv")
                        : t(
                            "v2.settings.keepsEditsAndUntrackedFilesDeletesIgnoredFilesIncludingEnv",
                          )
                  }
                  serverScoped={!isProjectScope}
                  control={
                    <Select
                      value={ruleStatus("worktreeKeepWhen") ? null : settings.worktreeKeepWhen}
                      onValueChange={(next) => {
                        if (
                          next === "any-local-files" ||
                          next === "uncommitted-changes" ||
                          next === "tracked-changes"
                        )
                          updateWorktree({ worktreeKeepWhen: next });
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t("v2.settings.keepWorktreesWithLocalChanges")}
                      >
                        <SelectValue>
                          {ruleStatus("worktreeKeepWhen")
                            ? t("settings.label.mixed")
                            : t(KEEP_WHEN_LABEL_KEYS[settings.worktreeKeepWhen])}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup align="end" alignItemWithTrigger={false}>
                        <SelectItem value="any-local-files">
                          {t("v2.settings.anyLocalFiles")}
                        </SelectItem>
                        <SelectItem value="uncommitted-changes">
                          {t("v2.settings.uncommittedChanges")}
                        </SelectItem>
                        <SelectItem value="tracked-changes">
                          {t("v2.settings.editedTrackedFiles")}
                        </SelectItem>
                      </SelectPopup>
                    </Select>
                  }
                />
              )}
            </AdvancedSettings>
          </>
        )}
      </>
    </SettingsSection>
  );
}

/** Retention for logs and captures, and the manual cleanup run, which covers worktrees too. */
export function StorageCleanupSections() {
  const { t } = useI18n();
  const { scope, connectedEnvironments, targets } = useSettingsScope();
  const scopedSettings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const settings = scopedSettings.storageCleanup;
  const targetIdsKey = environmentIdsKey(targets.map((target) => target.environmentId).sort());
  const artifactsMixed =
    targets.length > 1 &&
    targets.some(
      (target) =>
        target.settings.storageCleanup.browserArtifactsAfterDays !==
        settings.browserArtifactsAfterDays,
    );
  const logsMixed =
    targets.length > 1 &&
    targets.some(
      (target) => target.settings.storageCleanup.logsAfterDays !== settings.logsAfterDays,
    );
  const settledArtifactsStatus = useDebouncedValue(`${targetIdsKey}:${artifactsMixed}`, 300);
  const settledLogsStatus = useDebouncedValue(`${targetIdsKey}:${logsMixed}`, 300);
  const artifactsStatus =
    targets.length > 1 && settledArtifactsStatus === `${targetIdsKey}:true`
      ? t("settings.integrations.mixedAcrossSelectedMachines")
      : undefined;
  const logsStatus =
    targets.length > 1 && settledLogsStatus === `${targetIdsKey}:true`
      ? t("settings.integrations.mixedAcrossSelectedMachines")
      : undefined;
  if (scope.kind === "project" || scope.kind === "checkout") return null;
  const update = (patch: Partial<StorageCleanupSettings>) =>
    updateSettings({ storageCleanup: patch });
  const databaseStorageNotice = (
    <DatabaseStorageNotice
      environments={connectedEnvironments.filter(
        (environment) =>
          environment.serverConfig?.environment.capabilities.databaseStorage === true,
      )}
    />
  );
  if (!supportsStorageCleanup(connectedEnvironments)) {
    return (
      <>
        {databaseStorageNotice}
        <SettingsSection
          id="storage-artifacts"
          title={t("settings.label.artifactsAndLogs")}
          variant="plain"
        >
          <StorageCleanupScopeNotice />
        </SettingsSection>
      </>
    );
  }

  return (
    <>
      {databaseStorageNotice}
      <SettingsSection id="storage-artifacts" title={t("settings.label.artifactsAndLogs")}>
        <AnimatedHeight>
          <SettingsRow
            title={t("settings.integrations.deleteOldBrowserArtifacts")}
            status={artifactsStatus}
            description={t(
              "settings.integrations.deleteSavedBrowserCapturesAfterThisManyDaysOlderCaptureLinksWillNoLongerOpen",
            )}
            serverScoped
            control={
              <RetentionControl
                label={t("settings.integrations.deleteOldBrowserArtifacts")}
                value={settings.browserArtifactsAfterDays}
                onChange={(browserArtifactsAfterDays) => update({ browserArtifactsAfterDays })}
              />
            }
          />
        </AnimatedHeight>
        <AnimatedHeight>
          <SettingsRow
            title={t("settings.integrations.deleteOldRotatedLogs")}
            status={logsStatus}
            description={t(
              "settings.integrations.deleteInactiveRotatedLogFilesAfterThisManyDaysCurrentLogsAreKept",
            )}
            serverScoped
            control={
              <RetentionControl
                label={t("settings.integrations.deleteOldRotatedLogs")}
                value={settings.logsAfterDays}
                onChange={(logsAfterDays) => update({ logsAfterDays })}
              />
            }
          />
        </AnimatedHeight>
      </SettingsSection>
      <CleanupSection />
    </>
  );
}
