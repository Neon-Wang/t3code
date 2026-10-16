import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import { DownloadIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { RelayClientInstallProgressStage } from "@t3tools/contracts";

import {
  completeRelayClientInstallDialogClose,
  readRelayClientInstallDialogState,
  respondToRelayClientInstallConfirmation,
  subscribeRelayClientInstallDialog,
} from "../../cloud/relayClientInstallDialog";
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
const installSteps: ReadonlyArray<{
  readonly stage: RelayClientInstallProgressStage;
  readonly label: string;
}> = [
  {
    stage: "checking",
    get label() {
      return i18n.t("cloud.checkingCurrentInstallation");
    },
  },
  {
    stage: "waiting_for_lock",
    get label() {
      return i18n.t("cloud.waitingForInstaller");
    },
  },
  {
    stage: "downloading",
    get label() {
      return i18n.t("cloud.downloadingRelayClient");
    },
  },
  {
    stage: "verifying",
    get label() {
      return i18n.t("cloud.verifyingDownload");
    },
  },
  {
    stage: "installing",
    get label() {
      return i18n.t("cloud.installingRelayClient");
    },
  },
  {
    stage: "validating",
    get label() {
      return i18n.t("cloud.validatingExecutable");
    },
  },
  {
    stage: "activating",
    get label() {
      return i18n.t("cloud.activatingInstallation");
    },
  },
];

export function RelayClientInstallDialog() {
  const { t } = useI18n();
  const state = useSyncExternalStore(
    subscribeRelayClientInstallDialog,
    readRelayClientInstallDialogState,
    readRelayClientInstallDialogState,
  );
  const view = state.status === "closing" ? state.view : state;
  const isConfirming = view.status === "confirming";
  const isInstalling = view.status === "installing";
  const activeStepIndex = isInstalling
    ? installSteps.findIndex(({ stage }) => stage === view.stage)
    : -1;
  const activeStep = installSteps[activeStepIndex];

  return (
    <Dialog
      open={state.status === "confirming" || state.status === "installing"}
      onOpenChange={(open) => {
        if (!open && isConfirming) {
          respondToRelayClientInstallConfirmation(false);
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          completeRelayClientInstallDialogClose();
        }
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={isConfirming}>
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60">
            <DownloadIcon aria-hidden className="size-4.5 text-muted-foreground" />
          </div>
          <DialogTitle>
            {isInstalling ? t("cloud.installingRelayClient") : t("cloud.installRelayClient")}
          </DialogTitle>
          <DialogDescription>
            {isInstalling
              ? t("cloud.t3CodeIsPreparingThisEnvironmentForSecureAccessThroughT3")
              : t("cloud.t3CodeNeedsTheRelayClientToMakeThisEnvironmentAvailable")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          {isInstalling ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p aria-live="polite" className="font-medium text-foreground">
                  {activeStep?.label}
                </p>
                <p className="shrink-0 tabular-nums text-muted-foreground">
                  {activeStepIndex + 1} {t("pr.of")} {installSteps.length}
                </p>
              </div>
              <progress
                aria-label={t("cloud.relayClientInstallationProgress")}
                className="h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                max={installSteps.length}
                value={activeStepIndex + 1}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("cloud.keepT3CodeOpenWhileTheRelayClientIsInstalled")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">{t("cloud.managedRelayClient")}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t("v2.surfaces.copy137")} {view.status === "confirming" ? view.version : ""}
                {t("v2.surfaces.copy138")}
              </p>
            </div>
          )}
        </DialogPanel>
        {isConfirming ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => respondToRelayClientInstallConfirmation(false)}
            >
              {t("action.cancel")}
            </Button>
            <Button onClick={() => respondToRelayClientInstallConfirmation(true)}>
              {t("cloud.downloadAndInstall")}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
