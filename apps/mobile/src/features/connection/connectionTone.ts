import { i18n } from "@t3tools/shared/i18n";
import type { StatusTone } from "../../components/StatusPill";
import type { RemoteClientConnectionState } from "../../lib/connection";

export function connectionTone(state: RemoteClientConnectionState): StatusTone {
  switch (state) {
    case "connected":
      return {
        label: i18n.t("mobile.connectionTone.connected"),
        pillClassName: "bg-adaptive-emerald-500-a12-a16",
        textClassName: "text-adaptive-emerald-700-300",
      };
    case "reconnecting":
      return {
        label: i18n.t("mobile.connectionTone.reconnecting"),
        pillClassName: "bg-warning",
        textClassName: "text-warning-foreground",
      };
    case "connecting":
      return {
        label: i18n.t("mobile.connectionTone.connecting"),
        pillClassName: "bg-update",
        textClassName: "text-update-foreground",
      };
    case "unsupported":
      return {
        label: i18n.t("mobile.connectionTone.clientNotSupported"),
        pillClassName: "bg-subtle",
        textClassName: "text-foreground-secondary",
      };
    case "error":
      return {
        label: i18n.t("mobile.connectionTone.connectionFailed"),
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "offline":
      return {
        label: i18n.t("mobile.connectionTone.offline"),
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "available":
      return {
        label: i18n.t("mobile.connectionTone.available"),
        pillClassName: "bg-subtle",
        textClassName: "text-foreground-secondary",
      };
  }
}
