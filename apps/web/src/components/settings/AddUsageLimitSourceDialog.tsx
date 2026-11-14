import { useI18n } from "../../hooks/useI18n";
import type {
  EnvironmentId,
  SecretReference,
  UnifiedSettings,
  UsageLimitSourceConfig,
} from "@t3tools/contracts";
import { useState } from "react";

import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
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
import { sourceIdFromUrl } from "./AddUsageLimitSourceDialog.logic";
import { SecretSourceInput, useSecretSources } from "./SecretSourceInput";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

/** Send credentials once to server secret storage; settings retain only a redaction marker. */
export function AddUsageLimitSourceDialog({
  open,
  onOpenChange,
  environmentId,
  environmentLabel,
  sources,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly sources: UnifiedSettings["usageLimitSources"];
}) {
  const { t } = useI18n();
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const [kind, setKind] = useState<UsageLimitSourceConfig["kind"]>("cliproxy");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [hubUrl, setHubUrl] = useState("");
  const secretSources = useSecretSources(environmentId);
  const [keyDraft, setKeyDraft] = useState<string | SecretReference>("");
  const [keyValid, setKeyValid] = useState(true);
  const [tokenDraft, setTokenDraft] = useState<string | SecretReference>("");
  const [tokenValid, setTokenValid] = useState(true);
  const managementKey = typeof keyDraft === "string" ? keyDraft.trim() : keyDraft;
  const readToken = typeof tokenDraft === "string" ? tokenDraft.trim() : tokenDraft;
  const trimmedUrl = url.trim();
  const trimmedHubUrl = hubUrl.trim();
  const canSave =
    keyValid &&
    trimmedUrl.length > 0 &&
    (kind === "cliproxy"
      ? managementKey !== ""
      : tokenValid && readToken !== "" && trimmedHubUrl.length > 0 === (managementKey !== ""));

  const reset = () => {
    setKind("cliproxy");
    setLabel("");
    setUrl("");
    setHubUrl("");
    setKeyDraft("");
    setKeyValid(true);
    setTokenDraft("");
    setTokenValid(true);
  };

  const save = () => {
    if (!canSave) return;
    const id = sourceIdFromUrl(kind, trimmedUrl, sources);
    updateSettings({
      usageLimitSources: {
        [id]: {
          kind,
          ...(label.trim() ? { label: label.trim() } : {}),
          url: trimmedUrl,
          readToken: kind === "relay" ? readToken : "",
          ...(kind === "relay" && trimmedHubUrl ? { hubUrl: trimmedHubUrl } : {}),
          managementKey,
          enabled: true,
        },
      },
    });
    reset();
    onOpenChange(false);
  };

  const managementKeyField = (
    <div className="grid gap-1.5">
      <Label htmlFor="usage-source-key">{t("settings.providers.managementKey")}</Label>
      <SecretSourceInput
        id="usage-source-key"
        aria-label={t("settings.providers.managementKey")}
        value={keyDraft}
        sources={secretSources}
        onChange={(event) => setKeyDraft(event.target.value)}
        onSecretChange={(secret) => setKeyDraft(secret ?? "")}
        onValidityChange={setKeyValid}
      />
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.providers.addHubTitle")}</DialogTitle>
          <DialogDescription>
            {kind === "relay" ? (
              t("settings.providers.relayDescription", { environment: environmentLabel })
            ) : (
              <>
                {t("v2.settings.showTheQuotaOfEveryAccountTheHubPoolsNextToThe")} {environmentLabel}
                {t("v2.settings.theKeyStaysOnThatServer")}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-kind">{t("settings.providers.sourceType")}</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (value === "cliproxy" || value === "relay") setKind(value);
                }}
              >
                <SelectTrigger id="usage-source-kind">
                  <SelectValue>
                    {kind === "relay"
                      ? t("settings.providers.relaySource")
                      : t("settings.providers.cliproxySource")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="cliproxy">{t("settings.providers.cliproxySource")}</SelectItem>
                  <SelectItem value="relay">{t("settings.providers.relaySource")}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-url">
                {kind === "relay"
                  ? t("settings.providers.relayUrl")
                  : t("settings.providers.hubUrl")}
              </Label>
              <Input
                id="usage-source-url"
                placeholder={
                  kind === "relay"
                    ? "https://relay.example.ts.net:8791"
                    : "https://hub.example.ts.net:8318"
                }
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                autoFocus
              />
            </div>
            {kind === "relay" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="usage-source-token">{t("settings.providers.readToken")}</Label>
                <SecretSourceInput
                  id="usage-source-token"
                  aria-label={t("settings.providers.readToken")}
                  value={tokenDraft}
                  sources={secretSources}
                  onChange={(event) => setTokenDraft(event.target.value)}
                  onSecretChange={(secret) => setTokenDraft(secret ?? "")}
                  onValidityChange={setTokenValid}
                />
              </div>
            ) : (
              managementKeyField
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-label">{t("settings.providers.optionalLabel")}</Label>
              <Input
                id="usage-source-label"
                placeholder={t("settings.providers.hubLabelPlaceholder")}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            {kind === "relay" ? (
              // The relay is read-only, so redeeming a reset goes to the hub; both fields or neither.
              <div
                role="group"
                aria-labelledby="usage-source-reset-heading"
                className="grid gap-3 border-t pt-4"
              >
                <div className="grid gap-0.5">
                  <p id="usage-source-reset-heading" className="text-sm font-medium">
                    {t("settings.providers.resetCreditsHub")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.providers.resetCreditsHubHelp")}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="usage-source-hub-url">{t("settings.providers.hubUrl")}</Label>
                  <Input
                    id="usage-source-hub-url"
                    placeholder="https://hub.example.ts.net:8318"
                    value={hubUrl}
                    onChange={(event) => setHubUrl(event.target.value)}
                  />
                </div>
                {managementKeyField}
              </div>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {t("action.cancel")}
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {t("settings.providers.addHub")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
