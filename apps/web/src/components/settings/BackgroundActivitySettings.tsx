import { useScopedSettingsWriteAllowed } from "./useScopedSettings";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { type BackgroundActivityProfile } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { resolveServerBackgroundActivitySettings } from "@t3tools/shared/backgroundActivitySettings";
import * as Duration from "effect/Duration";
import * as Equal from "effect/Equal";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  backgroundActivityOverrideSettings,
  backgroundActivitySharedPolicySettings,
  durationToSeconds,
  normalizeIntervalSeconds,
  PROVIDER_HEALTH_INTERVAL_STEP_SECONDS,
  resolveBackgroundActivityProfileOption,
} from "./SettingsPanels.logic";
import { PolicyTooltip, SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useI18n } from "../../hooks/useI18n";
import type { MessageKey } from "@t3tools/shared/i18n";
import { i18n } from "@t3tools/shared/i18n";

const BACKGROUND_ACTIVITY_PROFILE_LABELS: Record<BackgroundActivityProfile, string> = {
  get balanced() {
    return i18n.t("settings.label.balanced");
  },
  get performance() {
    return i18n.t("settings.label.performance");
  },
  get "battery-saver"() {
    return i18n.t("settings.label.batterySaver");
  },
};

type BackgroundActivityProfileOption = BackgroundActivityProfile | "advanced";

const BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS: Record<BackgroundActivityProfileOption, string> = {
  get balanced() {
    return BACKGROUND_ACTIVITY_PROFILE_LABELS.balanced;
  },
  get performance() {
    return BACKGROUND_ACTIVITY_PROFILE_LABELS.performance;
  },
  get "battery-saver"() {
    return BACKGROUND_ACTIVITY_PROFILE_LABELS["battery-saver"];
  },
  get advanced() {
    return i18n.t("settings.label.advanced");
  },
};

const BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS: Record<BackgroundActivityProfile, string> = {
  get balanced() {
    return i18n.t("settings.label.pausesProbesForIdleClientsLockedHostsOrLow");
  },
  get performance() {
    return i18n.t(
      "settings.description.allowsScopedBackgroundProbesWhileAnySubscribedClientRemains",
    );
  },
  get "battery-saver"() {
    return i18n.t("settings.label.alsoPausesBackgroundProbesWhenTheHostOrClient");
  },
};

const advancedBackgroundActivityDescription = () => i18n.t("v2.settings.customIntervals");

const BACKGROUND_ACTIVITY_BOOLEAN_OVERRIDES: ReadonlyArray<{
  readonly key:
    | "pauseWhenHostLocked"
    | "pauseWhenHostLowPower"
    | "pauseWhenClientLowPower"
    | "pauseWhenOnBattery";
  readonly label: MessageKey;
}> = [
  { key: "pauseWhenHostLocked", label: "settings.label.pauseWhenHostIsLocked" },
  { key: "pauseWhenHostLowPower", label: "settings.label.pauseOnHostLowPower" },
  { key: "pauseWhenClientLowPower", label: "settings.label.pauseOnClientLowPower" },
  { key: "pauseWhenOnBattery", label: "settings.label.pauseOnBattery" },
];

function resetBackgroundActivitySettings() {
  return {
    backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
  };
}

function backgroundActivityProfileSettings(profile: BackgroundActivityProfile) {
  return {
    backgroundActivity: {
      schemaVersion: 1 as const,
      profile,
      overrides: {},
    },
  };
}

function BackgroundActivityAdvancedDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const canWriteSettings = useScopedSettingsWriteAllowed();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const activeProfile = resolvedBackgroundActivity.profile;
  const automaticGitFetchIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.automaticGitFetchInterval,
  );
  const providerHealthRefreshIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.providerHealthRefreshInterval,
  );
  const hostPowerMonitorActiveIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.hostPowerMonitorActiveInterval,
  );
  const hostPowerMonitorIdleIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.hostPowerMonitorIdleInterval,
  );

  return (
    <Dialog open={open && canWriteSettings} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("settings.background.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.label.tuneTheSharedPowerPolicyAndTheBackgroundIntervals")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <fieldset
            disabled={!canWriteSettings}
            className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground"
          >
            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">{t("settings.label.sharedPolicy")}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("settings.label.controlsWhetherBackgroundWorkMayRunAfterASubscribed")}
                </p>
              </div>
              <Select
                value={activeProfile}
                onValueChange={(value) => {
                  if (
                    value === "balanced" ||
                    value === "performance" ||
                    value === "battery-saver"
                  ) {
                    updateSettings({
                      backgroundActivity: backgroundActivitySharedPolicySettings(settings, value),
                    });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={t("settings.label.sharedBackgroundPolicy")}
                >
                  <SelectValue>{BACKGROUND_ACTIVITY_PROFILE_LABELS[activeProfile]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="balanced">
                    {BACKGROUND_ACTIVITY_PROFILE_LABELS.balanced}
                  </SelectItem>
                  <SelectItem hideIndicator value="performance">
                    {BACKGROUND_ACTIVITY_PROFILE_LABELS.performance}
                  </SelectItem>
                  <SelectItem hideIndicator value="battery-saver">
                    {BACKGROUND_ACTIVITY_PROFILE_LABELS["battery-saver"]}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>

            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {searchableSetting("git-fetch-interval").title}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("settings.label.refreshRemoteBranchStatusInTheBackground")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={automaticGitFetchIntervalSeconds}
                  min={0}
                  step={5}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          automaticGitFetchInterval: Duration.seconds(
                            normalizeIntervalSeconds(value),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t("settings.label.decreaseGitFetchInterval")}
                    />
                    <NumberFieldInput aria-label={t("settings.label.gitFetchIntervalInSeconds")} />
                    <NumberFieldIncrement
                      aria-label={t("settings.label.increaseGitFetchInterval")}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">{t("settings.label.seconds")}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {t("settings.label.providerHealthInterval")}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "v2.settings.refreshProviderAvailabilityVersionsAndAuthStateModelCatalogUpdatesFollowProvider",
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={providerHealthRefreshIntervalSeconds}
                  min={0}
                  step={PROVIDER_HEALTH_INTERVAL_STEP_SECONDS}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          providerHealthRefreshInterval: Duration.seconds(
                            normalizeIntervalSeconds(value),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t("settings.label.decreaseProviderHealthInterval")}
                    />
                    <NumberFieldInput
                      aria-label={t("settings.label.providerHealthIntervalInSeconds")}
                    />
                    <NumberFieldIncrement
                      aria-label={t("settings.label.increaseProviderHealthInterval")}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">{t("settings.label.seconds")}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">{t("settings.label.hostPowerMonitor")}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("settings.label.pollHostPowerStateWhileClientsAreActive")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={hostPowerMonitorActiveIntervalSeconds}
                  min={5}
                  step={5}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          hostPowerMonitorActiveInterval: Duration.seconds(
                            normalizeIntervalSeconds(value, 5),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t("settings.label.decreaseActiveHostPowerInterval")}
                    />
                    <NumberFieldInput
                      aria-label={t("settings.label.activeHostPowerIntervalInSeconds")}
                    />
                    <NumberFieldIncrement
                      aria-label={t("settings.label.increaseActiveHostPowerInterval")}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">{t("settings.label.seconds")}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">{t("settings.label.idleHostMonitor")}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("settings.label.pollHostPowerStateWhenNoForegroundClientIs")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NumberField
                  value={hostPowerMonitorIdleIntervalSeconds}
                  min={5}
                  step={30}
                  size="sm"
                  className="w-32"
                  onValueChange={(value) =>
                    updateSettings(
                      backgroundActivityOverrideSettings(
                        settings.backgroundActivity,
                        resolvedBackgroundActivity,
                        {
                          hostPowerMonitorIdleInterval: Duration.seconds(
                            normalizeIntervalSeconds(value, 5),
                          ),
                        },
                      ),
                    )
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement
                      aria-label={t("settings.label.decreaseIdleHostPowerInterval")}
                    />
                    <NumberFieldInput
                      aria-label={t("settings.label.idleHostPowerIntervalInSeconds")}
                    />
                    <NumberFieldIncrement
                      aria-label={t("settings.label.increaseIdleHostPowerInterval")}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <span className="text-xs text-muted-foreground">{t("settings.label.seconds")}</span>
              </div>
            </div>

            <div className="grid gap-0 border-t sm:grid-cols-2">
              {BACKGROUND_ACTIVITY_BOOLEAN_OVERRIDES.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 sm:border-r sm:even:border-r-0"
                >
                  <span className="text-sm font-medium">{label}</span>
                  <Switch
                    checked={resolvedBackgroundActivity[key]}
                    onCheckedChange={(checked) =>
                      updateSettings(
                        backgroundActivityOverrideSettings(
                          settings.backgroundActivity,
                          resolvedBackgroundActivity,
                          {
                            [key]: Boolean(checked),
                          },
                        ),
                      )
                    }
                    aria-label={label}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!canWriteSettings}
            onClick={() => updateSettings(resetBackgroundActivitySettings())}
          >
            {t("settings.misc.resetAll")}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t("action.done")}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function BackgroundActivitySettingsRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { scope, environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const isEnvironmentScope = scope.environmentIds.length === 1 && environmentId !== null;
  const [backgroundActivityDialogOpen, setBackgroundActivityDialogOpen] = useState(false);
  const mixedBackgroundActivity = useScopedSettingsMixed(["backgroundActivity"]);
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const activeBackgroundActivityProfile = resolvedBackgroundActivity.profile;
  const backgroundActivityProfileOption = resolveBackgroundActivityProfileOption(settings);
  const backgroundActivityDescription =
    backgroundActivityProfileOption === "advanced"
      ? `${advancedBackgroundActivityDescription()} Shared policy: ${
          BACKGROUND_ACTIVITY_PROFILE_LABELS[activeBackgroundActivityProfile]
        }.`
      : BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS[resolvedBackgroundActivity.profile];
  const canResetBackgroundActivity = !Equal.equals(
    settings.backgroundActivity,
    DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
  );

  return (
    <SettingsRow
      serverScoped
      settingKeys={["backgroundActivity"]}
      id={searchableSetting("background-activity").id}
      title={
        <span className="inline-flex items-center gap-1.5">
          {searchableSetting("background-activity").title}
          <PolicyTooltip>
            {t("settings.description.thisSharedPolicyGatesBackgroundWorkSuchAsGit")}
          </PolicyTooltip>
        </span>
      }
      description={backgroundActivityDescription}
      resetAction={
        canResetBackgroundActivity ? (
          <SettingResetButton
            label={t("v2.settings.backgroundActivity")}
            onClick={() => updateSettings(resetBackgroundActivitySettings())}
          />
        ) : null
      }
      control={
        <>
          <Select
            value={mixedBackgroundActivity ? null : backgroundActivityProfileOption}
            onValueChange={(value) => {
              if (value === "advanced") {
                if (isEnvironmentScope) setBackgroundActivityDialogOpen(true);
                return;
              }
              if (value === "balanced" || value === "performance" || value === "battery-saver") {
                updateSettings(backgroundActivityProfileSettings(value));
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-40"
              aria-label={t("settings.label.backgroundActivityProfile")}
            >
              <SelectValue>
                {(value: BackgroundActivityProfileOption | null) =>
                  value === null ? "Mixed" : BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS[value]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="balanced">
                {BACKGROUND_ACTIVITY_PROFILE_LABELS.balanced}
              </SelectItem>
              <SelectItem hideIndicator value="performance">
                {BACKGROUND_ACTIVITY_PROFILE_LABELS.performance}
              </SelectItem>
              <SelectItem hideIndicator value="battery-saver">
                {BACKGROUND_ACTIVITY_PROFILE_LABELS["battery-saver"]}
              </SelectItem>
              <SelectItem hideIndicator value="advanced" disabled={!isEnvironmentScope}>
                {isEnvironmentScope
                  ? BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.advanced
                  : t("v2.settings.labelOneEnvironment", {
                      label: BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.advanced,
                    })}
              </SelectItem>
            </SelectPopup>
          </Select>
          {backgroundActivityProfileOption === "advanced" && isEnvironmentScope ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t("settings.label.configureAdvancedBackgroundActivity")}
                    onClick={() => setBackgroundActivityDialogOpen(true)}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                }
              />
              <TooltipPopup side="top">
                {t("settings.label.configureBackgroundActivity")}
              </TooltipPopup>
            </Tooltip>
          ) : null}
          <BackgroundActivityAdvancedDialog
            open={backgroundActivityDialogOpen && isEnvironmentScope}
            onOpenChange={setBackgroundActivityDialogOpen}
          />
        </>
      }
    />
  );
}
