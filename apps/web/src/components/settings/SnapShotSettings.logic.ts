import { i18n } from "@t3tools/shared/i18n";
import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(state: DesktopSnapShotState | null, enabled: boolean): string {
  if (!state) return i18n.t("settings.snapShotSettings.checkingSnapshots");
  if (state.mode === "unavailable")
    return state.message ?? i18n.t("settings.snapShotSettings.notSupportedOnThisPlatform");
  if (!enabled) return i18n.t("settings.snapShotSettings.turnThisOnToSetUpSnapshots");
  return snapShotSetupSummary(state, enabled);
}

export function snapShotSetupSummary(state: DesktopSnapShotState, enabled: boolean): string {
  if (state.message) return i18n.t("settings.snapShotSettings.captureNeedsAttention");
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error"
      ? i18n.t("settings.snapShotSettings.checkCaptureAccessInSetup")
      : i18n.t("settings.snapShotSettings.installTheCaptureHelperToContinue");
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return i18n.t("settings.snapShotSettings.setUpActiveWindowSnapshots");
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error"
      ? i18n.t("settings.snapShotSettings.checkCaptureAccessInSetup")
      : i18n.t("settings.snapShotSettings.installTheCaptureHelperToContinue");
  if (captureSetupBackend(state) === "picker")
    return i18n.t("settings.snapShotSettings.manualCaptureOnlyYouLlChooseAWindowEach");
  if (!enabled) return i18n.t("settings.snapShotSettings.enableCaptureToContinue");
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland"
      ? i18n.t("settings.snapShotSettings.connectingYourShortcut")
      : i18n.t("settings.snapShotSettings.waitingForShortcutPermission");
  if (state.shortcutVerified) return i18n.t("settings.snapShotSettings.readyToCapture");
  if (state.linuxBackend === "niri" && state.shortcutBinding)
    return i18n.t("settings.snapShotSettings.useYourShortcutFromAnotherApp");
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return i18n.t("settings.snapShotSettings.useYourShortcutFromAnotherApp");
  if (state.shortcutRegistered)
    return state.shortcutLabel
      ? i18n.t("settings.snapShotSettings.readyToCapture")
      : i18n.t("settings.snapShotSettings.shortcutSaved");
  return i18n.t("settings.snapShotSettings.finishShortcutSetup");
}

export function snapShotShortcutStatus(state: DesktopSnapShotState | null): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending)
    return i18n.t("settings.snapShotSettings.approveTheShortcutPermissionPromptToContinue");
  if (state.shortcutRegistered)
    return state.mode === "portal"
      ? null
      : i18n.t("settings.snapShotSettings.shortcutSavedSentence");
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(state: DesktopSnapShotState | null): string {
  if (!state) return i18n.t("settings.snapShotSettings.continueSetup");
  if (captureSetupAccessReady(state)) return i18n.t("settings.snapShotSettings.manageCapture");
  const desktop = captureSetupDesktopName(state);
  return desktop
    ? i18n.t("settings.input.desktopCapture", { desktop: desktop })
    : i18n.t("settings.snapShotSettings.continueSetup");
}

// Windows needs no permissions or setup: turning capture on is enough. macOS setup
// has nothing left to manage once permissions and the shortcut are in place; the
// shortcut row stays editable inline. Revoking a permission brings the button back
// as "Continue setup" through the state message.
export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? i18n.t("settings.snapShotSettings.captureEffectsArenTAvailableOnThisDesktop")
      : i18n.t("settings.snapShotSettings.installOrUpdateTheCaptureHelperToEnableEffects");
  if (state.linuxBackend === "niri")
    return i18n.t("settings.snapShotSettings.captureEffectsArenTAvailableOnNiri");
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? i18n.t("settings.snapShotSettings.captureEffectsArenTAvailableOnThisDesktop")
      : i18n.t("settings.snapShotSettings.installOrUpdateTheCaptureHelperToEnableEffects");
  return state.linuxBackend === "gnome-extension"
    ? i18n.t("settings.snapShotSettings.updateTheGNOMEExtensionThenSignOutAndBack")
    : captureSetupBackend(state) === "gnome"
      ? i18n.t("settings.snapShotSettings.finishExtensionSetupToEnableEffects")
      : i18n.t("settings.snapShotSettings.captureEffectsArenTAvailableOnThisDesktop");
}

export function snapShotDescription(state: DesktopSnapShotState | null): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? i18n.t("settings.snapShotSettings.automaticCaptureIsnTAvailableHereChooseAWindow")
    : i18n.t("settings.snapShotSettings.captureAWindowAndAttachItToYourCurrent");
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return i18n.t("settings.snapShotSettings.thisDesktopOnlyProvidesAScreenshot");
  return undefined;
}

export function snapShotUnavailableMessage(hasBridge: boolean): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? i18n.t("settings.snapShotSettings.updateTheDesktopAppToUseSnapshots")
    : i18n.t("common.desktopOnly");
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
