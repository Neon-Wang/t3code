import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import {
  ENVIRONMENT_MACHINE_KINDS,
  isEnvironmentMachineKind,
  resolveEnvironmentMachineKind,
  type EnvironmentId,
  type ServerConfig,
} from "@t3tools/contracts";

import { isElectron } from "../../env";
import { usePrimarySessionState } from "../../environments/primary";
import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentSessionState } from "../../state/session";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "../ui/menu";
import {
  resolvePrimaryOperateAccess,
  resolveRemoteOperateAccess,
} from "./ProviderSettingsPanel.logic";

/**
 * Why the picker is inert, in the order the user can do something about it.
 * Null means it can be changed.
 */
export function resolveEnvironmentIconPickerLock(
  input: {
    readonly serverConfig: ServerConfig | null;
    readonly operateAccess: "granted" | "denied" | "pending";
  },
  t: typeof i18n.t = i18n.t,
): string | null {
  if (input.serverConfig === null) {
    return t("settings.connections.connectToThisEnvironmentToChangeItsIcon");
  }
  if (input.serverConfig.environment.capabilities.environmentIcon !== true) {
    return t("settings.connections.thisEnvironmentSServerIsTooOldToKeepAnIconUpdateItToChooseOne");
  }
  if (input.operateAccess === "denied") {
    return t("settings.connections.yourSessionOnThisEnvironmentCannotChangeItsSettings");
  }
  return null;
}

// Same split the provider settings use: the desktop app owns its primary
// server outright, a browser session on the primary checks its cookie
// session's scopes, and a remote checks the scopes its own server reports.
function useEnvironmentOperateAccess(environmentId: EnvironmentId) {
  const isPrimary = usePrimaryEnvironmentId() === environmentId;
  const primarySession = usePrimarySessionState();
  const remoteSession = useEnvironmentSessionState(environmentId);
  if (isPrimary) {
    return isElectron
      ? "granted"
      : resolvePrimaryOperateAccess({
          isPrimary: true,
          hasDesktopBridge: false,
          session: primarySession.data,
          isPending: primarySession.isPending,
          hasError: primarySession.error !== null,
        });
  }
  return resolveRemoteOperateAccess({
    session: remoteSession.data,
    isPending: remoteSession.isPending,
    hasError: remoteSession.hasError,
  });
}

/**
 * "Icon" submenu for an environment's row menu. Lists the machine kinds with
 * the server's own detection marked, so the user can tell whether detection
 * got it right before overriding. Picking the detected kind clears the
 * override. Locked environments show the reason as a disabled item instead of
 * hiding the submenu, so the current icon still reads.
 */
export function EnvironmentIconMenu({
  environmentId,
  serverConfig,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: ServerConfig | null;
}) {
  const { t } = useI18n();
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const operateAccess = useEnvironmentOperateAccess(environmentId);
  const lock = resolveEnvironmentIconPickerLock({ serverConfig, operateAccess }, t);
  // With no detection the server falls back to "server", so picking that
  // kind clears the override the same way picking the detected kind does.
  const machineLabels = {
    server: t("settings.connections.machineServer"),
    cloud: t("settings.connections.machineCloud"),
    linux: "Linux/WSL",
    desktop: t("settings.connections.machineDesktop"),
    laptop: t("settings.connections.machineLaptop"),
    "mac-mini": t("settings.connections.machineMini"),
    "mac-studio": t("settings.connections.machineWorkstation"),
  };
  const detected = serverConfig?.environment.platform.machine ?? "server";
  const resolved = resolveEnvironmentMachineKind(serverConfig);

  return (
    <MenuSub>
      <MenuSubTrigger>
        <EnvironmentMachineIcon kind={resolved} />
        {t("settings.connections.icon")}
      </MenuSubTrigger>
      <MenuSubPopup>
        {lock !== null ? (
          <>
            <MenuItem disabled className="whitespace-normal">
              {lock}
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        <MenuRadioGroup
          value={resolved}
          onValueChange={(next) => {
            if (lock !== null || !isEnvironmentMachineKind(next)) return;
            updateSettings({ environmentIcon: next === detected ? null : next });
          }}
        >
          {ENVIRONMENT_MACHINE_KINDS.map((kind) => (
            <MenuRadioItem key={kind} value={kind} disabled={lock !== null}>
              <span className="flex min-w-0 items-center gap-2">
                <EnvironmentMachineIcon kind={kind} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{machineLabels[kind]}</span>
                {kind === detected ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {serverConfig?.environment.platform.machine
                      ? t("settings.connections.detected")
                      : t("common.default")}
                  </span>
                ) : null}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}
