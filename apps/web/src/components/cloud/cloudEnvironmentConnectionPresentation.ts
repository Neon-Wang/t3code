import { createI18n, type I18n } from "@t3tools/shared/i18n";
import {
  connectionStatusText,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";

export interface SavedCloudEnvironmentConnectionPresentation {
  readonly buttonLabel: string;
  readonly statusText: string;
  readonly tone: "connected" | "connecting" | "error" | "idle";
}

/**
 * Present the live supervisor state for an environment that is already in the
 * connection catalog. Catalog membership only means the environment is saved;
 * it does not mean the connection attempt succeeded.
 */
export function presentSavedCloudEnvironmentConnection(
  connection: EnvironmentConnectionPresentation,
  t: I18n["t"] = englishSurfaceTranslator,
): SavedCloudEnvironmentConnectionPresentation {
  switch (connection.phase) {
    case "connected":
      return {
        buttonLabel: t("cloud.connection.connected"),
        statusText: connectionStatusText(connection, t),
        tone: "connected",
      };
    case "connecting":
      return {
        buttonLabel: t("settings.connections.connectingText"),
        statusText: connectionStatusText(connection, t),
        tone: "connecting",
      };
    case "reconnecting":
      return {
        buttonLabel: t("cloud.reconnecting"),
        statusText: connectionStatusText(connection, t),
        tone: "connecting",
      };
    // Not a failure: the machine is fine, this build just cannot talk to it.
    case "unsupported":
      return {
        buttonLabel: t("settings.providers.clientUnsupported"),
        statusText: connectionStatusText(connection, t),
        tone: "idle",
      };
    case "error":
      return {
        buttonLabel: t("cloud.connection.failed"),
        statusText: connectionStatusText(connection, t),
        tone: "error",
      };
    case "offline":
      return {
        buttonLabel: t("cloud.connection.offline"),
        statusText: connectionStatusText(connection, t),
        tone: "idle",
      };
    case "available":
      return {
        buttonLabel: t("helpers.ui.notConnected"),
        statusText: connectionStatusText(connection, t),
        tone: "idle",
      };
  }
}

const englishSurfaceTranslator = createI18n({ locale: "en" }).t;
