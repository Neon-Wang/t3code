import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { useI18n } from "../../../i18n/useI18n";
import { copyTextWithHaptic } from "../../../lib/copyTextWithHaptic";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../state/preferences";
import { serverEnvironment } from "../../../state/server";
import type { SettingsTarget } from "../settings-environment-filter";
import { SettingsActionRow } from "./SettingsActionRow";
import { SettingsSection } from "./SettingsSection";

/** Suggests `t3 doctor` on every machine whose database still holds at least 1 GiB of freed pages. */
export function DatabaseStorageNotice({
  targets,
}: {
  readonly targets: readonly SettingsTarget[];
}) {
  const { t } = useI18n();
  const recommendations = useAtomValue(
    serverEnvironment.databaseCompactionRecommendations(
      JSON.stringify(targets.map((target) => target.environmentId)),
    ),
  );
  const preferences = useAtomValue(mobilePreferencesAtom);
  const updatePreferences = useAtomSet(updateMobilePreferencesAtom);
  const dismissed = AsyncResult.isSuccess(preferences)
    ? (preferences.value.dismissedDatabaseStorageNotices ?? [])
    : [];
  const visible = recommendations.filter(
    (recommendation) => !dismissed.includes(recommendation.environmentId),
  );
  if (visible.length === 0) return null;
  return (
    <SettingsSection
      title={t("mobile.databaseStorageNotice.reclaimDatabaseSpace")}
      footer={t("mobile.databaseStorageNotice.oldHistoryIsCleanedUp")}
    >
      {visible.map(({ environmentId, status }) => (
        <SettingsActionRow
          key={environmentId}
          icon="doc.on.doc"
          label={targets.find((target) => target.environmentId === environmentId)?.label ?? ""}
          description={status.compactCommand}
          detail={`${(status.reclaimableBytes / 1024 ** 3).toFixed(1)} GiB`}
          onPress={() => copyTextWithHaptic(status.compactCommand, { target: "command" })}
        />
      ))}
      <SettingsActionRow
        icon="xmark"
        label="Dismiss"
        onPress={() =>
          updatePreferences({
            transform: (current) => ({
              dismissedDatabaseStorageNotices: [
                ...new Set([
                  ...(current.dismissedDatabaseStorageNotices ?? []),
                  ...visible.map((recommendation) => recommendation.environmentId),
                ]),
              ],
            }),
          })
        }
      />
    </SettingsSection>
  );
}
