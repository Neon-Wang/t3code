import { useI18n } from "../../hooks/useI18n";
import { useAtomValue } from "@effect/atom-react";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type EnvironmentId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { usesChatGptSharing } from "@t3tools/shared/usageLimits";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { randomUUID } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { WizardFooter, WizardHeader, WizardPanel, WizardPopup } from "../ui/wizard";
import { SettingsRow } from "./settingsLayout";

export function AddCodexAccountDialog({
  environmentId,
  onClose,
  renderSetup,
  onAccountCreated,
}: {
  readonly environmentId: EnvironmentId;
  readonly onClose: () => void;
  readonly onAccountCreated?:
    | ((instanceId: ProviderInstanceId, displayName: string) => void)
    | undefined;
  readonly renderSetup: (instanceId: ProviderInstanceId, provider: ServerProvider) => ReactNode;
}) {
  const { t } = useI18n();
  const settings = useEnvironmentSettings(environmentId);
  const providers = useAtomValue(serverEnvironment.providersValueAtom(environmentId));
  const update = useAtomCommand(
    serverEnvironment.updateSettings,
    t("settings.codexSetup.addChatgptAccount"),
  );
  const [name, setName] = useState("Personal");
  const displayName = `ChatGPT - ${name.trim()}`;
  const [instanceId, setInstanceId] = useState<ProviderInstanceId | null>(null);
  const [pending, setPending] = useState(false);
  const provider = providers?.find((candidate) => candidate.instanceId === instanceId);
  const connected = usesChatGptSharing(provider);
  const closeAfterConnection = useEffectEvent(onClose);
  useEffect(() => {
    // The destination snapshot confirms remote transfer as well as local sign-in.
    if (connected) closeAfterConnection();
  }, [connected]);

  const createAccount = async () => {
    if (pending || !name.trim()) return;
    setPending(true);
    // The ID is routing identity; the name is editable and need not be unique.
    const id = ProviderInstanceId.make(`codex_${randomUUID()}`);
    const result = await update({
      environmentId,
      input: {
        patch: {
          providerInstances: {
            ...settings.providerInstances,
            [id]: {
              driver: ProviderDriverKind.make("codex"),
              displayName,
              enabled: true,
              config: { enabled: true, setupMode: "managed" },
            },
          },
        },
      },
    });
    if (result._tag === "Success") {
      if (onAccountCreated) {
        onAccountCreated(id, displayName);
        onClose();
      } else {
        setInstanceId(id);
      }
    }
    setPending(false);
  };

  return (
    <Dialog
      open={!connected}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <WizardPopup size="wide">
        <WizardHeader
          title={instanceId ? displayName : t("settings.codexSetup.addChatgptAccount")}
          description={t(
            "settings.codexSetup.eachAccountHasItsOwnCodexInstanceAndSignInChooseTheOtherAccountOnTheSignInPage",
          )}
        />
        <WizardPanel>
          {instanceId ? (
            provider?.setup ? (
              renderSetup(instanceId, provider)
            ) : (
              <SettingsRow
                title={t("settings.codexSetup.codexRuntime")}
                description={t("settings.codexSetup.preparingManagedSetup")}
              />
            )
          ) : (
            <form
              id="add-codex-account"
              onSubmit={(event) => {
                event.preventDefault();
                void createAccount();
              }}
            >
              <SettingsRow
                title={t("settings.codexSetup.accountName")}
                description={t("settings.codexSetup.shownInTheProviderListAndModelPicker")}
                control={
                  <Input
                    aria-label={t("settings.codexSetup.accountName")}
                    value={name}
                    disabled={pending}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("settings.codexSetup.eGPersonalOrWork")}
                  />
                }
              />
            </form>
          )}
        </WizardPanel>
        <WizardFooter>
          {instanceId ? (
            <Button variant="outline" onClick={onClose}>
              {t("settings.snapShotSetupDialog.finishLater")}
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={onClose}>
                {t("action.cancel")}
              </Button>
              <Button type="submit" form="add-codex-account" disabled={pending || !name.trim()}>
                {pending ? t("settings.codexSetup.addingAccount") : t("action.continue")}
              </Button>
            </>
          )}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
