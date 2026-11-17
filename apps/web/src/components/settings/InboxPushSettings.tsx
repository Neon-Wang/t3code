import { useAtomValue } from "@effect/atom-react";
import {
  AuthSettingsWriteScope,
  type EnvironmentId,
  type InboxPushSettings as PushSettings,
  type SecretReference,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { SecretSourceInput, useSecretSources } from "./SecretSourceInput";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function InboxPushSettings({
  environmentId,
  settings,
}: {
  environmentId: EnvironmentId;
  settings: PushSettings;
}) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  if (config?.environment.capabilities.inboxPush !== true) return null;
  return (
    <InboxPushForm
      key={`${environmentId}:${JSON.stringify(settings)}`}
      environmentId={environmentId}
      settings={settings}
    />
  );
}

function InboxPushForm({
  environmentId,
  settings,
}: {
  environmentId: EnvironmentId;
  settings: PushSettings;
}) {
  const { t } = useI18n();
  const canWrite = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const canRemove = useAtomValue(
    serverEnvironment.unregisterPushDevice.permissionAtom(environmentId),
  );
  const remove = useAtomCommand(serverEnvironment.unregisterPushDevice);
  const update = useUpdateEnvironmentSettings(environmentId);
  const sources = useSecretSources(environmentId);
  const result = useAtomValue(serverEnvironment.inboxLive({ environmentId, input: {} }));
  const [enabled, setEnabled] = useState(settings.enabled);
  const [url, setUrl] = useState(settings.relayUrl);
  const [secret, setSecret] = useState<string | SecretReference>(settings.relaySecret);
  const [secretValid, setSecretValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  let urlValid = url.trim() === "";
  try {
    const parsed = new URL(url.trim());
    urlValid =
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash;
  } catch {
    /* Empty addresses disable delivery; other invalid addresses cannot be saved. */
  }
  const devices = AsyncResult.getOrElse(result, () => null)?.pushDevices ?? [];

  return (
    <SettingsSection title={t("inbox.push.title")}>
      <form
        className="grid gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          setFailed(false);
          setSaved(false);
          update(
            { inboxPush: { enabled, relayUrl: url.trim(), relaySecret: secret } },
            {
              onSaved: () => {
                setSaving(false);
                setSaved(true);
              },
              onFailed: () => {
                setSaving(false);
                setFailed(true);
              },
            },
          );
        }}
      >
        <SettingsRow
          title={t("inbox.push.enabled")}
          description={t("inbox.push.description")}
          control={
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!canWrite || saving}
              aria-label={t("inbox.push.enabled")}
            />
          }
        />
        <div className="grid gap-1.5">
          <Label htmlFor="inbox-push-url">{t("inbox.push.url")}</Label>
          <Input
            id="inbox-push-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={!canWrite || saving}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inbox-push-secret">{t("inbox.push.secret")}</Label>
          <SecretSourceInput
            id="inbox-push-secret"
            value={secret}
            sources={sources}
            onChange={(event) => setSecret(event.target.value)}
            onSecretChange={(value) => setSecret(value ?? "")}
            onValidityChange={setSecretValid}
            disabled={!canWrite || saving}
          />
        </div>
        {failed ? <p role="alert">{t("inbox.push.saveFailed")}</p> : null}
        {saved ? <p role="status">{t("inbox.push.saved")}</p> : null}
        <div>
          <Button type="submit" disabled={!canWrite || saving || !secretValid || !urlValid}>
            {t(saving ? "inbox.push.saving" : "inbox.push.save")}
          </Button>
        </div>
      </form>
      {result._tag === "Failure" ? (
        <SettingsRow title={t("inbox.push.devicesFailed")} />
      ) : result._tag === "Initial" ? (
        <SettingsRow title={t("inbox.loading")} />
      ) : devices.length === 0 ? (
        <SettingsRow title={t("inbox.push.noDevices")} />
      ) : (
        devices.map((device) => (
          <SettingsRow
            key={device.deviceId}
            title={device.label || device.deviceId}
            description={device.provider.toUpperCase()}
            control={
              <Button
                size="xs"
                variant="ghost"
                disabled={!canRemove || removing !== null}
                onClick={async () => {
                  setRemoving(device.deviceId);
                  await remove({ environmentId, input: { deviceId: device.deviceId } });
                  setRemoving(null);
                }}
              >
                {t("inbox.push.remove")}
              </Button>
            }
          />
        ))
      )}
    </SettingsSection>
  );
}
