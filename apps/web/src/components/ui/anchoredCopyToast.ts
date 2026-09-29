import { i18n, type I18n } from "@t3tools/shared/i18n";
import type { RefObject } from "react";
import { anchoredToastManager } from "./toast";

export const ANCHORED_COPY_TOAST_TIMEOUT_MS = 1000;

export function showAnchoredCopySuccessToast(
  ref: RefObject<HTMLButtonElement | null>,
  t: I18n["t"] = i18n.t,
) {
  if (!ref.current) return;
  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
    title: t("ui.anchoredCopyToast.copied"),
  });
}

export function showAnchoredCopyErrorToast(
  ref: RefObject<HTMLButtonElement | null>,
  error: Error,
  t: I18n["t"] = i18n.t,
) {
  if (!ref.current) return;
  anchoredToastManager.add({
    data: {
      tooltipStyle: true,
    },
    positionerProps: {
      anchor: ref.current,
    },
    timeout: ANCHORED_COPY_TOAST_TIMEOUT_MS,
    title: t("ui.anchoredCopyToast.failedToCopy"),
    description: error.message,
  });
}
