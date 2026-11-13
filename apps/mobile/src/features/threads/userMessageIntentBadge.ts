import { i18n } from "@t3tools/shared/i18n";
import type { OrchestrationV2UserMessageInputIntent } from "@t3tools/contracts";

export interface UserMessageIntentBadgePresentation {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export function resolveUserMessageIntentBadge(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
  unread = false,
): UserMessageIntentBadgePresentation | null {
  if (unread && (intent === "steer" || intent === "promoted_queued_to_steer")) {
    return {
      label: "Steer · waiting to be read",
      accessibilityLabel:
        "Steer waiting for the agent to read it after the running command finishes",
    };
  }
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
