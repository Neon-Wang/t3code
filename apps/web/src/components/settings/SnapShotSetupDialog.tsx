import { useI18n } from "~/hooks/useI18n";
import { PermissionChecklist, PermissionContinueButton } from "../permissions/PermissionChecklist";
import { usePermissionStatus } from "../permissions/usePermissionStatus";
import {
  isModifierPairShortcut,
  type DesktopSnapShotSetupAction,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { useState, type ReactNode } from "react";
import { MacAccessibilityIcon, MacScreenRecordingIcon } from "../Icons";
import { CaptureShortcutConfig } from "./CaptureShortcutConfig";
import { Button } from "../ui/button";
import { Dialog, DialogDescription } from "../ui/dialog";
import { WizardSteps, WizardPopup, WizardHeader, WizardPanel, WizardFooter } from "../ui/wizard";
import {
  captureSetupAccessReady,
  captureSetupBackend,
  captureSetupCheckMessage,
  captureSetupDesktopName,
  captureSetupInitialStep,
  captureSetupShortcutReady,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const SETUP_STEPS = [
  { id: "access", label: "settings.snapShotSetupDialog.access" },
  { id: "shortcut", label: "settings.snapShotSetupDialog.shortcut" },
] as const;

const GNOME_ACCESS_COPY = {
  "not-installed": {
    title: "settings.snapShotSetupDialog.installTheExtension",
    description: "settings.snapShotSetupDialog.theT3CodeGNOMEExtensionLetsYouCaptureOther",
  },
  "restart-required": {
    title: "settings.snapShotSetupDialog.extensionInstalled",
    description: "settings.snapShotSetupDialog.saveYourWorkThenSignOutAndBackIn",
  },
  "update-required": {
    title: "settings.snapShotSetupDialog.updateTheExtension",
    description: "settings.snapShotSetupDialog.installTheUpdateThenSignOutAndBackIn",
  },
  "extensions-disabled": {
    title: "settings.snapShotSetupDialog.allowGNOMEExtensions",
    description: "settings.snapShotSetupDialog.openGNOMEExtensionsAndTurnOnExtensionsThenCheck",
  },
  disabled: {
    title: "settings.snapShotSetupDialog.enableTheExtension",
    description: "settings.snapShotSetupDialog.enableT3CodeSnapShotsToStartCapturingWindows",
  },
  enabled: {
    title: "settings.snapShotSetupDialog.captureIsReady",
    description: "settings.snapShotSetupDialog.nextChooseYourShortcut",
  },
  unsupported: {
    title: "settings.snapShotSetupDialog.automaticCaptureIsnTAvailable",
    description: "settings.snapShotSetupDialog.useTakeSnapshotFromTheCommandPaletteToChoose",
  },
  error: {
    title: "settings.snapShotSetupDialog.couldnTSetUpTheExtension",
    description: "settings.snapShotSetupDialog.checkT3CodeSnapShotsInGNOMEExtensionsThenTry",
  },
} as const;

export function SnapShotSetupDialog({
  state,
  initialStep,
  wasEnabled,
  includeAccessibility,
  busy: actionBusy,
  error,
  shortcutInput,
  shortcutStatus,
  shortcutChanged,
  canSaveShortcut,
  onSaveShortcut,
  onEnable,
  onAction,
  onRefresh,
  onClose,
  onLeaveStep,
}: {
  state: DesktopSnapShotState;
  initialStep: CaptureSetupStep;
  wasEnabled: boolean;
  includeAccessibility: boolean;
  busy: boolean;
  error: string | null;
  shortcutInput: ReactNode;
  shortcutStatus: string | null | undefined;
  shortcutChanged: boolean;
  canSaveShortcut: boolean;
  onSaveShortcut: () => Promise<boolean>;
  onEnable: () => Promise<boolean>;
  onAction: (action: DesktopSnapShotSetupAction) => Promise<void>;
  onRefresh: () => Promise<DesktopSnapShotState | undefined>;
  onClose: (completed: boolean) => Promise<void>;
  onLeaveStep: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(() => captureSetupInitialStep(state, initialStep));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const busy = actionBusy || checking || configBusy;
  const backend = captureSetupBackend(state);
  const configShortcut = backend === "niri" || backend === "hyprland";
  const desktop = captureSetupDesktopName(state);
  const extension = state.gnomeExtension;
  const helper = backend === "hyprland" ? state.hyprlandHelper : state.kdeHelper;
  const helperBackend = backend === "kde" || backend === "hyprland";
  const installHelper = backend === "hyprland" ? "install-hyprland-helper" : "install-kde-helper";
  const removeHelper = backend === "hyprland" ? "remove-hyprland-helper" : "remove-kde-helper";
  const accessReady = captureSetupAccessReady(state);
  const permissionStatus = usePermissionStatus(
    async () => {
      const refreshed = await onRefresh();
      if (!refreshed?.macPermissions)
        throw new Error(t("settings.snapShotSetupDialog.permissionStatusUnavailable"));
      return refreshed.macPermissions;
    },
    state.macPermissions ?? { screenRecording: false, accessibility: false },
    Boolean(state.macPermissions) && step === "access" && !busy,
  );
  const macPermissions = state.macPermissions ? permissionStatus.status : undefined;
  const macPermissionsReady =
    !macPermissions ||
    permissionStatus.isReady(
      includeAccessibility ? ["screenRecording", "accessibility"] : ["screenRecording"],
    );
  const shortcutReady = captureSetupShortcutReady(state, shortcutChanged);
  const install = extension?.status === "not-installed" || extension?.status === "update-required";
  const enable = extension?.status === "disabled";
  const changeStep = (next: CaptureSetupStep) => {
    onLeaveStep();
    setChecked(false);
    setStep(next);
  };
  const checkAgain = async () => {
    if (busy) return;
    setChecking(true);
    setChecked(false);
    try {
      setChecked((await onRefresh()) !== undefined);
    } finally {
      setChecking(false);
    }
  };
  const accessCopy =
    state.message && !macPermissions
      ? {
          title: t("settings.snapShotSetupDialog.letSTryThatAgain"),
          description: t("settings.snapShotSetupDialog.couldnTCheckSnapshotsTryAgainToContinue"),
        }
      : backend === "gnome" && extension
        ? extension.status === "enabled" && !accessReady
          ? {
              title: t("settings.snapShotSetupDialog.checkCaptureAccess"),
              description: t("settings.snapShotSetupDialog.theExtensionIsnTReadyYetTryAgain"),
            }
          : {
              title: t(GNOME_ACCESS_COPY[extension.status].title),
              description: t(GNOME_ACCESS_COPY[extension.status].description),
            }
        : helperBackend
          ? helper?.status === "ready"
            ? {
                title: t("settings.snapShotSetupDialog.captureIsReady"),
                description: t("settings.snapShotSetupDialog.nextChooseYourShortcut"),
              }
            : helper?.status === "error"
              ? {
                  title: t("settings.snapShotSetupDialog.letSFixCaptureAccess"),
                  description: t(
                    "settings.snapShotSetupDialog.tryReinstallingTheCaptureHelperThenCheckAgain",
                  ),
                }
              : {
                  title:
                    helper?.status === "update-required"
                      ? t("settings.snapShotSetupDialog.updateTheCaptureHelper")
                      : t("settings.snapShotSetupDialog.allowSnapshots"),
                  description: t("settings.snapShotSetupDialog.t3CodeSCaptureHelperLetsYouCapture"),
                }
          : backend === "niri"
            ? {
                title: t("settings.snapShotSetupDialog.captureIsReady"),
                description: t("settings.snapShotSetupDialog.nextChooseYourShortcut"),
              }
            : backend === "picker"
              ? {
                  title: t("settings.snapShotSetupDialog.chooseAWindowEachTime"),
                  description: t(
                    "settings.snapShotSetupDialog.yourDesktopDoesnTSupportAutomaticCaptureYou",
                  ),
                }
              : {
                  title: t("settings.snapShotSetupDialog.allowSnapshots"),
                  description:
                    backend === "portal"
                      ? t("settings.snapShotSetupDialog.yourDesktopMayAskForPermissionWhenYou")
                      : macPermissions
                        ? macPermissionsReady
                          ? t("settings.snapShotSetupDialog.testASnapshotOfTheCurrentWindowIf")
                          : t("settings.snapShotSetupDialog.allowEachPermissionThenContinue")
                        : t(
                            "settings.snapShotSetupDialog.allowAccessWhenPromptedToStartCapturingWindows",
                          ),
                };
  const title =
    step === "access" ? accessCopy.title : t("settings.snapShotSetupDialog.chooseYourShortcut");
  const description =
    step === "access"
      ? accessCopy.description
      : configShortcut
        ? t("settings.snapShotSetupDialog.clickTheShortcutThenPressTheKeysYou")
        : state.mode === "portal"
          ? t("settings.snapShotSetupDialog.chooseYourKeysThenApproveThePermissionPrompt")
          : t("settings.snapShotSetupDialog.useBothShiftKeysOrRecordADifferent");
  const stepIndex = SETUP_STEPS.findIndex(({ id }) => id === step);
  const details = [
    ...new Set(
      [
        error,
        ...(step === "access"
          ? [
              state.message,
              backend === "gnome" &&
              (extension?.status === "error" || extension?.status === "unsupported")
                ? extension.message
                : null,
              helperBackend && helper?.status === "error" ? helper.message : null,
            ]
          : []),
      ].filter((detail) => detail !== null),
    ),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void onClose(false);
      }}
    >
      <WizardPopup showCloseButton={!busy}>
        <WizardHeader
          title={
            desktop
              ? t("settings.snapShotSetupDialog.setUpSnapshotsForDesktop", { desktop: desktop })
              : t("settings.snapShotSetupDialog.setUpSnapshots")
          }
        >
          <WizardSteps
            steps={SETUP_STEPS.map((item) => t(item.label))}
            currentStep={stepIndex}
            isStepDisabled={(index) => busy || index > stepIndex}
            onStepChange={(index) => {
              const next = SETUP_STEPS[index];
              if (next && next.id !== step) changeStep(next.id);
            }}
          />
        </WizardHeader>
        <WizardPanel>
          <div className="space-y-4 text-sm">
            <div className="space-y-2" aria-live="polite">
              <h3 className="flex items-center gap-2 font-medium">{title}</h3>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {step === "access" ? (
              <>
                <p
                  role="status"
                  aria-atomic="true"
                  className={
                    checked && !busy && !error ? "text-xs text-muted-foreground" : "sr-only"
                  }
                >
                  {checked && !busy && !error ? captureSetupCheckMessage(state, t) : null}
                </p>
                {macPermissions ? (
                  <PermissionChecklist
                    busy={busy}
                    permissions={[
                      {
                        id: "screenRecording",
                        icon: <MacScreenRecordingIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: t("settings.snapShotSetupDialog.screenRecording"),
                        description: t("settings.snapShotSetupDialog.captureTheWindowYouReUsing"),
                        granted: macPermissions.screenRecording,
                        onAllow: () => void onAction("allow-screen-recording"),
                      },
                      {
                        id: "accessibility",
                        icon: <MacAccessibilityIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: t("settings.snapShotSetupDialog.accessibility"),
                        description: includeAccessibility
                          ? t(
                              "settings.snapShotSetupDialog.includeTextAndControlsFromTheCapturedApp",
                            )
                          : t(
                              "settings.snapShotSetupDialog.optionalIncludeTextAndControlsFromTheCaptured",
                            ),
                        granted: macPermissions.accessibility,
                        onAllow: () => void onAction("allow-accessibility"),
                      },
                    ]}
                  />
                ) : null}
                {permissionStatus.error && macPermissions ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {permissionStatus.error}
                  </p>
                ) : null}
                {helperBackend && helper?.status === "error" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onAction(installHelper)}
                  >
                    {t("settings.snapShotSetupDialog.reinstallHelper")}
                  </Button>
                ) : null}
              </>
            ) : configShortcut ? (
              <CaptureShortcutConfig
                state={state}
                disabled={actionBusy || checking || !accessReady}
                onBusyChange={setConfigBusy}
                onSaved={onRefresh}
                onComplete={() => onClose(true)}
              />
            ) : (
              <div className="space-y-3">
                {shortcutInput}
                {shortcutStatus ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {shortcutStatus}
                  </p>
                ) : null}
                {!shortcutChanged &&
                !state.shortcutRegistered &&
                !state.shortcutPending &&
                state.shortcutCanRetry !== false &&
                !isModifierPairShortcut(state.shortcut) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onAction("retry-shortcut")}
                  >
                    {state.mode === "portal"
                      ? t("settings.snapShotSettings.shortcutPermissions")
                      : t("settings.snapShotSetupDialog.tryAgain")}
                  </Button>
                ) : null}
              </div>
            )}
            {step === "shortcut" && !accessReady ? (
              <p role="alert" className="text-destructive">
                {t("settings.snapShotSetupDialog.captureNeedsAttentionGoBackToCheckAccess")}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive">
                {t("settings.snapShotSetupDialog.couldnTFinishThisStepTryAgainOr")}
              </p>
            ) : null}
            {details.length > 0 || (step === "access" && (backend === "gnome" || helperBackend)) ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("settings.label.advanced")}</summary>
                <div className="mt-3 space-y-3">
                  {details.map((detail) => (
                    <p key={detail} className="break-words">
                      {detail}
                    </p>
                  ))}
                  {step === "access" && (backend === "gnome" || helperBackend) ? (
                    <p>{t("settings.snapShotSetupDialog.includedWithT3CodeNoDownloadNeeded")}</p>
                  ) : null}
                  {step === "access" && backend === "gnome" && extension?.status === "enabled" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction("disable-extension")}
                    >
                      {t("settings.snapShotSetupDialog.disableExtension")}
                    </Button>
                  ) : null}
                  {step === "access" && helperBackend && helper?.status !== "not-installed" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction(removeHelper)}
                    >
                      {t("settings.snapShotSetupDialog.removeCaptureHelper")}
                    </Button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </WizardPanel>
        <WizardFooter>
          {step !== "access" ? (
            <Button variant="ghost" disabled={busy} onClick={() => changeStep("access")}>
              {t("sidebar.back")}
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={() => void onClose(false)}>
            {wasEnabled ? t("action.close") : t("settings.snapShotSetupDialog.finishLater")}
          </Button>
          {step === "access" ? (
            helperBackend && !accessReady && helper?.status !== "ready" ? (
              <Button
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void (helper?.status === "error" ? checkAgain() : onAction(installHelper))
                }
              >
                {checking
                  ? t("settings.label.checking")
                  : busy
                    ? t("settings.snapShotSetupDialog.installing")
                    : helper?.status === "error"
                      ? t("prList.checkAgain")
                      : helper?.status === "update-required"
                        ? t("settings.snapShotSetupDialog.updateHelper")
                        : t("settings.snapShotSetupDialog.installHelper")}
              </Button>
            ) : backend === "gnome" && !accessReady && extension?.status !== "enabled" ? (
              <Button
                disabled={busy}
                aria-busy={checking}
                onClick={() =>
                  void (install
                    ? onAction("install-extension")
                    : enable
                      ? onAction("enable-extension")
                      : checkAgain())
                }
              >
                {checking
                  ? t("settings.label.checking")
                  : busy
                    ? install
                      ? t("settings.snapShotSetupDialog.installing")
                      : enable
                        ? t("settings.snapShotSetupDialog.enabling")
                        : t("settings.snapShotSetupDialog.working")
                    : install
                      ? extension?.status === "update-required"
                        ? t("settings.snapShotSetupDialog.updateExtension")
                        : t("settings.snapShotSetupDialog.installExtension")
                      : enable
                        ? t("settings.snapShotSetupDialog.enableExtension")
                        : t("prList.checkAgain")}
              </Button>
            ) : (
              <PermissionContinueButton
                ready={macPermissionsReady}
                busy={busy}
                onClick={async () => {
                  if (await onEnable()) changeStep("shortcut");
                }}
              >
                {busy
                  ? t("settings.snapShotSetupDialog.working")
                  : macPermissions
                    ? t("settings.snapShotSetupDialog.testCaptureAndContinue")
                    : backend === "direct"
                      ? t("settings.snapShotSetupDialog.allowCapture")
                      : !accessReady && !macPermissions
                        ? t("settings.snapShotSetupDialog.tryAgain")
                        : t("action.continue")}
              </PermissionContinueButton>
            )
          ) : !configShortcut ? (
            <Button
              disabled={
                busy || !accessReady || (shortcutChanged ? !canSaveShortcut : !shortcutReady)
              }
              onClick={async () => {
                if (!shortcutChanged || (await onSaveShortcut())) await onClose(true);
              }}
            >
              {busy
                ? t("common.saving")
                : shortcutChanged
                  ? t("settings.snapShotSetupDialog.saveAndFinish")
                  : t("action.done")}
            </Button>
          ) : null}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
