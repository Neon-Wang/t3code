import { i18n } from "@t3tools/shared/i18n";
import type { OrchestrationV2UserMessageInputIntent } from "@t3tools/contracts";

export interface UserMessageIntentBadgePresentation {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly explanation: string;
  readonly tone: "queued" | "steer";
}

export function resolveUserMessageIntentBadge(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
): UserMessageIntentBadgePresentation | null {
  switch (intent) {
    case "queued_turn":
      return {
        label: i18n.t("mobile.threads.fromQueue"),
        accessibilityLabel: i18n.t("mobile.threads.queuedWhileTheAgentWasBusy"),
        explanation:
          "This badge records that the message was queued. It stays visible after the message leaves the queue.",
        tone: "queued",
      };
    case "steer":
      return {
        label: i18n.t("mobile.threads.steer"),
        accessibilityLabel: i18n.t("mobile.threads.steeredTheActiveTurn"),
        explanation:
          "This message was intended to steer the agent while its turn was still running.",
        tone: "steer",
      };
    case "promoted_queued_to_steer":
      return {
        label: i18n.t("mobile.threads.queuedSteer"),
        accessibilityLabel: i18n.t(
          "mobile.threads.originallyQueuedThenPromotedToSteerTheActiveTurn",
        ),
        explanation:
          "This message was originally queued, then promoted to steer the agent while its turn was still running.",
        tone: "steer",
      };
    case "turn_start":
    case undefined:
      return null;
  }
}
