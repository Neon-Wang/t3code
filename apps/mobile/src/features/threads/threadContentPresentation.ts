import { i18n } from "@t3tools/shared/i18n";
import { type EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

export type ThreadContentPresentation =
  | { readonly kind: "ready" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "unavailable";
      readonly title: string;
      readonly detail: string;
    };

export function projectThreadContentPresentation(input: {
  readonly hasDetail: boolean;
  readonly detailError: string | null;
  readonly detailDeleted: boolean;
  readonly connectionState: EnvironmentConnectionPhase;
}): ThreadContentPresentation {
  if (input.hasDetail) {
    return { kind: "ready" };
  }
  if (input.detailDeleted) {
    return {
      kind: "unavailable",
      title: i18n.t("mobile.threads.threadUnavailable"),
      detail: i18n.t("mobile.threads.thisThreadWasDeletedOrIsNoLongerAvailable"),
    };
  }
  if (input.detailError !== null) {
    return {
      kind: "unavailable",
      title: i18n.t("mobile.threads.couldNotLoadConversation"),
      detail: input.detailError,
    };
  }
  if (
    input.connectionState === "connected" ||
    input.connectionState === "connecting" ||
    input.connectionState === "reconnecting"
  ) {
    return { kind: "loading" };
  }
  return {
    kind: "unavailable",
    title: i18n.t("mobile.threads.messagesNotCached"),
    detail: i18n.t("mobile.threads.reconnectThisEnvironmentToLoadTheConversation"),
  };
}
