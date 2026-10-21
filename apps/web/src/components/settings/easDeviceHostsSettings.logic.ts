import {
  EasDeviceHostConfig,
  type EasDeviceHostConfig as EasDeviceHostConfigType,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { i18n } from "@t3tools/shared/i18n";

export const parseEasDeviceHostDraft = Schema.decodeUnknownOption(EasDeviceHostConfig);

export const newEasDeviceHost = (id: string): EasDeviceHostConfigType => ({
  kind: "eas",
  id,
  label: "EAS Simulator",
  accessToken: "",
  maxSessionMinutes: 30,
  idleMinutes: 10,
  maxConcurrentSessions: 2,
});

/** Adds, replaces, or removes one EAS host. */
export function updateEasDeviceHosts(
  hosts: ReadonlyArray<EasDeviceHostConfigType>,
  host: EasDeviceHostConfigType,
  remove: boolean,
): ReadonlyArray<EasDeviceHostConfigType> {
  if (remove) return hosts.filter((candidate) => candidate.id !== host.id);
  return hosts.some((candidate) => candidate.id === host.id)
    ? hosts.map((candidate) => (candidate.id === host.id ? host : candidate))
    : [...hosts, host];
}

export function easSessionLimits(host: EasDeviceHostConfigType) {
  const sessions =
    host.maxConcurrentSessions === 1
      ? i18n.t("v2.settings.sessionCount.one")
      : i18n.t("usage.sessions", { count: host.maxConcurrentSessions });
  return i18n.t("v2.settings.upToSessionsAtOnce", {
    sessions,
    max: host.maxSessionMinutes,
    idle: host.idleMinutes,
  });
}
