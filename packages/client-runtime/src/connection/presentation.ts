import { createI18n, type I18n } from "@t3tools/shared/i18n";
const englishConnectionTranslator = createI18n({ locale: "en" }).t;

import type { ServerConfig } from "@t3tools/contracts";
import * as Option from "effect/Option";

import type { ConnectionCatalogEntry } from "./catalog.ts";
import type { SupervisorConnectionState } from "./model.ts";

export type EnvironmentConnectionPhase =
  | "available"
  | "offline"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "error"
  | "unsupported";

export interface EnvironmentConnectionPresentation {
  readonly phase: EnvironmentConnectionPhase;
  readonly error: string | null;
  readonly traceId: string | null;
}

export interface EnvironmentPresentation {
  readonly entry: ConnectionCatalogEntry;
  readonly connection: EnvironmentConnectionPresentation;
  readonly serverConfig: ServerConfig | null;
}

export function presentConnectionState(
  state: SupervisorConnectionState,
): EnvironmentConnectionPresentation {
  switch (state.phase) {
    case "available":
      return { phase: "available", error: null, traceId: null };
    case "offline":
      return { phase: "offline", error: null, traceId: null };
    case "connecting":
      return {
        phase: state.attempt <= 1 && state.lastFailure === null ? "connecting" : "reconnecting",
        error: state.lastFailure?.message ?? null,
        traceId: state.lastFailure?.traceId ?? null,
      };
    case "connected":
      return { phase: "connected", error: null, traceId: null };
    case "backoff":
      return {
        phase: "reconnecting",
        error: state.lastFailure?.message ?? null,
        traceId: state.lastFailure?.traceId ?? null,
      };
    case "blocked":
      return {
        phase: state.lastFailure?.reason === "unsupported" ? "unsupported" : "error",
        error: state.lastFailure?.message ?? null,
        traceId: state.lastFailure?.traceId ?? null,
      };
  }
}

export function connectionStatusText(
  connection: EnvironmentConnectionPresentation,
  t: I18n["t"] = englishConnectionTranslator,
): string {
  switch (connection.phase) {
    case "available":
      return t("cloud.connection.available");
    case "offline":
      return t("cloud.connection.offline");
    case "connecting":
      return t("cloud.connection.connecting");
    case "reconnecting":
      return connection.error
        ? t("cloud.connection.reconnectingReason", { error: connection.error })
        : t("cloud.connection.reconnecting");
    case "connected":
      return t("cloud.connection.connected");
    case "unsupported":
      return t("cloud.connection.unsupported");
    case "error":
      return connection.error
        ? t("cloud.connection.failedReason", { error: connection.error })
        : t("cloud.connection.failed");
  }
}

export function connectionStatusTitle(
  connection: EnvironmentConnectionPresentation,
  t: I18n["t"] = englishConnectionTranslator,
): string {
  if (connection.phase === "reconnecting" && connection.error) {
    return t("cloud.connection.retrying");
  }
  return connectionStatusText({ ...connection, error: null }, t);
}

export function presentEnvironmentConnection(
  state: SupervisorConnectionState,
): EnvironmentConnectionPresentation {
  return presentConnectionState(state);
}

export function connectionCatalogDisplayUrl(entry: ConnectionCatalogEntry): string | null {
  switch (entry.target._tag) {
    case "PrimaryConnectionTarget":
      return entry.target.httpBaseUrl;
    case "RelayConnectionTarget":
      return null;
    case "BearerConnectionTarget":
      return Option.isSome(entry.profile) && entry.profile.value._tag === "BearerConnectionProfile"
        ? entry.profile.value.httpBaseUrl
        : null;
    case "SshConnectionTarget":
      return Option.isSome(entry.profile) && entry.profile.value._tag === "SshConnectionProfile"
        ? `${entry.profile.value.target.username}@${entry.profile.value.target.hostname}`
        : null;
  }
}
