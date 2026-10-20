import { i18n } from "@t3tools/shared/i18n";
import type { OrchestrationV2UserMessageInputIntent } from "@t3tools/contracts";

export interface UserMessageIntentBadgePresentation {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export function resolveUserMessageIntentBadge(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
): UserMessageIntentBadgePresentation | null {
  switch (intent) {
    case "steer":
      return {
        label: i18n.t("mobile.threads.steer"),
        accessibilityLabel: i18n.t("mobile.threads.steeredTheActiveTurn"),
      };
    case "promoted_queued_to_steer":
      return {
        label: i18n.t("mobile.threads.steer"),
        accessibilityLabel: i18n.t(
          "mobile.threads.originallyQueuedThenPromotedToSteerTheActiveTurn",
        ),
      };
    case "queued_turn":
    case "turn_start":
    case undefined:
      return null;
  }
}
