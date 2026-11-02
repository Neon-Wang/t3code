import { i18n } from "@t3tools/shared/i18n";
import { appAtomRegistry, subscribeAtomChanges } from "../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { primaryServerConfigAtom, primaryServerConfigEventAtom } from "../state/server";
import { KeybindingsConfigWarning } from "./KeybindingsConfigWarning";
import { createKeybindingsUpdateToastController } from "./KeybindingsUpdateToast.logic";
import { stackedThreadToast, toastManager } from "./ui/toast";

/** Toasts each keybindings reload the primary server reports. */
export function startKeybindingsUpdateToasts(): () => void {
  const controller = createKeybindingsUpdateToastController({});
  return subscribeAtomChanges(primaryServerConfigEventAtom, (event) => {
    const decision = controller.handle(event);
    if (!decision) return;

    if (decision._tag === "Success") {
      toastManager.add({
        type: "success",
        title: i18n.t("route.root.keybindingsUpdated"),
        description: i18n.t("route.root.keybindingsConfigurationReloadedSuccessfully"),
      });
      return;
    }

    const serverConfig = appAtomRegistry.get(primaryServerConfigAtom);
    toastManager.add(
      stackedThreadToast({
        type: "warning",
        title: i18n.t("route.root.invalidKeybindingsConfiguration"),
        description: (
          <KeybindingsConfigWarning
            message={decision.message}
            environmentId={appAtomRegistry.get(primaryEnvironmentIdAtom)}
            configPath={serverConfig?.keybindingsConfigPath ?? null}
            availableEditors={serverConfig?.availableEditors ?? []}
          />
        ),
      }),
    );
  });
}
