import { i18n } from "@t3tools/shared/i18n";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

export interface FloatingStatusAction {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export type FloatingWorkingStatus =
  | { readonly kind: "working"; readonly startedAt: string }
  | { readonly kind: "syncing"; readonly label: string }
  | { readonly kind: "compacting" }
  | {
      readonly kind: "child-input";
      readonly label: string;
      readonly accessibilityLabel: string;
      readonly onPress: () => void;
    }
  | {
      readonly kind: "background";
      readonly label: string;
      readonly accessibilityLabel: string;
      readonly waiting: boolean;
      readonly onPress: () => void;
      readonly action: FloatingStatusAction;
    }
  | {
      readonly kind: "lifecycle";
      readonly state: "snoozed" | "settled" | "woke";
      readonly label: string;
      readonly action: FloatingStatusAction;
    }
  | {
      readonly kind: "stop";
      readonly label: string;
      readonly unresponsive: boolean;
      readonly action: FloatingStatusAction | null;
    }
  | { readonly kind: "goal"; readonly label: string; readonly accessibilityLabel: string }
  | { readonly kind: "preparing"; readonly label: string }
  | {
      readonly kind: "connection";
      readonly tone: "reconnecting" | "unavailable";
      readonly label: string;
      readonly onPress: () => void;
    };

export function connectionFloatingStatus(input: {
  readonly connectionError: string | null;
  readonly connectionState: EnvironmentConnectionPhase;
  readonly environmentLabel: string | null;
  readonly onReconnect: () => void;
}): FloatingWorkingStatus | null {
  const environmentLabel = input.environmentLabel ?? i18n.t("mobile.threads.environment");
  const unavailable = (label: string): FloatingWorkingStatus => ({
    kind: "connection",
    tone: "unavailable",
    label,
    onPress: input.onReconnect,
  });

  switch (input.connectionState) {
    case "connecting":
    case "reconnecting":
      return {
        kind: "connection",
        tone: "reconnecting",
        label:
          input.connectionError === null
            ? i18n.t("mobile.floatingWorkingStatus.reconnecting", { label: environmentLabel })
            : i18n.t("mobile.floatingWorkingStatus.failedRetrying", { label: environmentLabel }),
        onPress: input.onReconnect,
      };
    case "offline":
      return unavailable(i18n.t("mobile.environmentConnectionNotice.youAreOffline"));
    case "unsupported":
      return unavailable(i18n.t("mobile.useremoteenvironmentregistry.clientNotSupported"));
    case "error":
      return unavailable(
        input.connectionError
          ? i18n.t("mobile.floatingWorkingStatus.failedToConnectWithError", {
              label: environmentLabel,
              error: input.connectionError,
            })
          : i18n.t("mobile.floatingWorkingStatus.failedToConnect", { label: environmentLabel }),
      );
    case "available":
      return unavailable(
        i18n.t("mobile.floatingWorkingStatus.notConnected", { label: environmentLabel }),
      );
    case "connected":
      return null;
  }
}
