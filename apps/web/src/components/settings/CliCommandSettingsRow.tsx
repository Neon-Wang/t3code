import { useI18n } from "../../hooks/useI18n";
import type { DesktopCliCommandState } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function CliCommandSettingsRow() {
  const { t } = useI18n();
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge?.cliCommand;
  const [state, setState] = useState<DesktopCliCommandState | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge
      .getState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const change = (action: "install" | "uninstall") => {
    if (!bridge || pending) return;
    setPending(true);
    void bridge[action]()
      .then(setState)
      .catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title:
              action === "install"
                ? t("v2.settings.couldNotInstallT3")
                : t("v2.settings.couldNotRemoveT3"),
            description:
              error instanceof Error ? error.message : t("route.root.somethingWentWrong"),
          }),
        );
      })
      .finally(() => setPending(false));
  };

  if (!bridge || !state?.supported) return null;
  const installed = state.installedPath !== null;
  const description = state.shadowedBy
    ? t("v2.settings.anotherT3AtValueRunsFirstInANewTerminalRemoveIt", { arg0: state.shadowedBy })
    : !installed
      ? t("v2.settings.runT3CodeSCLIAsT3FromAnyTerminal")
      : state.onPath
        ? t("v2.settings.installedAtValueOpenANewTerminalToUseIt", { arg0: state.installedPath })
        : t("v2.settings.installedAtValueWhichIsNotOnYourPATHYetAddIts", {
            arg0: state.installedPath,
          });

  return (
    <SettingsRow
      {...searchableSetting("cli-command", t)}
      description={description}
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => change(installed ? "uninstall" : "install")}
        >
          {installed ? t("action.remove") : t("settings.label.install")}
        </Button>
      }
    />
  );
}
