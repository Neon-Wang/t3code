import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";

import {
  useClientSettings,
  useClientSettingsHydrated,
  useUpdateClientSettings,
} from "~/hooks/useSettings";
import type { EnvironmentPresentation } from "~/state/environments";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { searchableSetting } from "./settingsSearch";

const preferences = [
  { value: 100, labelKey: "settings.providers.prefer" },
  { value: 50, labelKey: "settings.providers.normal" },
  { value: 25, labelKey: "settings.providers.lessOften" },
  { value: 0, labelKey: "settings.providers.manualOnly" },
] as const;

type LoadPreference = (typeof preferences)[number]["value"];

/** Snaps a saved weight (older builds stored a slider value) onto the four preferences. */
export function loadPreferenceForWeight(weight: number | undefined): LoadPreference {
  if (weight === undefined || weight === 50) return 50;
  if (weight === 0) return 0;
  return weight < 50 ? 25 : 100;
}

function preferenceLabel(preference: LoadPreference, t = i18n.t): string {
  return t(preferences.find((entry) => entry.value === preference)!.labelKey);
}

/**
 * Closed-header summary: the machines not at Normal, so the folded section
 * still tells you what is set. Null when every machine is at the default.
 */
export function summarizeLoadPreferences(
  environments: ReadonlyArray<Pick<EnvironmentPresentation, "environmentId" | "label">>,
  weights: Readonly<Record<string, number>>,
  t = i18n.t,
): string | null {
  const parts = environments.flatMap((environment) => {
    const preference = loadPreferenceForWeight(weights[environment.environmentId]);
    return preference === 50
      ? []
      : [`${environment.label} ${preferenceLabel(preference, t).toLowerCase()}`];
  });
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Folded section under the environments list. Its switch turns balancing on
 * for this client, and the body holds one row per switched-on machine with
 * how often that machine should receive new threads. Rendered only when two
 * or more machines are on, since one machine has nothing to balance against.
 */
export function LoadBalancingSettings({
  environments,
}: {
  environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const { t } = useI18n();
  const settings = useClientSettings();
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdateClientSettings();

  if (environments.length < 2) return null;

  const { id, title } = searchableSetting("load-balancing", t);
  return (
    <FoldedSettingsSection
      id={id}
      title={title}
      summary={
        settings.loadBalancingEnabled
          ? summarizeLoadPreferences(environments, settings.loadBalancingWeights, t)
          : t("settings.providers.loadOff")
      }
      control={
        <Switch
          aria-label={t("settings.providers.balanceLoad")}
          checked={settings.loadBalancingEnabled}
          disabled={!settingsHydrated}
          onCheckedChange={(loadBalancingEnabled) => updateSettings({ loadBalancingEnabled })}
        />
      }
    >
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        {t("settings.providers.balanceHelp")}
      </p>
      {environments.map((environment) => (
        <EnvironmentRow
          key={environment.environmentId}
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          label={environment.label}
          subtitle={environmentTransportLabel(environment)}
        >
          <Select
            items={preferences.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
            value={loadPreferenceForWeight(
              settings.loadBalancingWeights[environment.environmentId],
            )}
            disabled={!settingsHydrated || !settings.loadBalancingEnabled}
            onValueChange={(value) => {
              if (value === null) return;
              updateSettings({
                loadBalancingWeights: {
                  ...settings.loadBalancingWeights,
                  [environment.environmentId]: value,
                },
              });
            }}
          >
            <SelectTrigger
              size="xs"
              className="w-32"
              aria-label={t("settings.providers.loadPreference", {
                environment: environment.label,
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {preferences.map(({ value, labelKey }) => (
                <SelectItem key={value} value={value}>
                  {t(labelKey)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EnvironmentRow>
      ))}
    </FoldedSettingsSection>
  );
}
