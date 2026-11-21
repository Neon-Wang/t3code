import { T, useGT, Var } from "gt-react";
import type {
  EnvironmentId,
  SecretReference,
  UnifiedSettings,
  UsageLimitSourceConfig,
} from "@t3tools/contracts";
import { useId, useState } from "react";

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
  const gt = useGT();
  const formId = useId();
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
    const id = sourceIdFromUrl(trimmedUrl, sources, kind);
    updateSettings({
      usageLimitSources: {
        [id]: {
          kind,
          ...(label.trim() ? { label: label.trim() } : {}),
          url: trimmedUrl,
          ...(kind === "relay" ? { readToken } : {}),
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
      <Label htmlFor="usage-source-key">{gt("Management key")}</Label>
      <SecretSourceInput
        id="usage-source-key"
        aria-label={gt("Management key")}
        value={keyDraft}
        environmentId={environmentId}
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
          <DialogTitle>{gt("Add usage source")}</DialogTitle>
          <DialogDescription>
            {kind === "relay" ? (
              gt("Show account limits from the relay on {environment}.", {
                environment: environmentLabel,
              })
            ) : (
              <T>
                Show the quota of every account the hub pools, next to the providers on{" "}
                <Var>{environmentLabel}</Var>. The key stays on that server.
              </T>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-kind">{gt("Source type")}</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (value === "cliproxy" || value === "relay") {
                    reset();
                    setKind(value);
                  }
                }}
              >
                <SelectTrigger id="usage-source-kind">
                  <SelectValue>
                    {kind === "relay" ? gt("Usage relay") : gt("CLI Proxy")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="cliproxy">{gt("CLI Proxy")}</SelectItem>
                  <SelectItem value="relay">{gt("Usage relay")}</SelectItem>
                </SelectPopup>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usage-source-url">
                {kind === "relay" ? gt("Relay URL") : gt("Hub URL")}
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
                <Label htmlFor="usage-source-token">{gt("Read token")}</Label>
                <SecretSourceInput
                  id="usage-source-token"
                  aria-label={gt("Read token")}
                  value={tokenDraft}
                  environmentId={environmentId}
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
              <Label htmlFor="usage-source-label">{gt("Label (optional)")}</Label>
              <Input
                id="usage-source-label"
                placeholder={gt("Defaults to the hub's host name")}
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
                    {gt("Reset credits hub (optional)")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {gt("Enter both fields to redeem reset credits through the hub.")}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="usage-source-hub-url">{gt("Hub URL")}</Label>
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
            {gt("Cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={!canSave}>
            {gt("Add usage source")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
