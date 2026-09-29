import { useI18n } from "../../hooks/useI18n";
import type { MessageKey } from "@t3tools/shared/i18n";
import { SettingsGroup } from "./SettingsGroup";
import { Spinner } from "~/components/ui/spinner";
import { NotificationSettings } from "./NotificationSettings";
import { ArchiveIcon, ArchiveX, CheckIcon, ChevronRightIcon, SettingsIcon } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AppLanguage,
  type BackgroundActivityProfile,
  type DesktopUpdateChannel,
  ProviderDriverKind,
  type ProviderInstanceId,
  type ScopedThreadRef,
  type SidebarProjectGroupingMode,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
  DEFAULT_UNIFIED_SETTINGS,
  type ChatWidth,
  type DiffLayout,
  type EnvironmentIdentificationMode,
  MAX_APPEARANCE_CONTRAST,
  MAX_CODE_FONT_SIZE,
  MAX_GLASS_OPACITY,
  MAX_INTERFACE_FONT_SIZE,
  MAX_PANEL_ANIMATION_DURATION_MS,
  MAX_PROMPT_FONT_SIZE,
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MAX_TERMINAL_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_APPEARANCE_CONTRAST,
  MIN_GLASS_OPACITY,
  MIN_INTERFACE_FONT_SIZE,
  MIN_PANEL_ANIMATION_DURATION_MS,
  MIN_PROMPT_FONT_SIZE,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  type ResponseStreamingMode,
  MIN_TERMINAL_FONT_SIZE,
  type QuitConfirmationMode,
} from "@t3tools/contracts/settings";
import { resolveServerBackgroundActivitySettings } from "@t3tools/shared/backgroundActivitySettings";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import { APP_VERSION, HOSTED_APP_CHANNEL } from "../../branding";
import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
} from "../../components/desktopUpdate.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { isElectron } from "../../env";
import { buildHostedChannelSelectionUrl, type HostedAppChannel } from "../../hostedPairing";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import {
  readAppearanceModePreference,
  readThemeHalves,
  readThemePreference,
  useTheme,
} from "../../hooks/useTheme";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useSettingsScope } from "./SettingsScopeContext";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { ensureLocalApi, readLocalApi } from "../../localApi";
import { isMacPlatform } from "../../lib/utils";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { formatRelativeTimeLabel } from "../../timestampFormat";
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
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { DraftInput } from "../ui/draft-input";
import { Input } from "../ui/input";
import {
  DEFAULT_CODE_FONT_STACK,
  DEFAULT_SANS_FONT_STACK,
  isFontFamilyAvailable,
  isMonospaceFamily,
  resolveDefaultFamilyLabel,
  resolveTerminalFontPreference,
  resolveTerminalFontSizePreference,
  TYPOGRAPHY_ADVANCED_STORAGE_KEY,
} from "../../appearanceFonts";
import { CodeFontPreview, PromptFontPreview, TerminalFontPreview } from "./SettingsFontPreviews";
import { discoverInstalledFonts, FontFamilyPicker, useFontEnumeration } from "./FontFamilyPicker";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { ScopedSwitch } from "./ScopedSwitch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThemeLibrary } from "./ThemeSettings";
import {
  backgroundActivityOverrideSettings,
  backgroundActivitySharedPolicySettings,
  durationToSeconds,
  getChangedBrowserSettingLabels,
  getChangedTypographySettingLabels,
  normalizeIntervalSeconds,
  PROVIDER_HEALTH_INTERVAL_STEP_SECONDS,
  hasChangedBackgroundActivitySettings,
  isProjectGroupingEnabled,
  projectGroupingModeFromToggle,
  readLastEnabledProjectGroupingMode,
  rememberEnabledProjectGroupingMode,
  resolveBackgroundActivityProfileOption,
} from "./SettingsPanels.logic";
import {
  PolicyTooltip,
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  useSettingsSearchTarget,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { ProjectFavicon } from "../ProjectFavicon";
import { PanelAnimationsPreview } from "./PanelAnimationsPreview";

const ENVIRONMENT_IDENTIFICATION_LABELS: Record<EnvironmentIdentificationMode, MessageKey> = {
  artwork: "settings.label.artwork",
  pill: "settings.label.versionPill",
  none: "common.none",
};

const RESPONSE_STREAMING_MODE_LABELS: Record<ResponseStreamingMode, MessageKey> = {
  turn: "settings.label.waitForTheFullResponse",
  paragraph: "settings.label.showFinishedParagraphs",
  token: "settings.label.tokenByTokenLegacy",
};

const RESPONSE_STREAMING_MODE_DESCRIPTIONS: Record<ResponseStreamingMode, MessageKey> = {
  turn: "settings.label.textAppearsOnceTheAgentFinishesItsTurn",
  paragraph: "settings.label.eachParagraphOrCodeBlockAppearsAsSoonAs",
  token: "settings.description.everyTokenRepaintsTheAnswerAsItArrivesSlower",
};

const TIMESTAMP_FORMAT_LABELS = {
  locale: "settings.label.systemDefault",
  "12-hour": "settings.label.12Hour",
  "24-hour": "settings.label.24Hour",
} as const;

const CHAT_WIDTH_LABELS: Record<ChatWidth, MessageKey> = {
  comfortable: "settings.label.comfortable",
  wide: "settings.label.wide",
  full: "settings.label.full",
};

// Endonyms: a reader who cannot read the current language still recognizes
// their own in this list.
const APP_LANGUAGE_LABELS: Record<AppLanguage, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

const DIFF_LAYOUT_LABELS: Record<DiffLayout, MessageKey> = {
  stacked: "settings.label.stacked",
  split: "settings.label.split",
};

const QUIT_CONFIRMATION_MODE_LABELS: Record<QuitConfirmationMode, MessageKey> = {
  direct: "settings.label.direct",
  hold: "settings.label.hold",
  "double-click": "settings.label.doublePress",
};

const BACKGROUND_ACTIVITY_PROFILE_LABELS: Record<BackgroundActivityProfile, MessageKey> = {
  balanced: "settings.label.balanced",
  performance: "settings.label.performance",
  "battery-saver": "settings.label.batterySaver",
};

type BackgroundActivityProfileOption = BackgroundActivityProfile | "advanced";

const BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS: Record<
  BackgroundActivityProfileOption,
  MessageKey
> = {
  ...BACKGROUND_ACTIVITY_PROFILE_LABELS,
  advanced: "settings.label.advanced",
};

const BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS: Record<BackgroundActivityProfile, MessageKey> = {
  balanced: "settings.label.pausesProbesForIdleClientsLockedHostsOrLow",
  performance: "settings.description.allowsScopedBackgroundProbesWhileAnySubscribedClientRemains",
  "battery-saver": "settings.label.alsoPausesBackgroundProbesWhenTheHostOrClient",
};

const DEFAULT_DRIVER_KIND = ProviderDriverKind.make("codex");
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

function AboutVersionTitle() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{t("settings.label.version")}</span>
      <code className="text-2xs font-medium text-muted-foreground">{APP_VERSION}</code>
    </span>
  );
}

function AboutVersionSection() {
  const { t } = useI18n();
  const updateState = useDesktopUpdateState();
  const [isChangingUpdateChannel, setIsChangingUpdateChannel] = useState(false);
  const [isUpdateActionPending, setIsUpdateActionPending] = useState(false);

  const hasDesktopBridge = typeof window !== "undefined" && Boolean(window.desktopBridge);
  const selectedUpdateChannel = updateState?.channel ?? "latest";
  const selectedHostedAppChannel = hasDesktopBridge ? null : HOSTED_APP_CHANNEL;

  const handleUpdateChannelChange = useCallback(
    (channel: DesktopUpdateChannel) => {
      const bridge = window.desktopBridge;
      if (
        !bridge ||
        typeof bridge.setUpdateChannel !== "function" ||
        channel === selectedUpdateChannel
      ) {
        return;
      }

      setIsChangingUpdateChannel(true);
      void bridge
        .setUpdateChannel(channel)
        .catch((error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("settings.label.couldNotChangeUpdateTrack"),
              description:
                error instanceof Error
                  ? error.message
                  : t("settings.label.updateTrackChangeFailed"),
            }),
          );
        })
        .finally(() => {
          setIsChangingUpdateChannel(false);
        });
    },
    [t, selectedUpdateChannel],
  );

  const handleButtonClick = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;

    const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";

    if (action === "download") {
      void bridge.downloadUpdate().catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("settings.label.couldNotDownloadUpdate"),
            description:
              error instanceof Error ? error.message : t("settings.label.downloadFailed"),
          }),
        );
      });
      return;
    }

    if (action === "install") {
      if (isUpdateActionPending) return;
      setIsUpdateActionPending(true);
      let confirmed = false;
      try {
        confirmed = await ensureLocalApi().dialogs.confirm(
          getDesktopUpdateInstallConfirmationMessage(
            updateState ?? { availableVersion: null, downloadedVersion: null },
          ),
        );
      } catch (error) {
        setIsUpdateActionPending(false);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("settings.label.couldNotConfirmUpdate"),
            description:
              error instanceof Error ? error.message : t("settings.label.updateConfirmationFailed"),
          }),
        );
        return;
      }
      if (!confirmed) {
        setIsUpdateActionPending(false);
        return;
      }
      void bridge
        .installUpdate()
        .catch((error: unknown) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("settings.label.couldNotInstallUpdate"),
              description:
                error instanceof Error ? error.message : t("settings.label.installFailed"),
            }),
          );
        })
        .finally(() => setIsUpdateActionPending(false));
      return;
    }

    if (typeof bridge.checkForUpdate !== "function") return;
    void bridge
      .checkForUpdate()
      .then((result) => {
        if (!result.checked) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("settings.label.couldNotCheckForUpdates"),
              description:
                result.state.message ??
                t("settings.label.automaticUpdatesAreNotAvailableInThisBuild"),
            }),
          );
        }
      })
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("settings.label.couldNotCheckForUpdates"),
            description:
              error instanceof Error ? error.message : t("settings.label.updateCheckFailed"),
          }),
        );
      });
  }, [t, isUpdateActionPending, updateState]);

  const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";
  const buttonTooltip = updateState ? getDesktopUpdateButtonTooltip(updateState) : null;
  const buttonDisabled =
    action === "none"
      ? !canCheckForUpdate(updateState)
      : isDesktopUpdateButtonDisabled(updateState);

  const actionLabel: Record<string, string> = {
    download: t("action.download"),
    install: t("settings.label.install"),
  };
  const statusLabel: Record<string, string> = {
    checking: t("settings.label.checking"),
    downloading: t("settings.label.downloading"),
    "up-to-date": t("settings.label.upToDate"),
  };
  const buttonLabel =
    actionLabel[action] ??
    statusLabel[updateState?.status ?? ""] ??
    t("settings.label.checkForUpdates");
  const description =
    action === "download" || action === "install"
      ? t("settings.label.updateAvailable")
      : t("settings.label.currentVersionOfTheApplication");

  return (
    <>
      <SettingsRow
        title={<AboutVersionTitle />}
        description={description}
        control={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={buttonDisabled || isUpdateActionPending}
                  onClick={handleButtonClick}
                >
                  {buttonLabel}
                </Button>
              }
            />
            {buttonTooltip ? <TooltipPopup>{buttonTooltip}</TooltipPopup> : null}
          </Tooltip>
        }
      />
      {hasDesktopBridge ? (
        <SettingsRow
          title={t("settings.label.updateTrack")}
          description={t("settings.label.useStableReleasesOrNightlyBuildsSwitchBackAnytime")}
          control={
            <Select
              value={selectedUpdateChannel}
              onValueChange={(value) => {
                handleUpdateChannelChange(value as DesktopUpdateChannel);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t("settings.label.updateTrack")}
                disabled={isChangingUpdateChannel}
              >
                <SelectValue>
                  {selectedUpdateChannel === "nightly"
                    ? t("settings.label.nightly")
                    : t("settings.label.stable")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  {t("settings.label.stable")}
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  {t("settings.label.nightly")}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : selectedHostedAppChannel ? (
        <SettingsRow
          title={t("settings.label.updateTrack")}
          description={t("settings.label.switchesTheHostedAppReleaseChannel")}
          control={
            <Select
              value={selectedHostedAppChannel}
              onValueChange={(value) => {
                if (value === selectedHostedAppChannel) return;
                window.location.assign(
                  buildHostedChannelSelectionUrl({ channel: value as HostedAppChannel }),
                );
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t("settings.label.updateTrack")}
              >
                <SelectValue>
                  {selectedHostedAppChannel === "nightly"
                    ? t("settings.label.nightly")
                    : t("settings.label.latest")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="latest">
                  {t("settings.label.latest")}
                </SelectItem>
                <SelectItem hideIndicator value="nightly">
                  {t("settings.label.nightly")}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      ) : null}
    </>
  );
}

const RESTORE_SETTING_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  "Interface font": "settings.option.interfaceFont",
  "Prompt font": "settings.option.promptFont",
  "Code font": "settings.option.codeFont",
  "Terminal font": "settings.option.terminalFont",
  "Open links in": "settings.label.openLinksIn",
  "Browser viewport": "settings.label.browserViewport",
  "Browser zoom": "settings.label.browserZoom",
  "Browser appearance": "settings.label.browserAppearance",
  "Recording frame rate": "settings.label.recordingFrameRate",
  "Recording key presses": "settings.label.recordingKeyPresses",
  "Recording mouse presses": "settings.label.recordingMousePresses",
  "Floating preview": "settings.label.floatingPreview",
};

export function useSettingsRestore(onRestored?: () => void) {
  const { t } = useI18n();
  const {
    theme,
    setTheme,
    followSystem,
    setFollowSystem,
    setThemeHalf,
    clearThemeHalves,
    themeHalves,
  } = useTheme();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();

  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const isBackgroundActivityDirty = hasChangedBackgroundActivitySettings(settings);

  const changedSettingLabels = useMemo(
    () => [
      ...(theme !== "system" ? [t("settings.label.theme")] : []),
      ...(!followSystem ? [t("settings.label.followSystem")] : []),
      ...(themeHalves !== null ? [t("settings.label.themeMix")] : []),
      ...(settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast
        ? [t("settings.option.contrast")]
        : []),
      ...(settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity
        ? [t("settings.option.glassOpacity")]
        : []),
      ...(settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme
        ? [t("settings.label.diffColors")]
        : []),
      ...(settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth
        ? [t("settings.label.chatWidth")]
        : []),
      ...(settings.panelAnimationDurationMs !== DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs
        ? [t("settings.label.panelAnimations")]
        : []),
      ...(settings.environmentIdentificationMode !==
      DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode
        ? [t("settings.option.environmentIdentification")]
        : []),
      ...(settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat
        ? [t("settings.option.timeFormat")]
        : []),
      ...(settings.notificationMode !== DEFAULT_UNIFIED_SETTINGS.notificationMode
        ? [t("settings.label.threadNotifications")]
        : []),
      ...(settings.inAppNotificationsEnabled !== DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled
        ? [t("settings.label.inAppNotifications")]
        : []),
      ...(settings.sidebarThreadPreviewCount !== DEFAULT_UNIFIED_SETTINGS.sidebarThreadPreviewCount
        ? [t("settings.label.visibleThreads")]
        : []),
      ...(settings.sidebarProjectGroupingMode !==
      DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode
        ? [t("settings.label.projectGrouping")]
        : []),
      ...(settings.sidebarAutoSettleAfterDays !==
      DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays
        ? [t("settings.option.autoSettleInactiveThreads")]
        : []),
      ...(settings.sidebarAutoSettleOnMerge !== DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge
        ? [t("settings.option.autoSettleMergedThreads")]
        : []),
      ...(settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap
        ? [t("settings.option.wordWrap")]
        : []),
      ...getChangedTypographySettingLabels(settings).map((label) => {
        const key = RESTORE_SETTING_LABEL_KEYS[label];
        return key ? t(key) : label;
      }),
      ...(settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed
        ? [t("settings.label.defaultDiffFileState")]
        : []),
      ...(settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace
        ? [t("settings.label.diffWhitespaceChanges")]
        : []),
      ...(settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout
        ? [t("settings.label.diffLayout")]
        : []),
      ...(settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled
        ? [t("settings.label.proactivePanels")]
        : []),
      ...(settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu
        ? [t("settings.option.skillsInSlashMenu")]
        : []),
      ...(settings.composerCollapseOnScroll !== DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll
        ? [t("settings.label.collapseComposerOnScroll")]
        : []),
      ...(settings.composerRichTextEnabled !== DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled
        ? [t("settings.label.richTextComposer")]
        : []),
      ...(settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut
        ? [t("settings.label.sendShortcut")]
        : []),
      ...(settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior
        ? [t("settings.label.followUpBehavior")]
        : []),
      ...(settings.contextWindowMeterEnabled !== DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled
        ? [t("settings.label.contextWindowIndicator")]
        : []),
      ...(settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode
        ? [t("settings.label.responseStreaming")]
        : []),
      ...(settings.enableProviderUpdateChecks !==
      DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks
        ? [t("settings.option.providerUpdateChecks")]
        : []),
      ...(settings.continueThreadsAfterServerUpdate !==
      DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate
        ? [t("settings.label.continueThreadsAfterRestarts")]
        : []),
      ...(isBackgroundActivityDirty ? [t("settings.label.backgroundActivity")] : []),
      ...(settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode
        ? [t("settings.label.newThreadMode")]
        : []),
      ...(settings.newWorktreesStartFromOrigin !==
      DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin
        ? [t("settings.label.newWorktreesStartFromOrigin")]
        : []),
      ...(settings.addProjectBaseDirectory !== DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory
        ? [t("settings.label.addProjectBaseDirectory")]
        : []),
      ...(settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin
        ? [t("settings.label.unpinConfirmation")]
        : []),
      ...(settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive
        ? [t("settings.option.archiveConfirmation")]
        : []),
      ...(settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete
        ? [t("settings.option.deleteConfirmation")]
        : []),
      ...(settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit
        ? [t("settings.label.quitShortcut")]
        : []),
      ...(isTextGenerationModelDirty ? [t("settings.option.textGenerationModel")] : []),
      ...getChangedBrowserSettingLabels(settings).map((label) => {
        const key = RESTORE_SETTING_LABEL_KEYS[label];
        return key ? t(key) : label;
      }),
      ...(settings.enableAgentBrowserAccess !== DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess
        ? [t("settings.option.agentBrowserAccess")]
        : []),
    ],
    [
      t,
      isTextGenerationModelDirty,
      isBackgroundActivityDirty,
      settings.browserDefaultViewport,
      settings.browserDefaultZoomFactor,
      settings.browserDefaultAppearance,
      settings.browserRecordingFrameRate,
      settings.browserRecordingShowKeyPresses,
      settings.browserRecordingShowMousePresses,
      settings.browserLinkTarget,
      settings.browserAutoShowFloatingPreview,
      settings.appearanceContrast,
      settings.diffColorScheme,
      settings.chatWidth,
      settings.enableAgentBrowserAccess,
      settings.confirmQuit,
      settings.confirmThreadArchive,
      settings.confirmThreadDelete,
      settings.confirmThreadUnpin,
      settings.composerCollapseOnScroll,
      settings.composerRichTextEnabled,
      settings.sendShortcut,
      settings.followUpBehavior,
      settings.addProjectBaseDirectory,
      settings.defaultThreadEnvMode,
      settings.newWorktreesStartFromOrigin,
      settings.diffFilesCollapsed,
      settings.diffIgnoreWhitespace,
      settings.diffLayout,
      settings.proactivePanelsEnabled,
      settings.environmentIdentificationMode,
      settings.contextWindowMeterEnabled,
      settings.fontFamilyCode,
      settings.fontFamilyComposer,
      settings.fontFamilySans,
      settings.fontFamilyTerminal,
      settings.fontSizeCode,
      settings.fontSizeInterface,
      settings.fontSizePrompt,
      settings.fontSizeTerminal,
      settings.glassOpacity,
      settings.panelAnimationDurationMs,
      settings.responseStreamingMode,
      settings.enableProviderUpdateChecks,
      settings.continueThreadsAfterServerUpdate,
      settings.sidebarAutoSettleAfterDays,
      settings.sidebarAutoSettleOnMerge,
      settings.sidebarProjectGroupingMode,
      settings.sidebarThreadPreviewCount,
      settings.showSkillsInSlashMenu,
      settings.timestampFormat,
      settings.notificationMode,
      settings.inAppNotificationsEnabled,
      settings.wordWrap,
      followSystem,
      theme,
      themeHalves,
    ],
  );

  const restoreDefaults = useCallback(async () => {
    if (changedSettingLabels.length === 0) return;
    const api = readLocalApi();
    const confirmed = await (api ?? ensureLocalApi()).dialogs.confirm(
      [
        t("settings.label.restoreDefaultSettings"),
        t("settings.restore.summary", { settings: changedSettingLabels.join(", ") }),
      ].join("\n"),
      { variant: "destructive" },
    );
    if (!confirmed) return;

    // Only touch the theme keys that are actually dirty, so a theme-storage
    // failure cannot block restoring unrelated settings. Preferences are
    // re-read after the confirmation dialog: they may have changed (another
    // tab, an OS flip) while it was open, and rollback must restore the live
    // values rather than the ones captured at render time.
    let previousTheme = theme;
    try {
      previousTheme = readThemePreference();
    } catch {
      // Storage is unreadable; the render-time value is the best rollback.
    }
    // The mix may have changed while the confirmation dialog was open; both
    // the dirty check and the rollback must see the live value.
    const liveHalves = readThemeHalves();
    const needsThemeReset = previousTheme !== "system";
    const needsMixReset = liveHalves !== null;
    // Same for the appearance mode: trusting the render-time value would skip
    // the reset and report success while a non-system mode stayed in storage.
    const needsFollowSystemReset = readAppearanceModePreference(previousTheme) !== "system";
    const notifyThemeRestoreFailure = () => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.label.couldnTRestoreThemeSettings"),
          description: t("settings.label.tryAgain"),
        }),
      );
    };
    // Rollback restores the base preference first (which clears any mix) and
    // then re-applies the captured mix on top, so no failure path can leave
    // the pair of keys half-restored.
    const previousHalves = liveHalves;
    const rollbackThemeState = () => {
      if (needsThemeReset) setTheme(previousTheme);
      if (previousHalves?.light) setThemeHalf("light", previousHalves.light);
      if (previousHalves?.dark) setThemeHalf("dark", previousHalves.dark);
    };
    if (needsThemeReset && !setTheme("system")) {
      notifyThemeRestoreFailure();
      return;
    }
    if (needsMixReset && !clearThemeHalves()) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    if (needsFollowSystemReset && !setFollowSystem(true)) {
      rollbackThemeState();
      notifyThemeRestoreFailure();
      return;
    }
    updateSettings({
      appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
      diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme,
      chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth,
      timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
      notificationMode: DEFAULT_UNIFIED_SETTINGS.notificationMode,
      inAppNotificationsEnabled: DEFAULT_UNIFIED_SETTINGS.inAppNotificationsEnabled,
      wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap,
      diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
      diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
      diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout,
      proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
      showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
      composerCollapseOnScroll: DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll,
      composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
      sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut,
      followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
      contextWindowMeterEnabled: DEFAULT_UNIFIED_SETTINGS.contextWindowMeterEnabled,
      environmentIdentificationMode: DEFAULT_UNIFIED_SETTINGS.environmentIdentificationMode,
      glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity,
      panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
      sidebarThreadPreviewCount: DEFAULT_UNIFIED_SETTINGS.sidebarThreadPreviewCount,
      sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
      sidebarAutoSettleAfterDays: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
      sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
      responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
      enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
      continueThreadsAfterServerUpdate: DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
      backgroundActivity: DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
      backgroundActivityProfile: DEFAULT_UNIFIED_SETTINGS.backgroundActivityProfile,
      automaticGitFetchInterval: DEFAULT_UNIFIED_SETTINGS.automaticGitFetchInterval,
      providerHealthRefreshInterval: DEFAULT_UNIFIED_SETTINGS.providerHealthRefreshInterval,
      defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
      newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
      addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
      confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
      confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
      confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
      confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit,
      textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
      fontFamilySans: DEFAULT_UNIFIED_SETTINGS.fontFamilySans,
      fontFamilyComposer: DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer,
      fontFamilyCode: DEFAULT_UNIFIED_SETTINGS.fontFamilyCode,
      fontFamilyTerminal: DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal,
      fontSizeInterface: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
      fontSizePrompt: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
      fontSizeCode: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
      fontSizeTerminal: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
      browserDefaultViewport: DEFAULT_UNIFIED_SETTINGS.browserDefaultViewport,
      browserDefaultZoomFactor: DEFAULT_UNIFIED_SETTINGS.browserDefaultZoomFactor,
      browserDefaultAppearance: DEFAULT_UNIFIED_SETTINGS.browserDefaultAppearance,
      browserRecordingFrameRate: DEFAULT_UNIFIED_SETTINGS.browserRecordingFrameRate,
      browserRecordingShowKeyPresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowKeyPresses,
      browserRecordingShowMousePresses: DEFAULT_UNIFIED_SETTINGS.browserRecordingShowMousePresses,
      browserLinkTarget: DEFAULT_UNIFIED_SETTINGS.browserLinkTarget,
      browserAutoShowFloatingPreview: DEFAULT_UNIFIED_SETTINGS.browserAutoShowFloatingPreview,
      // Re-granted like any other default. The confirmation dialog lists it by
      // name, so a user restoring defaults is told the agent regains access
      // rather than discovering it later.
      enableAgentBrowserAccess: DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess,
    });
    onRestored?.();
  }, [
    t,
    changedSettingLabels,
    clearThemeHalves,
    onRestored,
    setFollowSystem,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
    updateSettings,
  ]);

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

/**
 * Gate in front of the legacy token-by-token mode. The primary action steers
 * the user to paragraph streaming; the legacy path is the quiet option.
 */
function TokenStreamingWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  onUseParagraphs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onUseParagraphs: () => void;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.label.tokenByTokenIsAWorseExperience")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings.description.tokenStreamingRepaintsTheMessageOnEveryDeltaIt")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost-muted" className="sm:mr-auto" onClick={onConfirm}>
            {t("settings.label.useTokenByToken")}
          </Button>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t("action.cancel")}
          </AlertDialogClose>
          <Button onClick={onUseParagraphs}>{t("settings.label.useParagraphs")}</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function BackgroundActivityAdvancedDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("settings.background.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.label.tuneTheSharedPowerPolicyAndTheBackgroundIntervals")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="overflow-hidden rounded-xl border bg-card text-card-foreground">
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
                  <SelectValue>{t(BACKGROUND_ACTIVITY_PROFILE_LABELS[activeProfile])}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="balanced">
                    {t(BACKGROUND_ACTIVITY_PROFILE_LABELS.balanced)}
                  </SelectItem>
                  <SelectItem hideIndicator value="performance">
                    {t(BACKGROUND_ACTIVITY_PROFILE_LABELS.performance)}
                  </SelectItem>
                  <SelectItem hideIndicator value="battery-saver">
                    {t(BACKGROUND_ACTIVITY_PROFILE_LABELS["battery-saver"])}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>

            <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium">
                  {searchableSetting("git-fetch-interval", t).title}
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
                  {t("settings.label.refreshProviderAvailabilityVersionsAuthStateAndModelMetadata")}
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
                  <span className="text-sm font-medium">{t(label)}</span>
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
                    aria-label={t(label)}
                  />
                </label>
              ))}
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => updateSettings(resetBackgroundActivitySettings())}
          >
            {t("settings.label.resetAll")}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t("action.done")}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function AppearanceSettingsPanel() {
  const { t } = useI18n();
  const {
    appearanceMode,
    refreshTheme,
    resolvedTheme,
    setAppearanceMode,
    setTheme,
    setThemeHalf,
    theme,
    themeHalves,
  } = useTheme();
  const customThemes = useCustomThemes();
  const [isImportThemeOpen, setIsImportThemeOpen] = useState(false);
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const environmentStageLabel = useEnvironmentStageLabel();
  const showEnvironmentIdentification =
    resolveEnvironmentIdentificationPillLabel(environmentStageLabel) !== null;
  const glassOpacityRatio =
    (settings.glassOpacity - MIN_GLASS_OPACITY) / (MAX_GLASS_OPACITY - MIN_GLASS_OPACITY);
  const glassOpacitySliderStyle = {
    "--settings-slider-progress": `${glassOpacityRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - glassOpacityRatio}rem`,
  } as CSSProperties;
  const appearanceContrastRatio =
    (settings.appearanceContrast - MIN_APPEARANCE_CONTRAST) /
    (MAX_APPEARANCE_CONTRAST - MIN_APPEARANCE_CONTRAST);
  const appearanceContrastSliderStyle = {
    "--settings-slider-progress": `${appearanceContrastRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - appearanceContrastRatio}rem`,
  } as CSSProperties;
  const panelAnimationDurationRatio =
    (settings.panelAnimationDurationMs - MIN_PANEL_ANIMATION_DURATION_MS) /
    (MAX_PANEL_ANIMATION_DURATION_MS - MIN_PANEL_ANIMATION_DURATION_MS);
  const panelAnimationDurationSliderStyle = {
    "--settings-slider-progress": `${panelAnimationDurationRatio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - panelAnimationDurationRatio}rem`,
  } as CSSProperties;

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="appearance"
        title={t("settings.label.colorsThemes")}
        variant="plain"
        hideTitle
      >
        <div id={searchableSetting("theme", t).id}>
          <ThemeLibrary
            appearanceMode={appearanceMode}
            customThemes={customThemes}
            initialAppearance={resolvedTheme}
            refreshTheme={refreshTheme}
            isImportOpen={isImportThemeOpen}
            setAppearanceMode={setAppearanceMode}
            setTheme={setTheme}
            setThemeHalf={setThemeHalf}
            theme={theme}
            themeHalves={themeHalves}
            onImportOpenChange={setIsImportThemeOpen}
          />
        </div>
      </SettingsSection>

      <SettingsSection id="appearance-interface" title={t("settings.label.interface")}>
        <SettingsRow
          {...searchableSetting("app-language", t)}
          description={t("settings.description.languageUsedAcrossTheAppAnythingNotTranslatedYet")}
          resetAction={
            settings.language !== DEFAULT_UNIFIED_SETTINGS.language ? (
              <SettingResetButton
                label={t("settings.label.language")}
                onClick={() => updateSettings({ language: DEFAULT_UNIFIED_SETTINGS.language })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.language}
              onValueChange={(value) => {
                if (value === "zh-CN" || value === "en") {
                  updateSettings({ language: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t("settings.label.language")}
              >
                <SelectValue>{APP_LANGUAGE_LABELS[settings.language]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="zh-CN">
                  {APP_LANGUAGE_LABELS["zh-CN"]}
                </SelectItem>
                <SelectItem hideIndicator value="en">
                  {APP_LANGUAGE_LABELS.en}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("setting-appearance-contrast", t)}
          description={t("settings.label.adjustTheContrastOfColorsAndBordersAcrossThe")}
          resetAction={
            settings.appearanceContrast !== DEFAULT_UNIFIED_SETTINGS.appearanceContrast ? (
              <SettingResetButton
                label={t("settings.option.contrast")}
                onClick={() =>
                  updateSettings({
                    appearanceContrast: DEFAULT_UNIFIED_SETTINGS.appearanceContrast,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="appearance-contrast"
              >
                {settings.appearanceContrast}%
              </output>
              <input
                aria-label={t("settings.option.contrast")}
                className="settings-slider min-w-0 flex-1"
                id="appearance-contrast"
                max={MAX_APPEARANCE_CONTRAST}
                min={MIN_APPEARANCE_CONTRAST}
                onChange={(event) => {
                  const appearanceContrast = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(appearanceContrast) &&
                    appearanceContrast >= MIN_APPEARANCE_CONTRAST &&
                    appearanceContrast <= MAX_APPEARANCE_CONTRAST
                  ) {
                    updateSettings({ appearanceContrast });
                  }
                }}
                step={5}
                style={appearanceContrastSliderStyle}
                type="range"
                value={settings.appearanceContrast}
              />
            </div>
          }
        />

        <SettingsRow
          {...searchableSetting("setting-glass-opacity", t)}
          description={t("settings.label.higherValuesMakeMenusDialogsAndTheComposerMore")}
          resetAction={
            settings.glassOpacity !== DEFAULT_UNIFIED_SETTINGS.glassOpacity ? (
              <SettingResetButton
                label={t("settings.option.glassOpacity")}
                onClick={() =>
                  updateSettings({ glassOpacity: DEFAULT_UNIFIED_SETTINGS.glassOpacity })
                }
              />
            ) : null
          }
          control={
            <div className="flex w-full items-center gap-3 sm:w-52">
              <output
                className="min-w-12 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                htmlFor="glass-opacity"
              >
                {settings.glassOpacity}%
              </output>
              <input
                aria-label={t("settings.option.glassOpacity")}
                className="settings-slider min-w-0 flex-1"
                id="glass-opacity"
                max={MAX_GLASS_OPACITY}
                min={MIN_GLASS_OPACITY}
                onChange={(event) => {
                  const glassOpacity = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(glassOpacity) &&
                    glassOpacity >= MIN_GLASS_OPACITY &&
                    glassOpacity <= MAX_GLASS_OPACITY
                  ) {
                    updateSettings({ glassOpacity });
                  }
                }}
                step={5}
                style={glassOpacitySliderStyle}
                type="range"
                value={settings.glassOpacity}
              />
            </div>
          }
        />

        {showEnvironmentIdentification ? (
          <SettingsRow
            {...searchableSetting("environment-identification", t)}
            description={t("settings.label.chooseHowDevAndNightlyEnvironmentsAreIdentified")}
            resetAction={
              settings.environmentIdentificationMode !== DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE ? (
                <SettingResetButton
                  label={t("settings.option.environmentIdentification")}
                  onClick={() =>
                    updateSettings({
                      environmentIdentificationMode: DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
                    })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.environmentIdentificationMode}
                onValueChange={(value) => {
                  if (value === "artwork" || value === "pill" || value === "none") {
                    updateSettings({ environmentIdentificationMode: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={t("settings.option.environmentIdentification")}
                >
                  <SelectValue>
                    {t(ENVIRONMENT_IDENTIFICATION_LABELS[settings.environmentIdentificationMode])}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(ENVIRONMENT_IDENTIFICATION_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {t(label)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
        <SettingsRow
          {...searchableSetting("diff-color-scheme", t)}
          description={t(
            "settings.label.chooseColorsForAdditionsAndDeletionsIncludingChangeCounts",
          )}
          resetAction={
            settings.diffColorScheme !== DEFAULT_UNIFIED_SETTINGS.diffColorScheme ? (
              <SettingResetButton
                label={t("settings.label.diffColors")}
                onClick={() =>
                  updateSettings({ diffColorScheme: DEFAULT_UNIFIED_SETTINGS.diffColorScheme })
                }
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.diffColorScheme}
                onValueChange={(value) => {
                  if (value === "red-green" || value === "blue-orange")
                    updateSettings({ diffColorScheme: value });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0"
                  aria-label={t("settings.label.diffColors")}
                >
                  <span
                    aria-hidden="true"
                    className={
                      settings.diffColorScheme === "blue-orange"
                        ? "flex shrink-0 flex-row-reverse gap-1"
                        : "flex shrink-0 gap-1"
                    }
                  >
                    <span className="size-2 rounded-full bg-diff-deletion" />
                    <span className="size-2 rounded-full bg-diff-addition" />
                  </span>
                  <SelectValue>
                    {settings.diffColorScheme === "blue-orange"
                      ? t("settings.label.blueOrange")
                      : t("settings.label.redGreen")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="red-green">{t("settings.label.redGreenDefault")}</SelectItem>
                  <SelectItem value="blue-orange">{t("settings.label.blueOrange")}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("chat-width", t)}
          description={t("settings.label.setHowWideMessagesAndTheComposerCanGrow")}
          resetAction={
            settings.chatWidth !== DEFAULT_UNIFIED_SETTINGS.chatWidth ? (
              <SettingResetButton
                label={t("settings.label.chatWidth")}
                onClick={() => updateSettings({ chatWidth: DEFAULT_UNIFIED_SETTINGS.chatWidth })}
              />
            ) : null
          }
          control={
            <div className="w-full sm:w-40">
              <Select
                value={settings.chatWidth}
                onValueChange={(value) => {
                  if (value === "comfortable" || value === "wide" || value === "full")
                    updateSettings({ chatWidth: value });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0"
                  aria-label={t("settings.label.chatWidth")}
                >
                  <SelectValue>{t(CHAT_WIDTH_LABELS[settings.chatWidth])}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="comfortable">
                    {t("settings.label.comfortableDefault")}
                  </SelectItem>
                  <SelectItem value="wide">{t("settings.label.wide")}</SelectItem>
                  <SelectItem value="full">{t("settings.label.full")}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection id="motion" title={t("settings.label.motion")}>
        <SettingsRow
          {...searchableSetting("panel-animations", t)}
          description={t("settings.label.setHowFastPanelsOpenAndClose")}
          control={
            <div className="grid w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 sm:w-auto sm:grid-cols-[7rem_13rem] sm:gap-4">
              <PanelAnimationsPreview durationMs={settings.panelAnimationDurationMs} />
              <div className="flex w-full items-center gap-3">
                <output
                  className="min-w-16 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
                  htmlFor="panel-animation-duration"
                >
                  {settings.panelAnimationDurationMs} ms
                </output>
                <input
                  aria-label={t("settings.label.panelAnimationDuration")}
                  className="settings-slider min-w-0 flex-1"
                  id="panel-animation-duration"
                  max={MAX_PANEL_ANIMATION_DURATION_MS}
                  min={MIN_PANEL_ANIMATION_DURATION_MS}
                  onChange={(event) => {
                    const panelAnimationDurationMs = Number(event.currentTarget.value);
                    if (
                      Number.isInteger(panelAnimationDurationMs) &&
                      panelAnimationDurationMs >= MIN_PANEL_ANIMATION_DURATION_MS &&
                      panelAnimationDurationMs <= MAX_PANEL_ANIMATION_DURATION_MS
                    ) {
                      updateSettings({ panelAnimationDurationMs });
                    }
                  }}
                  step={25}
                  style={panelAnimationDurationSliderStyle}
                  type="range"
                  value={settings.panelAnimationDurationMs}
                />
              </div>
            </div>
          }
          resetAction={
            settings.panelAnimationDurationMs !==
            DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs ? (
              <SettingResetButton
                label={t("settings.label.panelAnimations")}
                onClick={() =>
                  updateSettings({
                    panelAnimationDurationMs: DEFAULT_UNIFIED_SETTINGS.panelAnimationDurationMs,
                  })
                }
              />
            ) : null
          }
        />
      </SettingsSection>

      <TypographySection />
    </SettingsPageContainer>
  );
}

function useFontDefaultFamilies() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  // An unset preference shows the font it resolves to on this machine; the
  // default stacks are the platform's own faces, so the name is probed, not
  // hardcoded.
  const defaults = useMemo(
    () => ({
      sans: resolveDefaultFamilyLabel(DEFAULT_SANS_FONT_STACK) ?? t("settings.label.systemDefault"),
      code:
        resolveDefaultFamilyLabel(DEFAULT_CODE_FONT_STACK) ?? t("settings.label.systemMonospace"),
    }),
    [t],
  );
  return {
    sans: defaults.sans,
    code: defaults.code,
    // The composer inherits whatever the interface preference resolves to.
    interfaceFamily: settings.fontFamilySans.trim() || defaults.sans,
  };
}

function InterfaceFontRow({ preview }: { preview?: ReactNode }) {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("interface-font", t)}
      description={t("settings.label.everythingOutsideCodeBlocksAndTheTerminal")}
      defaultFamily={defaults.sans}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilySans}
      value={settings.fontFamilySans}
      onValueChange={(fontFamilySans) => updateSettings({ fontFamilySans })}
      onReset={() =>
        updateSettings({
          fontFamilySans: DEFAULT_UNIFIED_SETTINGS.fontFamilySans,
          fontSizeInterface: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
        })
      }
      size={{
        label: t("settings.label.interfaceFontSize"),
        min: MIN_INTERFACE_FONT_SIZE,
        max: MAX_INTERFACE_FONT_SIZE,
        value: settings.fontSizeInterface,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
        onChange: (fontSizeInterface) => updateSettings({ fontSizeInterface }),
      }}
      {...(preview !== undefined ? { preview } : {})}
    />
  );
}

function PromptFontRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("prompt-font", t)}
      description={t("settings.label.onlyTheBoxYouWritePromptsInMonoWorks")}
      defaultFamily={defaults.interfaceFamily}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer}
      value={settings.fontFamilyComposer}
      onValueChange={(fontFamilyComposer) => updateSettings({ fontFamilyComposer })}
      onReset={() =>
        updateSettings({
          fontFamilyComposer: DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer,
          fontSizePrompt: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
        })
      }
      size={{
        label: t("settings.label.promptFontSize"),
        min: MIN_PROMPT_FONT_SIZE,
        max: MAX_PROMPT_FONT_SIZE,
        value: settings.fontSizePrompt,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
        onChange: (fontSizePrompt) => updateSettings({ fontSizePrompt }),
      }}
      preview={<PromptFontPreview />}
    />
  );
}

function CodeFontRow({
  title,
  description,
  preview,
}: {
  title?: string;
  description?: string;
  preview?: ReactNode;
}) {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("code-font", t)}
      {...(title !== undefined ? { title } : {})}
      description={description ?? t("settings.label.codeBlocksDiffsAndFilePreviews")}
      defaultFamily={defaults.code}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilyCode}
      value={settings.fontFamilyCode}
      onValueChange={(fontFamilyCode) => updateSettings({ fontFamilyCode })}
      onReset={() =>
        updateSettings({
          fontFamilyCode: DEFAULT_UNIFIED_SETTINGS.fontFamilyCode,
          fontSizeCode: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
        })
      }
      requireMonospace
      size={{
        label: t("settings.label.codeFontSize"),
        min: MIN_CODE_FONT_SIZE,
        max: MAX_CODE_FONT_SIZE,
        value: settings.fontSizeCode,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
        onChange: (fontSizeCode) => updateSettings({ fontSizeCode }),
      }}
      preview={preview ?? <CodeFontPreview />}
    />
  );
}

function TerminalFontRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("terminal-font", t)}
      description={t("settings.label.terminalOutputIndependentFromCodeBlocksAndDiffs")}
      defaultFamily={defaults.code}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal}
      value={settings.fontFamilyTerminal}
      onValueChange={(fontFamilyTerminal) => updateSettings({ fontFamilyTerminal })}
      onReset={() =>
        updateSettings({
          fontFamilyTerminal: DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal,
          fontSizeTerminal: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
        })
      }
      requireMonospace
      size={{
        label: t("settings.label.terminalFontSize"),
        min: MIN_TERMINAL_FONT_SIZE,
        max: MAX_TERMINAL_FONT_SIZE,
        value: settings.fontSizeTerminal,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
        onChange: (fontSizeTerminal) => updateSettings({ fontSizeTerminal }),
      }}
      preview={
        <TerminalFontPreview
          family={resolveTerminalFontPreference({
            advanced: true,
            code: settings.fontFamilyCode,
            terminal: settings.fontFamilyTerminal,
          })}
          size={settings.fontSizeTerminal}
        />
      }
    />
  );
}

function FontSmoothingRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  if (!isMacPlatform(navigator.platform)) return null;
  return (
    <SettingsRow
      {...searchableSetting("font-smoothing", t)}
      description={t("settings.label.useThinnerGrayscaleTextSmoothingInsteadOfTheMacos")}
      resetAction={
        settings.fontSmoothing !== DEFAULT_UNIFIED_SETTINGS.fontSmoothing ? (
          <SettingResetButton
            label={t("settings.option.fontSmoothing")}
            onClick={() =>
              updateSettings({ fontSmoothing: DEFAULT_UNIFIED_SETTINGS.fontSmoothing })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.fontSmoothing}
          onCheckedChange={(checked) => updateSettings({ fontSmoothing: Boolean(checked) })}
          aria-label={t("settings.option.fontSmoothing")}
        />
      }
    />
  );
}

function WordWrapRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("word-wrap", t)}
      description={t("settings.description.wrapLongLinesInCodeBlocksTablesDiffsAnd")}
      resetAction={
        settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap ? (
          <SettingResetButton
            label={t("settings.label.wordWrapping")}
            onClick={() => updateSettings({ wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap })}
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.wordWrap}
          onCheckedChange={(checked) => updateSettings({ wordWrap: Boolean(checked) })}
          aria-label={t("settings.label.wrapCodeTablesDiffsAndFilePreviewsByDefault")}
        />
      }
    />
  );
}

function FontSettingsGroup() {
  return (
    <>
      <InterfaceFontRow />
      <PromptFontRow />
      <CodeFontRow />
      <TerminalFontRow />
      <FontSmoothingRow />
    </>
  );
}

/**
 * The two-font view: one sans, one monospace. The prompt follows the
 * interface font and the terminal follows the monospace font, so the demos
 * under each row show every surface the choice reaches.
 */
function SimpleFontRows() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  return (
    <>
      <InterfaceFontRow preview={<PromptFontPreview />} />
      <CodeFontRow
        title={t("settings.option.monospaceFont")}
        description={t("settings.label.codeBlocksDiffsFilePreviewsAndTheTerminal")}
        preview={
          <>
            <CodeFontPreview />
            <TerminalFontPreview
              family={resolveTerminalFontPreference({
                advanced: false,
                code: settings.fontFamilyCode,
                terminal: settings.fontFamilyTerminal,
              })}
              size={resolveTerminalFontSizePreference({
                advanced: false,
                code: settings.fontSizeCode,
                terminal: settings.fontSizeTerminal,
              })}
            />
          </>
        }
      />
    </>
  );
}

// Font smoothing only renders on macOS, so a search jump to it elsewhere
// must not flip the section - the target would never mount to be scrolled to.
const ADVANCED_TYPOGRAPHY_TARGET_IDS: ReadonlySet<string> = new Set([
  "prompt-font",
  "terminal-font",
  ...(typeof navigator !== "undefined" && isMacPlatform(navigator.platform)
    ? ["font-smoothing"]
    : []),
]);

/**
 * The two-font view by default - one sans, one monospace, each cascading to
 * every surface it reaches - with an Advanced switch in the section header
 * that reveals the per-surface override rows. The choice persists locally,
 * and a settings-search jump to an override row flips Advanced on so the
 * target exists to scroll to.
 */
function TypographySection() {
  const { t } = useI18n();
  const [advanced, setAdvanced] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const searchTargetId = useSettingsSearchTargetId();
  // Flip Advanced on once per search jump so the hidden target can mount and
  // scroll; tracking the handled id lets the user turn it back off without
  // the still-set target immediately re-expanding the section.
  const lastExpandedTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (searchTargetId === null || !ADVANCED_TYPOGRAPHY_TARGET_IDS.has(searchTargetId)) return;
    if (lastExpandedTargetRef.current === searchTargetId) return;
    lastExpandedTargetRef.current = searchTargetId;
    setAdvanced(true);
  }, [searchTargetId, setAdvanced]);
  return (
    <SettingsSection
      id="typography"
      title={t("settings.label.typography")}
      headerAction={
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          {t("settings.label.advanced")}
          <Switch
            checked={advanced}
            onCheckedChange={(checked) => setAdvanced(Boolean(checked))}
            aria-label={t("settings.label.showAdvancedTypographySettings")}
          />
        </label>
      }
    >
      {advanced ? <FontSettingsGroup /> : <SimpleFontRows />}
      <WordWrapRow />
    </SettingsSection>
  );
}

function FontFamilySettingsRow({
  id,
  title,
  description,
  defaultFamily,
  defaultValue,
  preview,
  value,
  onValueChange,
  onReset,
  requireMonospace = false,
  size,
}: {
  id?: string;
  title: string;
  description: string;
  /** What an unset preference renders as, e.g. "Menlo". */
  defaultFamily: string;
  /** The persisted family value supplied by the unified settings defaults. */
  defaultValue: string;
  preview?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  onReset: () => void;
  requireMonospace?: boolean;
  size: {
    label: string;
    min: number;
    max: number;
    value: number;
    defaultValue: number;
    onChange: (v: number) => void;
  };
}) {
  const { t } = useI18n();
  const trimmed = value.trim();
  // The fallback input edits a draft; the preference only commits once typing
  // pauses and the text probes as an available font (or is an explicit
  // clear), so the current font holds and nothing reflows mid-word.
  const [draft, setDraft] = useState(value);
  const [draftSettled, setDraftSettled] = useState(true);
  const commitTimerRef = useRef<number | null>(null);
  const lastValueRef = useRef(value);
  if (lastValueRef.current !== value) {
    // The committed value changed externally (hydration, reset, picker
    // selection); adopt it and drop any pending commit of a stale draft.
    lastValueRef.current = value;
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setDraft(value);
    setDraftSettled(true);
  }
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    },
    [],
  );
  const acceptsFamily = (candidate: string) =>
    isFontFamilyAvailable(candidate) && (!requireMonospace || isMonospaceFamily(candidate));
  const commitDraft = (next: string) => {
    setDraftSettled(true);
    // A rejected name stays in the field, flagged: the terminal would silently
    // fall back to its default, so the row must not claim it took the value.
    if (next.trim().length === 0 || acceptsFamily(next)) {
      onValueChange(next);
    }
  };
  const flushDraft = () => {
    if (commitTimerRef.current === null) return;
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    commitDraft(draft);
  };
  const draftTrimmed = draft.trim();
  // Flag an unknown name only once typing pauses, and never for an empty
  // field - that is the starting state, not a rejected entry.
  const draftPending = draftSettled && draftTrimmed.length > 0 && draftTrimmed !== trimmed;
  const resetToDefault = () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setDraft(defaultValue);
    setDraftSettled(true);
    onReset();
  };
  const resetAction =
    value !== defaultValue || size.value !== size.defaultValue ? (
      <SettingResetButton label={title.toLowerCase()} onClick={resetToDefault} />
    ) : null;
  const fontEnumeration = useFontEnumeration();
  // Everyone starts on the plain input; focusing it is the user gesture that
  // runs font discovery. Where the engine can enumerate, the control then
  // upgrades to the picker - popped open when the swap happens under focus,
  // so the interaction continues without a second click.
  const inputFocusedRef = useRef(false);
  const familyControl =
    fontEnumeration.status === "granted" ? (
      <FontFamilyPicker
        ariaLabel={t("settings.font.family", { title })}
        defaultFamily={defaultFamily}
        selectedFamily={trimmed}
        requireMonospace={requireMonospace}
        initialOpen={inputFocusedRef.current}
        onSelect={onValueChange}
      />
    ) : (
      <Input
        size="sm"
        aria-label={t("settings.font.family", { title })}
        aria-invalid={draftPending || undefined}
        autoCapitalize="off"
        autoComplete="off"
        className="min-w-0 flex-1"
        maxLength={200}
        onFocus={() => {
          inputFocusedRef.current = true;
          discoverInstalledFonts();
        }}
        onBlur={() => {
          inputFocusedRef.current = false;
          flushDraft();
        }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          setDraftSettled(false);
          if (commitTimerRef.current !== null) {
            window.clearTimeout(commitTimerRef.current);
          }
          commitTimerRef.current = window.setTimeout(() => {
            commitTimerRef.current = null;
            commitDraft(next);
          }, 400);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") flushDraft();
          if (event.key === "Escape") {
            // Discard uncommitted typing without closing the settings page,
            // which is what an unhandled Escape does.
            event.preventDefault();
            event.stopPropagation();
            if (commitTimerRef.current !== null) {
              window.clearTimeout(commitTimerRef.current);
              commitTimerRef.current = null;
            }
            setDraft(value);
            setDraftSettled(true);
          }
        }}
        placeholder={defaultFamily}
        spellCheck={false}
        value={draft}
      />
    );
  const control = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">{familyControl}</div>
      <Select
        value={String(size.value)}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          const parsed = Number(next);
          if (Number.isInteger(parsed) && parsed >= size.min && parsed <= size.max) {
            size.onChange(parsed);
          }
        }}
      >
        <SelectTrigger size="sm" className="w-22 shrink-0" aria-label={size.label}>
          <SelectValue>{size.value} px</SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          {Array.from({ length: size.max - size.min + 1 }, (_, index) => size.min + index).map(
            (px) => (
              <SelectItem hideIndicator key={px} value={String(px)}>
                {px} px
              </SelectItem>
            ),
          )}
        </SelectPopup>
      </Select>
    </div>
  );
  return (
    <SettingsRow
      {...(id !== undefined ? { id } : {})}
      title={title}
      description={description}
      resetAction={resetAction}
      control={control}
    >
      {preview}
    </SettingsRow>
  );
}

const AUTO_SETTLE_DEFAULT_DAYS = DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ?? 3;

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  const { t } = useI18n();
  // Local draft so the field can be emptied mid-edit; the setting only moves
  // on valid input and snaps back to the persisted value on blur.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      size="sm"
      type="number"
      min={MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      max={MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        // Number(), not parseInt: "3.5" must be rejected (not truncated to a
        // committed 3 while the field shows 3.5) — commit only when the
        // persisted value matches the displayed one.
        const parsed = Number(event.target.value);
        if (
          Number.isInteger(parsed) &&
          parsed >= MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS &&
          parsed <= MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label={t("settings.label.daysOfInactivityBeforeAutoSettle")}
    />
  );
}

// The legacy rows sit behind the fold, so a settings-search jump has to
// expand the section before its target can mount and scroll.
const LEGACY_FEATURE_TARGET_IDS: ReadonlySet<string> = new Set([
  "legacy-plan-mode",
  "legacy-context-window-indicator",
  "legacy-sidebar",
]);

/**
 * Retired features kept only for users who still depend on them. Collapsed by
 * default so they stay out of the everyday settings path; a settings-search
 * jump to one of the rows unfolds the section.
 */
function LegacyFeaturesSection() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const [open, setOpen] = useState(false);
  const searchTargetId = useSettingsSearchTargetId();
  const targetRef = useSettingsSearchTarget<HTMLElement>("legacy-features");
  // Unfold once per search jump; tracking the handled id lets the user fold
  // the section back up without the still-set target immediately reopening it.
  const lastExpandedTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (searchTargetId === null) {
      // A handled jump clears the target; forgetting it here lets a later
      // jump to the same row expand the section again.
      lastExpandedTargetRef.current = null;
      return;
    }
    if (!LEGACY_FEATURE_TARGET_IDS.has(searchTargetId)) return;
    if (lastExpandedTargetRef.current === searchTargetId) return;
    lastExpandedTargetRef.current = searchTargetId;
    setOpen(true);
  }, [searchTargetId]);

  return (
    <section id="legacy-features" ref={targetRef} tabIndex={-1} className="space-y-2.5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex min-h-8 w-full items-center gap-2 px-3 sm:px-4">
          <h2 className="text-sm font-normal text-foreground/70 transition-colors group-hover:text-foreground">
            {t("settings.label.legacyFeatures")}
          </h2>
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-90" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SettingsGroup>
            <SettingsRow
              {...searchableSetting("legacy-plan-mode", t)}
              description={t("settings.label.restoreBuildPlanPlanDefaultAndShiftTabOff")}
              control={
                <Switch
                  checked={settings.planModeEnabled}
                  onCheckedChange={(checked) => {
                    updateSettings({ planModeEnabled: Boolean(checked) });
                  }}
                  aria-label={t("settings.option.legacyPlanMode")}
                />
              }
            />
            <SettingsRow
              {...searchableSetting("legacy-context-window-indicator", t)}
              description={t("settings.label.showsContextWindowUsageAsACircularIndicatorIn")}
              control={
                <Switch
                  checked={settings.contextWindowMeterEnabled}
                  onCheckedChange={(checked) =>
                    updateSettings({ contextWindowMeterEnabled: Boolean(checked) })
                  }
                  aria-label={t("settings.label.contextWindowIndicatorLegacy")}
                />
              }
            />
            <SettingsRow
              {...searchableSetting("legacy-sidebar", t)}
              description={t("settings.label.restorePerProjectThreadTreesInsteadOfTheDefault")}
              control={
                <Switch
                  checked={settings.legacySidebarEnabled}
                  onCheckedChange={(checked) =>
                    updateSettings({ legacySidebarEnabled: Boolean(checked) })
                  }
                  aria-label={t("settings.option.legacySidebar")}
                />
              }
            />
          </SettingsGroup>
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}

export function GeneralSettingsPanel() {
  const { t } = useI18n();
  const modifierLabel = isMacPlatform(navigator.platform) ? "⌘" : "Ctrl";
  const sendShortcutOptions = [
    { value: "enter", label: "Enter" },
    {
      value: "mod-enter-multiline",
      label: t("settings.send.multiline", { modifier: modifierLabel }),
    },
    { value: "mod-enter", label: t("settings.send.always", { modifier: modifierLabel }) },
  ] as const;
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const { scope, environment, connectedEnvironments } = useSettingsScope();
  // The representative environment supplies the provider list for pickers;
  // a fanned-out model choice is validated against every target before it
  // is written. Per-machine tuning (background activity overrides) still
  // needs exactly one environment.
  const environmentId = environment?.environmentId ?? null;
  const isEnvironmentScope = scope.environmentIds.length === 1 && environmentId !== null;
  const hasServerTargets = connectedEnvironments.length > 0;
  const [backgroundActivityDialogOpen, setBackgroundActivityDialogOpen] = useState(false);
  const [tokenStreamingWarningOpen, setTokenStreamingWarningOpen] = useState(false);
  const mixedResponseStreamingMode = useScopedSettingsMixed(["responseStreamingMode"]);
  const lastEnabledProjectGroupingMode = useRef<SidebarProjectGroupingMode>(
    readLastEnabledProjectGroupingMode(),
  );
  const serverProviders = environment?.serverConfig?.providers ?? EMPTY_SERVER_PROVIDERS;
  const supportsAutoSettlement =
    connectedEnvironments.length > 0 &&
    connectedEnvironments.every(
      (target) => target.serverConfig?.environment.capabilities.threadAutoSettlement === true,
    );
  const supportsRestartContinuation =
    connectedEnvironments.length > 0 &&
    connectedEnvironments.every(
      (target) => target.serverConfig?.environment.capabilities.threadRestartContinuation === true,
    );

  const textGenerationProviders = serverProviders.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const textGenerationModelSelection = resolveAppModelSelectionState(
    settings,
    textGenerationProviders,
  );
  const textGenInstanceId = textGenerationModelSelection.instanceId;
  const textGenModel = textGenerationModelSelection.model;
  const textGenModelOptions = textGenerationModelSelection.options;
  const textGenerationModelInstanceEntries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(textGenerationProviders), settings),
  );
  const hasTextGenerationProvider = textGenerationModelInstanceEntries.some(
    (entry) => entry.enabled && entry.isAvailable,
  );
  const textGenInstanceEntry = textGenerationModelInstanceEntries.find(
    (entry) => entry.instanceId === textGenInstanceId,
  );
  const textGenProvider: ProviderDriverKind =
    textGenInstanceEntry?.driverKind ?? DEFAULT_DRIVER_KIND;
  const textGenerationModelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    textGenInstanceId,
    textGenModel,
  );
  const isTextGenerationModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const textGenerationModelDisabledReason = useScopedModelDisabledReason(
    settings,
    textGenerationModelInstanceEntries,
  );
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const activeBackgroundActivityProfile = resolvedBackgroundActivity.profile;
  const backgroundActivityProfileOption = resolveBackgroundActivityProfileOption(settings);
  const mixedBackgroundActivity = useScopedSettingsMixed(["backgroundActivity"]);
  const mixedAddProjectBaseDirectory = useScopedSettingsMixed(["addProjectBaseDirectory"]);
  const mixedTextGenerationModel = useScopedSettingsMixed(["textGenerationModelSelection"]);
  const backgroundActivityDescription =
    backgroundActivityProfileOption === "advanced"
      ? t("settings.background.customDescription", {
          profile: t(BACKGROUND_ACTIVITY_PROFILE_LABELS[activeBackgroundActivityProfile]),
        })
      : t(BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS[resolvedBackgroundActivity.profile]);
  const canResetBackgroundActivity = !Equal.equals(
    settings.backgroundActivity,
    DEFAULT_UNIFIED_SETTINGS.backgroundActivity,
  );

  return (
    <SettingsPageContainer>
      <ProjectDefaultsSettings category="general" />
      <SettingsSection id="organization" title={t("settings.label.organization")}>
        <SettingsRow
          {...searchableSetting("project-grouping", t)}
          description={t("settings.label.combineMatchingRepositoriesAcrossEnvironments")}
          resetAction={
            settings.sidebarProjectGroupingMode !==
            DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode ? (
              <SettingResetButton
                label={t("settings.label.projectGrouping")}
                onClick={() =>
                  updateSettings({
                    sidebarProjectGroupingMode: DEFAULT_UNIFIED_SETTINGS.sidebarProjectGroupingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={isProjectGroupingEnabled(settings.sidebarProjectGroupingMode)}
              onCheckedChange={(checked) => {
                if (!checked && settings.sidebarProjectGroupingMode !== "separate") {
                  lastEnabledProjectGroupingMode.current = settings.sidebarProjectGroupingMode;
                  rememberEnabledProjectGroupingMode(settings.sidebarProjectGroupingMode);
                }
                updateSettings({
                  sidebarProjectGroupingMode: projectGroupingModeFromToggle(
                    checked,
                    lastEnabledProjectGroupingMode.current,
                  ),
                });
              }}
              aria-label={t("settings.option.projectGrouping")}
            />
          }
        />

        {supportsAutoSettlement ? (
          <>
            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleOnMerge"]}
              {...searchableSetting("auto-settle-merged-threads", t)}
              description={t("settings.description.settleAThreadWhenItsPullRequestMergesClosed")}
              resetAction={
                settings.sidebarAutoSettleOnMerge !==
                DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge ? (
                  <SettingResetButton
                    label={t("settings.label.autoSettleOnMerge")}
                    onClick={() =>
                      updateSettings({
                        sidebarAutoSettleOnMerge: DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleOnMerge,
                      })
                    }
                  />
                ) : null
              }
              control={
                <ScopedSwitch
                  settingKeys={["sidebarAutoSettleOnMerge"]}
                  checked={settings.sidebarAutoSettleOnMerge}
                  onCheckedChange={(checked) =>
                    updateSettings({ sidebarAutoSettleOnMerge: Boolean(checked) })
                  }
                  aria-label={t("settings.option.autoSettleMergedThreads")}
                />
              }
            />

            <SettingsRow
              serverScoped
              settingKeys={["sidebarAutoSettleAfterDays"]}
              {...searchableSetting("auto-settle-inactive-threads", t)}
              description={t("settings.label.sidebarThreadsWithNoActivityForThisLongSettle")}
              resetAction={
                settings.sidebarAutoSettleAfterDays !==
                DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays ? (
                  <SettingResetButton
                    label={t("settings.label.autoSettle")}
                    onClick={() =>
                      updateSettings({
                        sidebarAutoSettleAfterDays:
                          DEFAULT_UNIFIED_SETTINGS.sidebarAutoSettleAfterDays,
                      })
                    }
                  />
                ) : null
              }
              control={
                <ScopedSwitch
                  settingKeys={["sidebarAutoSettleAfterDays"]}
                  checked={settings.sidebarAutoSettleAfterDays !== null}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      sidebarAutoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                    })
                  }
                  aria-label={t("settings.option.autoSettleInactiveThreads")}
                />
              }
            />
            {settings.sidebarAutoSettleAfterDays !== null ? (
              <SettingsRow
                serverScoped
                settingKeys={["sidebarAutoSettleAfterDays"]}
                title={searchableSetting("days-before-auto-settle", t).title}
                description={t("settings.label.anyNewActivityUnSettlesAThreadAutomatically")}
                control={
                  <AutoSettleDaysInput
                    value={settings.sidebarAutoSettleAfterDays}
                    onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                  />
                }
              />
            ) : null}
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection id="behavior" title={t("settings.label.behavior")}>
        <NotificationSettings />
        <SettingsRow
          {...searchableSetting("in-app-notifications", t)}
          description={t("settings.description.showAToastWhenAnotherThreadFinishesFailsOr")}
          control={
            <Switch
              checked={settings.inAppNotificationsEnabled}
              onCheckedChange={(checked) => updateSettings({ inAppNotificationsEnabled: checked })}
              aria-label={t("settings.label.inAppNotifications")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("time-format", t)}
          description={t("settings.label.systemDefaultFollowsYourBrowserOrOsClockPreference")}
          resetAction={
            settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
              <SettingResetButton
                label={t("settings.option.timeFormat")}
                onClick={() =>
                  updateSettings({
                    timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.timestampFormat}
              onValueChange={(value) => {
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t("settings.label.timestampFormat")}
              >
                <SelectValue>{t(TIMESTAMP_FORMAT_LABELS[settings.timestampFormat])}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="locale">
                  {t(TIMESTAMP_FORMAT_LABELS.locale)}
                </SelectItem>
                <SelectItem hideIndicator value="12-hour">
                  {t(TIMESTAMP_FORMAT_LABELS["12-hour"])}
                </SelectItem>
                <SelectItem hideIndicator value="24-hour">
                  {t(TIMESTAMP_FORMAT_LABELS["24-hour"])}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["responseStreamingMode"]}
          {...searchableSetting("response-streaming", t)}
          description={
            mixedResponseStreamingMode
              ? t("settings.label.theSelectedTargetsUseDifferentStreamingModes")
              : t(RESPONSE_STREAMING_MODE_DESCRIPTIONS[settings.responseStreamingMode])
          }
          resetAction={
            settings.responseStreamingMode !== DEFAULT_UNIFIED_SETTINGS.responseStreamingMode ? (
              <SettingResetButton
                label={t("settings.label.responseStreaming")}
                onClick={() =>
                  updateSettings({
                    responseStreamingMode: DEFAULT_UNIFIED_SETTINGS.responseStreamingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <>
              <Select
                value={mixedResponseStreamingMode ? null : settings.responseStreamingMode}
                onValueChange={(value) => {
                  if (value === "token") {
                    // The legacy path needs an explicit confirmation.
                    setTokenStreamingWarningOpen(true);
                    return;
                  }
                  if (value === "turn" || value === "paragraph") {
                    updateSettings({ responseStreamingMode: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-56"
                  aria-label={t("settings.label.responseStreaming")}
                >
                  <SelectValue>
                    {(value: ResponseStreamingMode | null) =>
                      value === null
                        ? t("settings.label.mixed")
                        : t(RESPONSE_STREAMING_MODE_LABELS[value])
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="turn">
                    {t(RESPONSE_STREAMING_MODE_LABELS.turn)}
                  </SelectItem>
                  <SelectItem hideIndicator value="paragraph">
                    {t(RESPONSE_STREAMING_MODE_LABELS.paragraph)}
                  </SelectItem>
                  <SelectItem hideIndicator value="token">
                    {t(RESPONSE_STREAMING_MODE_LABELS.token)}
                  </SelectItem>
                </SelectPopup>
              </Select>
              <TokenStreamingWarningDialog
                open={tokenStreamingWarningOpen}
                onOpenChange={setTokenStreamingWarningOpen}
                onConfirm={() => {
                  updateSettings({ responseStreamingMode: "token" });
                  setTokenStreamingWarningOpen(false);
                }}
                onUseParagraphs={() => {
                  updateSettings({ responseStreamingMode: "paragraph" });
                  setTokenStreamingWarningOpen(false);
                }}
              />
            </>
          }
        />
        <SettingsRow
          {...searchableSetting("hide-whitespace-changes", t)}
          description={t("settings.label.setWhetherTheDiffPanelIgnoresWhitespaceOnlyEdits")}
          resetAction={
            settings.diffIgnoreWhitespace !== DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace ? (
              <SettingResetButton
                label={t("settings.label.diffWhitespaceChanges")}
                onClick={() =>
                  updateSettings({
                    diffIgnoreWhitespace: DEFAULT_UNIFIED_SETTINGS.diffIgnoreWhitespace,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.diffIgnoreWhitespace}
              onCheckedChange={(checked) =>
                updateSettings({ diffIgnoreWhitespace: Boolean(checked) })
              }
              aria-label={t("settings.label.hideWhitespaceChangesByDefault")}
            />
          }
        />
        <SettingsRow
          {...searchableSetting("default-diff-file-state", t)}
          description={t("settings.description.startWithFilesExpandedOrCollapsedWhenOpeningDiffs")}
          resetAction={
            settings.diffFilesCollapsed !== DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed ? (
              <SettingResetButton
                label={t("settings.label.defaultDiffFileState")}
                onClick={() =>
                  updateSettings({
                    diffFilesCollapsed: DEFAULT_UNIFIED_SETTINGS.diffFilesCollapsed,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffFilesCollapsed ? "collapsed" : "expanded"}
              onValueChange={(value) => {
                if (value === "expanded" || value === "collapsed") {
                  updateSettings({ diffFilesCollapsed: value === "collapsed" });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t("settings.label.defaultDiffFileState")}
              >
                <SelectValue>
                  {settings.diffFilesCollapsed
                    ? t("settings.label.collapsed")
                    : t("settings.label.expanded")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="expanded">
                  {t("settings.label.expanded")}
                </SelectItem>
                <SelectItem hideIndicator value="collapsed">
                  {t("settings.label.collapsed")}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          {...searchableSetting("diff-layout", t)}
          description={t("settings.description.showDiffsStackedOrSideBySideTheToggle")}
          resetAction={
            settings.diffLayout !== DEFAULT_UNIFIED_SETTINGS.diffLayout ? (
              <SettingResetButton
                label={t("settings.label.diffLayout")}
                onClick={() => updateSettings({ diffLayout: DEFAULT_UNIFIED_SETTINGS.diffLayout })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.diffLayout}
              onValueChange={(value) => {
                if (value === "stacked" || value === "split") {
                  updateSettings({ diffLayout: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-40"
                aria-label={t("settings.label.diffLayout")}
              >
                <SelectValue>{t(DIFF_LAYOUT_LABELS[settings.diffLayout])}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="stacked">
                  {t(DIFF_LAYOUT_LABELS.stacked)}
                </SelectItem>
                <SelectItem hideIndicator value="split">
                  {t(DIFF_LAYOUT_LABELS.split)}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("proactive-panels", t)}
          description={t("settings.description.openLinkedPullRequestsFirstOtherwiseOpenTheWorking")}
          resetAction={
            settings.proactivePanelsEnabled !== DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled ? (
              <SettingResetButton
                label={t("settings.label.proactivePanels")}
                onClick={() =>
                  updateSettings({
                    proactivePanelsEnabled: DEFAULT_UNIFIED_SETTINGS.proactivePanelsEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.proactivePanelsEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ proactivePanelsEnabled: Boolean(checked) })
              }
              aria-label={t("settings.label.proactivePanels")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("skills-in-slash-menu", t)}
          description={t("settings.description.alsoIncludeSkillsInTheCommandMenuSkillsAlways")}
          resetAction={
            settings.showSkillsInSlashMenu !== DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu ? (
              <SettingResetButton
                label={t("settings.label.skillsInSlashMenu")}
                onClick={() =>
                  updateSettings({
                    showSkillsInSlashMenu: DEFAULT_UNIFIED_SETTINGS.showSkillsInSlashMenu,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.showSkillsInSlashMenu}
              onCheckedChange={(checked) =>
                updateSettings({ showSkillsInSlashMenu: Boolean(checked) })
              }
              aria-label={t("settings.option.skillsInSlashMenu")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("composer-rich-text", t)}
          description={t("settings.label.showFormattedMarkdownAsYouType")}
          resetAction={
            settings.composerRichTextEnabled !==
            DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled ? (
              <SettingResetButton
                label={t("settings.label.richTextComposer")}
                onClick={() =>
                  updateSettings({
                    composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerRichTextEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ composerRichTextEnabled: Boolean(checked) })
              }
              aria-label={t("settings.label.richTextComposer")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("composer-collapse", t)}
          description={t("settings.description.restTheComposerOfAnExistingThreadIntoA")}
          resetAction={
            settings.composerCollapseOnScroll !==
            DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll ? (
              <SettingResetButton
                label={t("settings.label.collapseComposerOnScroll")}
                onClick={() =>
                  updateSettings({
                    composerCollapseOnScroll: DEFAULT_UNIFIED_SETTINGS.composerCollapseOnScroll,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.composerCollapseOnScroll}
              onCheckedChange={(checked) =>
                updateSettings({ composerCollapseOnScroll: Boolean(checked) })
              }
              aria-label={t("settings.label.collapseComposerOnScroll")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("send-shortcut", t)}
          description={t("settings.label.chooseWhenEnterSendsAPromptOrInsertsA")}
          resetAction={
            settings.sendShortcut !== DEFAULT_UNIFIED_SETTINGS.sendShortcut ? (
              <SettingResetButton
                label={t("settings.label.sendShortcut")}
                onClick={() =>
                  updateSettings({ sendShortcut: DEFAULT_UNIFIED_SETTINGS.sendShortcut })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.sendShortcut}
              onValueChange={(value) => {
                const option = sendShortcutOptions.find((option) => option.value === value);
                if (option) updateSettings({ sendShortcut: option.value });
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-auto min-w-0 max-w-full"
                aria-label={t("settings.label.sendShortcut")}
              >
                <SelectValue>
                  {
                    sendShortcutOptions.find((option) => option.value === settings.sendShortcut)
                      ?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {sendShortcutOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center justify-between gap-4">
                      {option.label}
                      {settings.sendShortcut === option.value && <CheckIcon aria-hidden="true" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          {...searchableSetting("follow-up-behavior", t)}
          description={
            settings.sendShortcut === "mod-enter-multiline"
              ? t("settings.followUp.multilineDescription", { modifier: modifierLabel })
              : t("settings.followUp.description", {
                  shortcut: `${modifierLabel}${settings.sendShortcut === "mod-enter" ? " + Shift" : ""}`,
                })
          }
          resetAction={
            settings.followUpBehavior !== DEFAULT_UNIFIED_SETTINGS.followUpBehavior ? (
              <SettingResetButton
                label={t("settings.label.followUpBehavior")}
                onClick={() =>
                  updateSettings({
                    followUpBehavior: DEFAULT_UNIFIED_SETTINGS.followUpBehavior,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.followUpBehavior}
              onValueChange={(value) => {
                if (value === "queue" || value === "steer") {
                  updateSettings({ followUpBehavior: value });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-auto min-w-0"
                aria-label={t("settings.label.followUpBehavior")}
              >
                <SelectValue>
                  {settings.followUpBehavior === "queue"
                    ? t("settings.label.queue")
                    : t("settings.label.steer")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="queue">{t("settings.label.queue")}</SelectItem>
                <SelectItem value="steer">{t("settings.label.steer")}</SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          serverScoped
          settingKeys={["enableProviderUpdateChecks"]}
          {...searchableSetting("provider-update-checks", t)}
          description={t("settings.label.checkInstalledProviderClisForNewerAvailableVersions")}
          resetAction={
            settings.enableProviderUpdateChecks !==
            DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks ? (
              <SettingResetButton
                label={t("settings.option.providerUpdateChecks")}
                onClick={() =>
                  updateSettings({
                    enableProviderUpdateChecks: DEFAULT_UNIFIED_SETTINGS.enableProviderUpdateChecks,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["enableProviderUpdateChecks"]}
              checked={settings.enableProviderUpdateChecks}
              onCheckedChange={(checked) =>
                updateSettings({ enableProviderUpdateChecks: Boolean(checked) })
              }
              aria-label={t("settings.label.checkProviderVersions")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("continue-threads-after-server-update", t)}
          serverScoped
          settingKeys={["continueThreadsAfterServerUpdate"]}
          description={t(
            "settings.description.automaticallyResumeInterruptedThreadsAfterAnUpdateCrashOr",
          )}
          status={
            !supportsRestartContinuation
              ? t("settings.label.allSelectedConnectedEnvironmentsMustSupportRestartContinuation")
              : undefined
          }
          resetAction={
            supportsRestartContinuation &&
            settings.continueThreadsAfterServerUpdate !==
              DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate ? (
              <SettingResetButton
                label={t("settings.label.continueThreadsAfterRestarts")}
                onClick={() =>
                  updateSettings({
                    continueThreadsAfterServerUpdate:
                      DEFAULT_UNIFIED_SETTINGS.continueThreadsAfterServerUpdate,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["continueThreadsAfterServerUpdate"]}
              checked={settings.continueThreadsAfterServerUpdate}
              disabled={!supportsRestartContinuation}
              onCheckedChange={(checked) =>
                updateSettings({ continueThreadsAfterServerUpdate: Boolean(checked) })
              }
              aria-label={t("settings.label.continueThreadsAfterRestarts")}
            />
          }
        />

        <SettingsRow
          serverScoped
          settingKeys={["backgroundActivity"]}
          id={searchableSetting("background-activity", t).id}
          title={
            <span className="inline-flex items-center gap-1.5">
              {searchableSetting("background-activity", t).title}
              <PolicyTooltip>
                {t("settings.description.thisSharedPolicyGatesBackgroundWorkSuchAsGit")}
              </PolicyTooltip>
            </span>
          }
          description={backgroundActivityDescription}
          resetAction={
            canResetBackgroundActivity ? (
              <SettingResetButton
                label={t("settings.label.backgroundActivity")}
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
                  if (
                    value === "balanced" ||
                    value === "performance" ||
                    value === "battery-saver"
                  ) {
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
                      value === null
                        ? t("settings.label.mixed")
                        : t(BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS[value])
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="balanced">
                    {t(BACKGROUND_ACTIVITY_PROFILE_LABELS.balanced)}
                  </SelectItem>
                  <SelectItem hideIndicator value="performance">
                    {t(BACKGROUND_ACTIVITY_PROFILE_LABELS.performance)}
                  </SelectItem>
                  <SelectItem hideIndicator value="battery-saver">
                    {t(BACKGROUND_ACTIVITY_PROFILE_LABELS["battery-saver"])}
                  </SelectItem>
                  <SelectItem hideIndicator value="advanced" disabled={!isEnvironmentScope}>
                    {isEnvironmentScope
                      ? t(BACKGROUND_ACTIVITY_PROFILE_OPTION_LABELS.advanced)
                      : t("settings.background.advancedSingleEnvironment")}
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
      </SettingsSection>

      <SettingsSection id="projects-and-threads" title={t("settings.label.projectsThreads")}>
        <SettingsRow
          serverScoped
          settingKeys={["newWorktreesStartFromOrigin"]}
          {...searchableSetting("start-from-origin", t)}
          description={t("branchToolbar.worktreeFromOriginHint")}
          resetAction={
            settings.newWorktreesStartFromOrigin !==
            DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin ? (
              <SettingResetButton
                label={t("settings.label.newWorktreesStartFromOrigin")}
                onClick={() =>
                  updateSettings({
                    newWorktreesStartFromOrigin:
                      DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
                  })
                }
              />
            ) : null
          }
          control={
            <ScopedSwitch
              settingKeys={["newWorktreesStartFromOrigin"]}
              checked={settings.newWorktreesStartFromOrigin}
              onCheckedChange={(checked) =>
                updateSettings({ newWorktreesStartFromOrigin: Boolean(checked) })
              }
              aria-label={t("settings.label.startNewWorktreesFromOriginByDefault")}
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["addProjectBaseDirectory"]}
          {...searchableSetting("add-project-starts-in", t)}
          description={t("settings.label.leaveEmptyToUseWhenTheAddProjectBrowser")}
          resetAction={
            settings.addProjectBaseDirectory !==
            DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory ? (
              <SettingResetButton
                label={t("settings.label.addProjectBaseDirectory")}
                onClick={() =>
                  updateSettings({
                    addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
                  })
                }
              />
            ) : null
          }
          control={
            <DraftInput
              size="sm"
              className="w-full sm:w-72"
              value={mixedAddProjectBaseDirectory ? "" : settings.addProjectBaseDirectory}
              onCommit={(next) => updateSettings({ addProjectBaseDirectory: next })}
              placeholder={mixedAddProjectBaseDirectory ? t("settings.label.mixed") : "~/"}
              spellCheck={false}
              aria-label={t("settings.label.addProjectBaseDirectory")}
            />
          }
        />
      </SettingsSection>

      <SettingsSection id="confirmations" title={t("settings.label.confirmations")}>
        <SettingsRow
          {...searchableSetting("unpin-confirmation", t)}
          description={t("settings.label.askBeforeUnpinningAThreadFromThePinnedSection")}
          resetAction={
            settings.confirmThreadUnpin !== DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin ? (
              <SettingResetButton
                label={t("settings.label.unpinConfirmation")}
                onClick={() =>
                  updateSettings({
                    confirmThreadUnpin: DEFAULT_UNIFIED_SETTINGS.confirmThreadUnpin,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadUnpin}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadUnpin: Boolean(checked) })
              }
              aria-label={t("settings.label.confirmThreadUnpinning")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("archive-confirmation", t)}
          description={t("settings.description.requireASecondClickOnTheInlineArchiveAction")}
          resetAction={
            settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive ? (
              <SettingResetButton
                label={t("settings.option.archiveConfirmation")}
                onClick={() =>
                  updateSettings({
                    confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadArchive}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadArchive: Boolean(checked) })
              }
              aria-label={t("settings.label.confirmThreadArchiving")}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("delete-confirmation", t)}
          description={t("settings.label.askBeforeDeletingAThreadAndItsChatHistory")}
          resetAction={
            settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete ? (
              <SettingResetButton
                label={t("settings.option.deleteConfirmation")}
                onClick={() =>
                  updateSettings({
                    confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadDelete}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadDelete: Boolean(checked) })
              }
              aria-label={t("settings.label.confirmThreadDeletion")}
            />
          }
        />

        {isElectron ? (
          <SettingsRow
            {...searchableSetting("quit-confirmation", t)}
            description={t("settings.label.holdModeAlsoQuitsOnTwoQuickPresses")}
            resetAction={
              settings.confirmQuit !== DEFAULT_UNIFIED_SETTINGS.confirmQuit ? (
                <SettingResetButton
                  label={t("settings.label.quitShortcutBehavior")}
                  onClick={() =>
                    updateSettings({ confirmQuit: DEFAULT_UNIFIED_SETTINGS.confirmQuit })
                  }
                />
              ) : null
            }
            control={
              <Select
                value={settings.confirmQuit}
                onValueChange={(value) => {
                  if (value === "direct" || value === "hold" || value === "double-click") {
                    updateSettings({ confirmQuit: value });
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={t("settings.quit.shortcutBehavior")}
                >
                  <SelectValue>
                    {t(QUIT_CONFIRMATION_MODE_LABELS[settings.confirmQuit])}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {Object.entries(QUIT_CONFIRMATION_MODE_LABELS).map(([value, label]) => (
                    <SelectItem hideIndicator key={value} value={value}>
                      {t(label)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection id="text-generation" title={t("settings.label.textGeneration")}>
        <SettingsRow
          serverScoped
          settingKeys={["textGenerationModelSelection"]}
          {...searchableSetting("text-generation-model", t)}
          description={t("settings.description.usedForThreadTitlesAndOtherGeneratedTextOn")}
          resetAction={
            hasServerTargets && isTextGenerationModelDirty ? (
              <SettingResetButton
                label={t("settings.option.textGenerationModel")}
                onClick={() =>
                  updateSettings({
                    textGenerationModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            !hasServerTargets ? (
              <span className="text-sm text-muted-foreground">
                {t("settings.label.connectAnEnvironmentToChooseItsTextGenerationModel")}
              </span>
            ) : !hasTextGenerationProvider ? (
              <span className="text-sm text-muted-foreground">
                {t("settings.label.noTextGenerationProvidersAvailable")}
              </span>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <ProviderModelPicker
                  activeInstanceId={textGenInstanceId}
                  model={textGenModel}
                  lockedProvider={null}
                  instanceEntries={textGenerationModelInstanceEntries}
                  modelOptionsByInstance={textGenerationModelOptionsByInstance}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  {...(mixedTextGenerationModel ? { triggerLabel: t("settings.label.mixed") } : {})}
                  getModelDisabledReason={textGenerationModelDisabledReason}
                  {...(environmentId
                    ? {
                        onOpenProviderSetup: (instanceId: ProviderInstanceId) => {
                          void navigate({
                            to: "/settings/providers",
                            search: { environmentId, instanceId },
                          });
                        },
                      }
                    : {})}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = textGenerationModelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: t("settings.label.textGenerationModelNotSaved"),
                        description: reason,
                      });
                      return;
                    }
                    updateSettings({
                      textGenerationModelSelection: resolveAppModelSelectionState(
                        {
                          ...settings,
                          textGenerationModelSelection: createModelSelection(instanceId, model),
                        },
                        textGenerationProviders,
                      ),
                    });
                  }}
                />
                {textGenInstanceEntry ? (
                  <TraitsPicker
                    provider={textGenProvider}
                    models={
                      // Use the exact instance's models (rather than the
                      // first-kind-match) so a custom text-gen instance like
                      // `codex_personal` gets its own model list, not the
                      // default Codex one.
                      textGenInstanceEntry?.models ?? []
                    }
                    model={textGenModel}
                    prompt=""
                    onPromptChange={() => {}}
                    modelOptions={textGenModelOptions}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={settings.planModeEnabled}
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(nextOptions) => {
                      updateSettings({
                        textGenerationModelSelection: resolveAppModelSelectionState(
                          {
                            ...settings,
                            textGenerationModelSelection: createModelSelection(
                              textGenInstanceId,
                              textGenModel,
                              nextOptions,
                            ),
                          },
                          textGenerationProviders,
                        ),
                      });
                    }}
                  />
                ) : null}
              </div>
            )
          }
        />
      </SettingsSection>

      <SettingsSection id="about" title={t("settings.section.about")}>
        {isElectron || HOSTED_APP_CHANNEL ? (
          <AboutVersionSection />
        ) : (
          <SettingsRow
            title={<AboutVersionTitle />}
            description={t("settings.label.currentVersionOfTheApplication")}
          />
        )}
      </SettingsSection>
      <SettingsSection title={t("settings.option.diagnostics")}>
        <SettingsRow
          {...searchableSetting("diagnostics", t)}
          description={
            isEnvironmentScope
              ? t("settings.label.inspectProcessesResourceUseAndLogsOnThisEnvironment")
              : t("settings.label.inspectProcessesResourceUseAndLogsOnOneEnvironment")
          }
          control={
            <Button
              render={
                <Link to="/settings/diagnostics" search={{ machine: environmentId ?? undefined }} />
              }
              size="sm"
              variant="outline"
            >
              {t("settings.label.viewDiagnostics")}
            </Button>
          }
        />
        <SettingsRow
          {...searchableSetting("open-source-licenses", t)}
          description={t("settings.label.noticesForDependenciesAssetsAndOptionalToolsUsedBy")}
          control={
            <Button
              render={<Link to="/settings/open-source-licenses" />}
              size="sm"
              variant="outline"
            >
              {t("settings.label.viewLicenses")}
            </Button>
          }
        />
      </SettingsSection>

      <LegacyFeaturesSection />
    </SettingsPageContainer>
  );
}

export function ArchivedThreadsPanel() {
  const { t } = useI18n();
  const { scope } = useSettingsScope();
  const { unarchiveThread, confirmAndDeleteThread } = useThreadActions();
  const {
    snapshots: archivedSnapshots,
    error: archiveError,
    isLoading: isLoadingArchive,
    refresh: refreshArchivedThreads,
  } = useArchivedThreadSnapshots(scope.environmentIds);

  const archivedGroups = useMemo(() => {
    const selectedProjectKeys =
      scope.kind === "project" || scope.kind === "checkout"
        ? new Set(scope.members.map((member) => `${member.environmentId}:${member.id}`))
        : null;
    const projectsByEnvironmentAndId = new Map(
      archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
        snapshot.projects
          .filter(
            (project) =>
              selectedProjectKeys === null ||
              selectedProjectKeys.has(`${environmentId}:${project.id}`),
          )
          .map(
            (project) => [`${environmentId}:${project.id}`, { ...project, environmentId }] as const,
          ),
      ),
    );
    const threads = archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
      snapshot.threads.map((thread) => ({
        ...thread,
        environmentId,
      })),
    );

    const archivedProjects = Array.from(projectsByEnvironmentAndId.values());
    const groups: Array<{
      readonly project: (typeof archivedProjects)[number];
      readonly threads: Array<(typeof threads)[number]>;
    }> = [];
    for (const project of archivedProjects) {
      const projectThreads: Array<(typeof threads)[number]> = [];
      for (const thread of threads) {
        if (thread.projectId === project.id && thread.environmentId === project.environmentId) {
          projectThreads.push(thread);
        }
      }
      if (projectThreads.length > 0) {
        groups.push({
          project,
          threads: projectThreads.toSorted((left, right) => {
            const leftKey = left.archivedAt ?? left.createdAt;
            const rightKey = right.archivedAt ?? right.createdAt;
            return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
          }),
        });
      }
    }
    return groups;
  }, [archivedSnapshots, scope]);

  const handleArchivedThreadContextMenu = useCallback(
    async (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const clicked = await api.contextMenu.show(
        [
          { id: "unarchive", label: t("action.unarchive") },
          { id: "delete", label: t("action.delete"), destructive: true },
        ],
        position,
      );

      if (clicked === "unarchive") {
        const result = await unarchiveThread(threadRef);
        if (result._tag === "Success") {
          refreshArchivedThreads();
        } else if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("settings.label.failedToUnarchiveThread"),
              description:
                error instanceof Error ? error.message : t("settings.label.anErrorOccurred"),
            }),
          );
        }
        return;
      }

      if (clicked === "delete") {
        const result = await confirmAndDeleteThread(threadRef);
        if (result._tag === "Success") {
          refreshArchivedThreads();
        } else if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: t("settings.label.failedToDeleteThread"),
              description:
                error instanceof Error ? error.message : t("settings.label.anErrorOccurred"),
            }),
          );
        }
      }
    },
    [t, confirmAndDeleteThread, refreshArchivedThreads, unarchiveThread],
  );

  return (
    <SettingsPageContainer>
      {archivedGroups.length === 0 ? (
        <SettingsSection
          id={isLoadingArchive ? undefined : searchableSetting("archive", t).id}
          title={searchableSetting("archive", t).title}
        >
          <SettingsRow
            title={
              <span className="inline-flex items-center gap-2">
                {isLoadingArchive ? (
                  <Spinner size="sm" tone="muted" />
                ) : (
                  <ArchiveIcon className="size-3.5 text-muted-foreground" />
                )}
                {isLoadingArchive
                  ? t("settings.label.loadingArchivedThreads")
                  : archiveError
                    ? t("settings.label.couldNotLoadArchivedThreads")
                    : t("settings.label.noArchivedThreads")}
              </span>
            }
            description={
              isLoadingArchive
                ? t("settings.label.checkingConnectedEnvironments")
                : (archiveError ?? t("settings.label.archivedThreadsWillAppearHere"))
            }
          />
        </SettingsSection>
      ) : (
        archivedGroups.map(({ project, threads: projectThreads }, index) => (
          <SettingsSection
            key={`${project.environmentId}:${project.id}`}
            id={index === 0 ? searchableSetting("archive", t).id : undefined}
            title={project.title}
            icon={<ProjectFavicon project={project} />}
          >
            {projectThreads.map((thread) => (
              <SettingsRow
                key={thread.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void (async () => {
                    const result = await settlePromise(() =>
                      handleArchivedThreadContextMenu(
                        scopeThreadRef(thread.environmentId, thread.id),
                        {
                          x: event.clientX,
                          y: event.clientY,
                        },
                      ),
                    );
                    if (result._tag === "Failure") {
                      const error = squashAtomCommandFailure(result);
                      toastManager.add(
                        stackedThreadToast({
                          type: "error",
                          title: t("settings.label.archivedThreadActionFailed"),
                          description:
                            error instanceof Error
                              ? error.message
                              : t("settings.label.anErrorOccurred"),
                        }),
                      );
                    }
                  })();
                }}
                title={thread.title}
                description={
                  <>
                    {t("settings.archive.timestamps", {
                      archived: formatRelativeTimeLabel(thread.archivedAt ?? thread.createdAt),
                      created: formatRelativeTimeLabel(thread.createdAt),
                    })}
                  </>
                }
                control={
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="shrink-0"
                    onClick={() => {
                      void (async () => {
                        const result = await unarchiveThread(
                          scopeThreadRef(thread.environmentId, thread.id),
                        );
                        if (result._tag === "Success") {
                          refreshArchivedThreads();
                          return;
                        }
                        if (!isAtomCommandInterrupted(result)) {
                          const error = squashAtomCommandFailure(result);
                          toastManager.add(
                            stackedThreadToast({
                              type: "error",
                              title: t("settings.label.failedToUnarchiveThread"),
                              description:
                                error instanceof Error
                                  ? error.message
                                  : t("settings.label.anErrorOccurred"),
                            }),
                          );
                        }
                      })();
                    }}
                  >
                    <ArchiveX className="size-3.5" />
                    <span>{t("action.unarchive")}</span>
                  </Button>
                }
              />
            ))}
          </SettingsSection>
        ))
      )}
    </SettingsPageContainer>
  );
}
