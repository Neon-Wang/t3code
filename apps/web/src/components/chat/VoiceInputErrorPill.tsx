import { MICROPHONE_PERMISSION_ERROR } from "@t3tools/client-runtime/voice-input";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcwIcon, SettingsIcon, XIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { VoiceInputPill } from "./VoiceInputPill";
import { useI18n } from "../../hooks/useI18n";

import type { MessageKey } from "@t3tools/shared/i18n";
const VOICE_ERROR_LABELS: Record<string, MessageKey> = {
  [MICROPHONE_PERMISSION_ERROR]: "chat.voiceError.microphoneAccessNeeded",
  "Microphone access is required for voice input.": "chat.voiceError.microphoneAccessNeeded",
  "This draft is no longer available.": "chat.voiceError.draftUnavailable",
  "Another voice recording is already active.": "chat.voiceError.anotherRecordingActive",
  "Voice transcription is not available.": "chat.voiceError.voiceInputUnavailable",
  "Voice transcription is still finishing. Try again shortly.": "chat.voiceError.transcriptionBusy",
  "Voice transcription is not available for this language.": "chat.voiceError.languageUnsupported",
  "Could not prepare voice transcription.": "chat.voiceError.couldNotPrepare",
  "Could not start voice recording.": "chat.voiceError.couldNotStart",
  "Voice recording was interrupted.": "chat.voiceError.interrupted",
  "Could not finish voice recording.": "chat.voiceError.couldNotFinish",
  "Could not transcribe this recording.": "chat.voiceError.transcriptionFailed",
  "Voice transcription on this environment failed.": "chat.voiceError.transcriptionFailed",
  "The draft changed while voice input was running. The transcript was not added.":
    "chat.voiceError.draftChanged",
  "No speech was detected.": "chat.voiceError.noSpeech",
  "Microphone processing failed.": "chat.voiceError.microphoneProcessingFailed",
  "The microphone disconnected.": "chat.voiceError.microphoneDisconnected",
};

function voiceErrorLabel(error: string | null): MessageKey {
  return (error && VOICE_ERROR_LABELS[error]) || "chat.voiceError.failed";
}

export function VoiceInputErrorPill(props: {
  error: string | null;
  errorAction: "retry" | "settings" | null;
  disabled?: boolean;
  cancelShortcutLabel?: string | null;
  onRetry(): void;
  onDismiss(): void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const openSettings = props.errorAction === "settings";
  const actionLabel = openSettings
    ? t("chat.voiceError.openSettings")
    : props.error === "Could not transcribe this recording." ||
        props.error === "Voice transcription on this environment failed."
      ? t("chat.voiceError.retryTranscription")
      : t("settings.microphoneTest.recordAgain");
  return (
    <VoiceInputPill>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon-sm-pill"
              variant="ghost"
              aria-label={t("mobile.composerDictationControl.dismissVoiceInputError")}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onDismiss}
            >
              <XIcon />
            </Button>
          }
        />
        <TooltipPopup side="top">
          {t("mobile.composerDictationControl.dismissVoiceInputError")}
          {props.cancelShortcutLabel ? ` (${props.cancelShortcutLabel})` : ""}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              role="status"
              aria-label={props.error ?? t("chat.voiceError.failed")}
              className="min-w-0 flex-1 truncate text-sm text-destructive"
            />
          }
        >
          {t(voiceErrorLabel(props.error))}
        </TooltipTrigger>
        <TooltipPopup side="top">{props.error ?? t("chat.voiceError.failed")}</TooltipPopup>
      </Tooltip>
      {props.errorAction ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm-pill"
                variant="ghost"
                aria-label={actionLabel}
                disabled={props.disabled}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (openSettings) {
                    props.onDismiss();
                    void navigate({ to: "/settings/voice" });
                  } else {
                    props.onRetry();
                  }
                }}
              >
                {openSettings ? <SettingsIcon /> : <RotateCcwIcon />}
              </Button>
            }
          />
          <TooltipPopup side="top">{actionLabel}</TooltipPopup>
        </Tooltip>
      ) : null}
    </VoiceInputPill>
  );
}
