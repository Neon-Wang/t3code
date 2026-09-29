import { useI18n } from "../../hooks/useI18n";
import { useState } from "react";

import { isLocalEnvironmentDisabled } from "../../localEnvironment";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

// Toggling relaunches the desktop app, so the switch only reflects the value
// this process started with; there is no live state to keep in sync.
export function LocalEnvironmentSetting() {
  const { t } = useI18n();
  const setEnabled = window.desktopBridge?.setLocalEnvironmentEnabled;
  const [enabled] = useState(() => !isLocalEnvironmentDisabled());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!setEnabled) return null;

  const applyChange = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      await setEnabled(!enabled);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("settings.connections.couldnTChangeThisSetting"),
      );
      setIsUpdating(false);
    }
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("local-environment", t)}
        description={
          enabled
            ? t(
                "settings.connections.runAgentsOnThisComputerTurnOffToUseT3CodeOnlyWithRemoteEnvironments",
              )
            : t("settings.connections.turnedOffAgentsOnlyRunInRemoteEnvironments")
        }
        control={
          <Switch
            checked={enabled}
            disabled={isUpdating}
            onCheckedChange={() => setConfirmOpen(true)}
            aria-label={t("settings.connections.localEnvironment")}
          />
        }
      />
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isUpdating) return;
          setConfirmOpen(open);
          if (!open) setError(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {enabled
                ? t("settings.connections.turnOffLocalEnvironment")
                : t("settings.connections.turnOnLocalEnvironment")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {enabled
                ? t(
                    "settings.connections.t3CodeWillRestartWithoutRunningAServerOnThisComputerAnyAgentsAndTerminalsRunningHereWillStopAndOtherDevicesWillNoLongerBeAbleToConnectToThisComputerYourProjectsHistoryAndRemoteEnvironmentsAreUnaffected",
                  )
                : t(
                    "settings.connections.t3CodeWillRestartAndStartRunningAServerOnThisComputerAgain",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="px-6 pb-4 text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogClose disabled={isUpdating} render={<Button variant="outline" />}>
              {t("action.cancel")}
            </AlertDialogClose>
            <Button
              variant={enabled ? "destructive" : "default"}
              disabled={isUpdating}
              onClick={() => void applyChange()}
            >
              {isUpdating ? (
                <>
                  <Spinner size="sm" />
                  {t("settings.connections.restarting")}
                </>
              ) : enabled ? (
                t("settings.connections.restartAndTurnOff")
              ) : (
                t("settings.connections.restartAndTurnOn")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
