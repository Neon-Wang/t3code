import { useI18n } from "../../hooks/useI18n";
import type { StorageCleanupSettings, WorktreeCleanupRules } from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { useState } from "react";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import type { ScopedSettingsTarget } from "./scopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  useClearScopedSettings,
  useScopedSettings,
  useUpdateScopedSettings,
} from "./useScopedSettings";

function RetentionControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
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
          min={1}
          max={3650}
          step={1}
          size="sm"
          className="w-auto"
          onValueChange={setDraft}
          onValueCommitted={(next) => {
            if (next === null) setDraft(value);
            else {
              const days = Math.min(3650, Math.max(1, Math.round(next)));
              setDraft(days);
              onChange(days);
            }
          }}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement
              aria-label={t("settings.integrations.decreaseValue", { arg0: label })}
            />
            <NumberFieldInput
              aria-label={t("settings.integrations.valueInDays", { arg0: label })}
              size={new Intl.NumberFormat().format(draft ?? value).length}
              className="field-sizing-content w-auto min-w-[1ch] grow-0 text-right"
            />
            <span aria-hidden="true" className="self-center pr-2 text-xs">
              {t("settings.integrations.days")}
            </span>
            <NumberFieldIncrement
              aria-label={t("settings.integrations.increaseValue", { arg0: label })}
            />
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

export function StorageSettingsPanel() {
  const { t } = useI18n();
  const { scope, connectedEnvironments, targets, target } = useSettingsScope();
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
      <SettingsScopeNotice target="all">
        {t("settings.integrations.updateTheSelectedMachinesToConfigureProjectWorktreeCleanup")}
      </SettingsScopeNotice>
    );
  }

  if (
    connectedEnvironments.some(
      (environment) => environment.serverConfig?.environment.capabilities.storageCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice
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

  return (
    <SettingsPageContainer>
      <SettingsSection id="storage-worktrees" title={t("settings.integrations.worktrees")}>
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
          </>
        )}
      </SettingsSection>

      {!isProjectScope && (
        <SettingsSection id="storage-artifacts" title={t("settings.label.artifactsAndLogs")}>
          <SettingsRow
            title={t("settings.integrations.deleteOldBrowserArtifacts")}
            status={ruleStatus("browserArtifactsAfterDays")}
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
          <SettingsRow
            title={t("settings.integrations.deleteOldRotatedLogs")}
            status={ruleStatus("logsAfterDays")}
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
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
