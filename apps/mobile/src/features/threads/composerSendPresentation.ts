import { i18n } from "@t3tools/shared/i18n";
import {
  alternateComposerDispatchAction,
  type ActiveTurnComposerAction,
} from "@t3tools/client-runtime/state/composer-dispatch";

import type { FollowUpBehavior } from "../../lib/followUpBehavior";

export interface ComposerSendPresentation {
  readonly label: string;
  readonly icon:
    | "arrow.up"
    | "tray.and.arrow.up"
    | "checkmark"
    | "list.number"
    | "arrow.turn.left.up";
  readonly action: ActiveTurnComposerAction | null;
  readonly alternate: ActiveTurnComposerAction | null;
  readonly offersFollowUpChoice: boolean;
}

const actionLabel = (action: ActiveTurnComposerAction): string =>
  action === "queue"
    ? i18n.t("mobile.settingsFollowUpRouteScreen.queue")
    : action === "steer"
      ? i18n.t("mobile.threads.steer")
      : i18n.t("mobile.composerSendPresentation.restart");

export function resolveComposerSendPresentation(input: {
  readonly editingQueuedMessage: boolean;
  readonly running: boolean;
  readonly canSteer: boolean;
  readonly followUpBehavior: FollowUpBehavior;
  readonly deliveryDeferred: boolean;
}): ComposerSendPresentation {
  if (input.editingQueuedMessage) {
    return {
      label: i18n.t("mobile.threads.updateQueuedMessage"),
      icon: "checkmark",
      action: null,
      alternate: null,
      offersFollowUpChoice: false,
    };
  }
  if (!input.running) {
    return {
      label: input.deliveryDeferred
        ? i18n.t("mobile.settingsFollowUpRouteScreen.queue")
        : i18n.t("mobile.threads.send"),
      icon: input.deliveryDeferred ? "tray.and.arrow.up" : "arrow.up",
      action: null,
      alternate: null,
      offersFollowUpChoice: false,
    };
  }
  const action: ActiveTurnComposerAction = input.canSteer ? input.followUpBehavior : "queue";
  const alternate = alternateComposerDispatchAction(action);
  return {
    label: actionLabel(action),
    icon: action === "steer" ? "arrow.turn.left.up" : "list.number",
    action,
    alternate: input.canSteer ? alternate : null,
    offersFollowUpChoice: input.canSteer,
  };
}
