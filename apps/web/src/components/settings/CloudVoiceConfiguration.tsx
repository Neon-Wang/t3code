import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { cloudSpeechDisclosure } from "@t3tools/shared/speech";
import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import {
  configuredSecretSources,
  secretRequestReference,
} from "@t3tools/client-runtime/secret-request";
import {
  getCloudSpeechKeys,
  getCloudSpeechModels,
  setCloudSpeechKey,
} from "@t3tools/client-runtime/voice-input";
import {
  AuthOrchestrationOperateScope,
  AuthSettingsWriteScope,
  CloudSpeechApiKey,
  CloudSpeechModelId,
  CLOUD_SPEECH_LABELS,
  CLOUD_SPEECH_PROVIDER_NAMES,
  isSecretReference,
  type CloudSpeechModel,
  type CloudSpeechProvider,
  type SecretProviderId,
  type SettingsSecretValue,
  type VoiceTranscriptionDestination,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { HttpClient } from "effect/http";
import { Atom, AsyncResult } from "effect/reactivity";
import { useId, useState } from "react";
import { isSecretsFeatureEnabled } from "../../env";
import {
  inEnvironmentSpeechRuntime,
  runEnvironmentSpeech,
} from "../../speech/runEnvironmentSpeech";
import {
  chooseAudioDestination,
  pendingCloudAudioChoice,
  useAudioChoice,
} from "../../speech/voiceConsent";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentScope, usePreparedConnection } from "../../state/session";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  useComboboxFilter,
} from "../ui/combobox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SecretInput } from "./SecretInput";
import { SecretSourceSelect } from "./SecretSourceInput";

import { useI18n } from "../../hooks/useI18n";
// Per dialog instance, not an Atom.family: key presence must be read fresh each time it opens.
function useCloudRead<A, E>(
  prepared: PreparedConnection | null,
  read: (prepared: PreparedConnection) => Effect.Effect<A, E, HttpClient.HttpClient>,
) {
  const make = (connection: PreparedConnection | null) => ({
    prepared: connection,
    atom: Atom.make(
      connection ? inEnvironmentSpeechRuntime(read(connection)) : Effect.succeed(null),
    ),
  });
  const [current, setCurrent] = useState(() => make(prepared));
  if (current.prepared !== prepared) setCurrent(make(prepared));
  return [useAtomValue(current.atom), useAtomRefresh(current.atom)] as const;
}
const isApiKey = Schema.is(CloudSpeechApiKey);
const isModelId = Schema.is(CloudSpeechModelId);
type CloudDestination = Extract<VoiceTranscriptionDestination, { kind: "cloud" }>;

function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  current,
}: {
  models: ReadonlyArray<CloudSpeechModel>;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  /** The grant's model, flagged when the catalog no longer lists it. */
  current: string | undefined;
}) {
  const { t } = useI18n();
  const { contains } = useComboboxFilter();
  const selected = models.find((model) => model.id === value) ?? null;
  const delisted = current !== undefined && !models.some((model) => model.id === current);
  return (
    <div className="grid gap-1">
      <Combobox
        items={models}
        itemToStringLabel={(model: CloudSpeechModel) => model.name}
        itemToStringValue={(model: CloudSpeechModel) => model.id}
        filter={(model: CloudSpeechModel, query) =>
          contains(model.name, query) || contains(model.id, query)
        }
        value={selected}
        onValueChange={(model) => onChange(model?.id ?? "")}
        autoHighlight
        disabled={disabled}
      >
        <ComboboxInput
          id="voice-cloud-model"
          aria-label={t("settings.cloudVoice.openRouterModel")}
          placeholder={t("mobile.cloudVoice.searchTranscriptionModels")}
          autoFocus
          size="sm"
        />
        <ComboboxPopup>
          <ComboboxEmpty>{t("mobile.cloudVoice.noModelMatches")}</ComboboxEmpty>
          <ComboboxList className="max-h-64">
            {(model: CloudSpeechModel) => (
              <ComboboxItem key={model.id} value={model}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{model.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{model.id}</span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      {delisted ? (
        <p className="text-sm text-destructive" role="alert">
          {t("mobile.cloudVoice.modelDelisted", { model: current })}
        </p>
      ) : selected ? (
        <p className="truncate text-xs text-muted-foreground">{selected.id}</p>
      ) : null}
    </div>
  );
}

export function CloudVoiceConfiguration({
  environment,
  provider,
  active,
  close,
}: {
  environment: Pick<EnvironmentPresentation, "environmentId" | "label" | "serverConfig">;
  provider: CloudSpeechProvider;
  active: boolean;
  close: () => void;
}) {
  const { t } = useI18n();
  const id = environment.environmentId;
  const name = CLOUD_SPEECH_LABELS[provider];
  const company = CLOUD_SPEECH_PROVIDER_NAMES[provider];
  const routed = provider === "openrouter";
  const formId = useId();
  const prepared = Option.getOrNull(usePreparedConnection(id));
  const canUse = useEnvironmentScope(id, AuthOrchestrationOperateScope);
  const canManage = useEnvironmentScope(id, AuthSettingsWriteScope);
  const [presence, refresh] = useCloudRead(canUse ? prepared : null, getCloudSpeechKeys);
  const [models, refreshModels] = useCloudRead(
    routed && canUse ? prepared : null,
    getCloudSpeechModels,
  );
  const choice = useAudioChoice();
  const grant = choice === "off" ? null : choice;
  const currentModel =
    active && grant?.destination.kind === "cloud" && grant.destination.provider === "openrouter"
      ? grant.destination.model
      : undefined;
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState(currentModel ?? "");
  const saved = AsyncResult.isSuccess(presence) ? presence.value?.[provider] : undefined;
  const existing = environment.serverConfig?.settings?.cloudSpeechCredentials?.[provider];
  const sources =
    isSecretsFeatureEnabled && environment.serverConfig?.secretReferences
      ? configuredSecretSources(environment.serverConfig.settings?.secretProviders ?? {})
      : [];
  const reference =
    isSecretReference(existing) && sources.some((s) => s.id === existing.provider)
      ? existing
      : null;
  const [sourceId, setSourceId] = useState<SecretProviderId | null>(reference?.provider ?? null);
  const [draft, setDraft] = useState(reference?.reference ?? "");
  const source = sources.find((s) => s.id === sourceId);
  const credential =
    sourceId !== null
      ? source && secretRequestReference(source, draft)
      : isApiKey(draft.trim())
        ? draft.trim()
        : undefined;
  const keyChanged =
    credential !== undefined &&
    !(
      isSecretReference(credential) &&
      reference?.provider === credential.provider &&
      reference.reference === credential.reference
    );
  const connected = canUse && prepared !== null;
  // Fixed providers edit the key only when nothing is saved or the device already uses them.
  const editingKey = canManage && saved !== undefined && (routed || active || !saved);
  const listedModels = AsyncResult.isSuccess(models) ? (models.value?.models ?? null) : null;
  const modelChosen = isModelId(model) && (listedModels?.some((m) => m.id === model) ?? false);
  const keyReady = draft.trim() ? credential !== undefined : Boolean(saved);
  const modelChanged = model !== (currentModel ?? "");
  const destination = (): CloudDestination =>
    routed && isModelId(model)
      ? { kind: "cloud", provider: "openrouter", environmentId: id, model }
      : { kind: "cloud", provider: provider as "openai" | "xai", environmentId: id };
  const enable = () => chooseAudioDestination(destination());
  const canSubmit = routed
    ? modelChosen && keyReady && (!active || modelChanged || keyChanged)
    : credential !== undefined;

  const saveKey = async (value: SettingsSecretValue | null, thenEnable: boolean) => {
    if (!connected || !canManage || busy) return;
    setError("");
    setBusy(true);
    try {
      const commit = thenEnable ? pendingCloudAudioChoice(destination()) : null;
      await runEnvironmentSpeech(setCloudSpeechKey(prepared, provider, value));
      refresh();
      commit?.();
      close();
    } catch {
      setError(t("settings.cloudVoice.couldNotSaveChange"));
    }
    setBusy(false);
  };
  const submit = () => {
    if (!canSubmit || busy) return;
    const grantChanges = !active || modelChanged;
    if (credential !== undefined && (!routed || keyChanged))
      return void saveKey(credential, grantChanges);
    // Model-only changes never write to the environment.
    if (grantChanges) enable();
    close();
  };

  const keyField = (
    <>
      <Label htmlFor="voice-cloud-key">
        {routed && saved
          ? t("settings.cloudVoice.replaceKey")
          : t("settings.providers.field.apiKey")}
      </Label>
      <div className="flex min-w-0 items-start gap-2">
        {sources.length > 0 && (
          <SecretSourceSelect
            value={sourceId}
            sources={sources}
            label={t("mobile.cloudVoice.keyLabel", { label: company })}
            disabled={busy}
            onValueChange={(next) => {
              setSourceId(next);
              setDraft("");
              setError("");
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          {sourceId !== null ? (
            <Input
              key={sourceId}
              id="voice-cloud-key"
              name="reference"
              aria-label={t("mobile.cloudVoice.keyReference", { label: company })}
              autoFocus={!routed}
              placeholder={source?.referencePlaceholder}
              value={draft}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <SecretInput
              id="voice-cloud-key"
              name="key"
              aria-label={t("mobile.cloudVoice.keyLabel", { label: company })}
              autoFocus={!routed}
              placeholder={t("settings.cloudVoice.enterKey")}
              value={draft}
              configured={saved === true}
              disabled={busy}
              maxLength={4096}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {draft.trim() && !credential
          ? (source?.invalidReferenceMessage ?? t("settings.cloudVoice.enterKeyNotUrl"))
          : active && !routed
            ? t("settings.cloudVoice.updatingKeepsEnabled")
            : routed && saved
              ? t("settings.cloudVoice.leaveBlank")
              : t("mobile.cloudVoice.anyoneCanBill", { environment: environment.label })}
      </p>
    </>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {remove
              ? t("settings.cloudVoice.removeTitle", { company })
              : active
                ? routed
                  ? t("settings.cloudVoice.manageOpenRouter")
                  : t("settings.cloudVoice.manageKey", { company })
                : t("mobile.cloudVoice.useForDictationTitle", { label: name })}
          </DialogTitle>
          <DialogDescription>
            {remove
              ? t("settings.cloudVoice.removeDescription", { name, environment: environment.label })
              : active && !routed
                ? t("settings.cloudVoice.anyoneCanUse", { environment: environment.label })
                : cloudSpeechDisclosure(provider, environment.label)}
          </DialogDescription>
        </DialogHeader>
        {!remove && (
          <DialogPanel>
            {!connected ? (
              <p>
                {t("settings.cloudVoice.connectToContinue", { environment: environment.label })}
              </p>
            ) : AsyncResult.isFailure(presence) && saved === undefined ? (
              <Button size="sm" variant="outline" onClick={refresh}>
                {t("settings.cloudVoice.retryLoadingKey")}
              </Button>
            ) : routed &&
              AsyncResult.isSuccess(presence) &&
              presence.value &&
              saved === undefined ? (
              <p>{t("settings.cloudVoice.updateToUse", { environment: environment.label })}</p>
            ) : saved === undefined ? (
              <p role="status">{t("settings.cloudVoice.checkingForKey")}</p>
            ) : routed ? (
              <form
                id={formId}
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="voice-cloud-model">
                    {t("settings.projectDefaultsSettings.model")}
                  </Label>
                  {listedModels ? (
                    <ModelPicker
                      models={listedModels}
                      value={model}
                      onChange={setModel}
                      disabled={busy}
                      current={currentModel}
                    />
                  ) : AsyncResult.isFailure(models) ? (
                    <Button size="sm" variant="outline" type="button" onClick={refreshModels}>
                      {t("settings.cloudVoice.retryLoadingModels")}
                    </Button>
                  ) : (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t("mobile.cloudVoice.loadingModels")}
                    </p>
                  )}
                </div>
                {editingKey ? (
                  <div className="grid gap-2">{keyField}</div>
                ) : !saved ? (
                  <p>
                    {t("settings.cloudVoice.askAdminAddKey", { environment: environment.label })}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("settings.cloudVoice.usesSavedKeyDevice", {
                      environment: environment.label,
                    })}
                  </p>
                )}
              </form>
            ) : editingKey ? (
              <form
                id={formId}
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                {keyField}
              </form>
            ) : !saved ? (
              <p>{t("settings.cloudVoice.askAdminAddKey", { environment: environment.label })}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("settings.cloudVoice.deviceOnlyChooseOff")}
              </p>
            )}
          </DialogPanel>
        )}
        {error && (
          <p className="px-6 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          {connected && canManage && saved && (active || routed) && !remove && (
            <div className="sm:mr-auto">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setRemove(true)}
              >
                {t("settings.cloudVoice.removeKeyEllipsis")}
              </Button>
            </div>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>
            {t("action.cancel")}
          </Button>
          {connected &&
            (remove ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void saveKey(null, false)}
              >
                {t("mobile.cloudVoice.removeKey")}
              </Button>
            ) : routed ? (
              saved !== undefined && (saved || canManage) ? (
                <Button type="submit" form={formId} size="sm" disabled={busy || !canSubmit}>
                  {active ? t("action.save") : t("mobile.cloudVoice.saveAndEnable")}
                </Button>
              ) : null
            ) : editingKey ? (
              <Button type="submit" form={formId} size="sm" disabled={busy || !credential}>
                {active ? t("mobile.cloudVoice.saveKey") : t("mobile.cloudVoice.saveAndEnable")}
              </Button>
            ) : saved && !active ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  enable();
                  close();
                }}
              >
                {t("mobile.cloudVoice.useLabel", { label: name })}
              </Button>
            ) : null)}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
