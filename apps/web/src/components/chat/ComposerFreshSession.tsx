import { EraserIcon } from "lucide-react";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";

import type { I18n } from "@t3tools/shared/i18n";
/** Shown while `/clear` is armed; dismissing it keeps the current conversation. */
export function freshSessionBannerItem(t: I18n["t"], onUndo: () => void): ComposerBannerStackItem {
  return {
    id: "fresh-session",
    variant: "info",
    icon: <EraserIcon />,
    title: t("chat.freshSession.bannerTitle"),
    description: t("chat.freshSession.bannerDescription"),
    dismissLabel: t("chat.freshSession.keepCurrent"),
    onDismiss: onUndo,
  };
}
