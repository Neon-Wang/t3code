import { useAtom, useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { useI18n } from "../../i18n/useI18n";
import * as Dialog from "../../components/ui/Dialog";
import {
  describeOutdatedServer,
  serverEnvironment,
  updateOutdatedServer,
} from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ListActionRow as SettingsActionRow } from "../../components/ui/ListActionRow";
import { SettingsSection } from "./components/SettingsSection";
import {
  environmentReleaseCheckAtom,
  releaseCheckError,
  releaseCheckValue,
} from "./environmentUpdateCheck";

export function OutdatedServerUpdateSection({
  environmentId,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}) {
  const { t } = useI18n();
  const describe = useAtomCommand(describeOutdatedServer, { reportFailure: false });
  const update = useAtomCommand(updateOutdatedServer, { reportFailure: false });
  const state = useAtomValue(serverEnvironment.updateStateAtom(environmentId));
  const [checkResult, startCheck] = useAtom(environmentReleaseCheckAtom(environmentId));
  const release = releaseCheckValue(checkResult);
  const checking = checkResult.waiting;
  // Starting an update replaces a failed check's message with the update's own state.
  const [checkErrorDismissed, setCheckErrorDismissed] = useState(false);
  const error = checkErrorDismissed ? null : releaseCheckError(checkResult);
  const busy = checking || state.status === "running";

  function check() {
    if (busy) return;
    setCheckErrorDismissed(false);
    startCheck(async () => {
      const description = await describe(environmentId);
      if (AsyncResult.isFailure(description)) throw squashAtomCommandFailure(description);
      return description.value.serverVersion;
    });
  }

  function requestUpdate() {
    const targetVersion = release?.targetVersion;
    if (busy || !release || !targetVersion) return;
    Dialog.alert(
      t("mobile.outdatedServerUpdateSection.updateLabel", { label }),
      t("mobile.outdatedServerUpdateSection.installT3CodeVersion", { version: targetVersion }),
      [
        { text: t("action.cancel"), style: "cancel" },
        {
          text: t("mobile.settings.update"),
          onPress: () => {
            setCheckErrorDismissed(true);
            void update({
              environmentId,
              input: { targetVersion },
              fromVersion: release.fromVersion,
            });
          },
        },
      ],
    );
  }

  return (
    <SettingsSection title="T3 Code">
      <View className="gap-1 p-4">
        <Text className="text-base text-foreground">
          {release
            ? t("mobile.SettingsAboutRouteScreen.version", { version: release.fromVersion })
            : t("settings.providers.updateRequired")}
        </Text>
        <Text className="text-sm text-foreground-muted">
          {state.status === "running"
            ? state.stage === "resuming"
              ? t("mobile.outdatedServerUpdateSection.restartingAndReconnecting")
              : state.stage === "installing"
                ? t("mobile.outdatedServerUpdateSection.installingUpdate")
                : t("mobile.outdatedServerUpdateSection.downloadingUpdate")
            : release
              ? release.targetVersion
                ? t("mobile.outdatedServerUpdateSection.versionVersionIsAvailable", {
                    version: release.targetVersion,
                  })
                : t("mobile.outdatedServerUpdateSection.noNewerVersionIsAvailableYet")
              : t("mobile.outdatedServerUpdateSection.thisAppNeedsANewerVersion")}
        </Text>
        {error || state.status === "failed" ? (
          <Text selectable accessibilityRole="alert" className="text-sm text-danger-foreground">
            {error ?? (state.status === "failed" ? state.message : null)}
          </Text>
        ) : null}
      </View>
      <SettingsActionRow
        icon="arrow.clockwise"
        label={t("mobile.settings.checkForUpdates")}
        disabled={busy}
        loading={checking}
        onPress={check}
      />
      {release?.targetVersion ? (
        <SettingsActionRow
          icon="arrow.up.circle"
          label={
            state.status === "failed"
              ? t("settings.connections.retryUpdate")
              : t("mobile.SettingsEnvironmentDetailRouteScreen.updateTo", {
                  version: release.targetVersion,
                })
          }
          disabled={busy}
          loading={state.status === "running"}
          onPress={requestUpdate}
        />
      ) : null}
    </SettingsSection>
  );
}
