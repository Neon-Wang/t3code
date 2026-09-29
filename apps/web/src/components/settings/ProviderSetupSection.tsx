import type { MessageKey } from "@t3tools/shared/i18n";
import { translateProviderSettingsText } from "./ProviderSettingsForm";
import { useI18n } from "../../hooks/useI18n";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  ANTIGRAVITY_AUTH_METHODS,
  type AntigravityAuthMethod,
  type EnvironmentId,
  type ProviderAuthState,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsRow } from "./settingsLayout";

interface ProviderSetupSectionProps {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
  readonly binaryPath?: string | undefined;
  readonly authMethod?: AntigravityAuthMethod | undefined;
  readonly enabled: boolean;
  readonly readOnly: boolean;
  readonly onEnable: () => void;
}

const AUTH_PHASE_LABELS: Record<ProviderAuthState["phase"], MessageKey> = {
  idle: "settings.providers.authIdle",
  starting: "settings.providers.authStarting",
  waiting: "settings.providers.authWaiting",
  verifying: "settings.providers.authVerifying",
  succeeded: "settings.providers.authSucceeded",
  failed: "settings.providers.authFailed",
  cancelled: "settings.providers.authCancelled",
};

/** API key methods skip the browser, so the phases read as a credential check. */
const CREDENTIAL_PHASE_LABELS: Record<ProviderAuthState["phase"], MessageKey> = {
  idle: "settings.providers.credentialIdle",
  starting: "settings.providers.credentialChecking",
  waiting: "settings.providers.credentialChecking",
  verifying: "settings.providers.credentialVerifying",
  succeeded: "settings.providers.connected",
  failed: "settings.providers.credentialFailed",
  cancelled: "settings.providers.connectionCancelled",
};

/** Read the configured method from the instance config. Unknown values fall back to personal. */
export function readAntigravityAuthMethod(config: unknown): AntigravityAuthMethod {
  const value =
    config !== null && typeof config === "object" && "authMethod" in config
      ? config.authMethod
      : undefined;
  return (
    ANTIGRAVITY_AUTH_METHODS.find((method) => method.value === value)?.value ?? "oauth-personal"
  );
}

/** Setup state belongs to the selected environment and is never saved in client settings. */
export function ProviderSetupSection(props: ProviderSetupSectionProps) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("settings.providers.antigravitySetup")}
      className="@container/setup divide-y divide-border/50 text-xs"
    >
      <SettingsRow
        className="@max-lg/setup:[&>div:first-child]:flex @max-lg/setup:[&>div:first-child]:items-stretch @max-lg/setup:[&>div:first-child]:gap-3"
        title={t("settings.scope.environment")}
        description={t("settings.providers.providerDevice")}
        control={
          <div className="flex min-w-0 flex-col gap-2 sm:items-end">
            <span className="text-muted-foreground [overflow-wrap:anywhere]">
              {props.environmentLabel}
            </span>
            {!props.enabled && !props.readOnly ? (
              <Button size="sm" variant="outline" onClick={props.onEnable}>
                {t("settings.providers.enableAntigravity")}
              </Button>
            ) : null}
          </div>
        }
      />
      {props.readOnly ? (
        <SettingsRow
          title={t("settings.providers.setupUnavailable")}
          description={t("settings.providers.setupReadOnly")}
        />
      ) : props.provider?.setup === undefined ? (
        <SettingsRow
          title={t("settings.providers.updateRequired")}
          description={t("settings.providers.updateEnvironment")}
        />
      ) : (
        <ProviderSetupActions
          key={`${props.environmentId}:${props.instanceId}`}
          environmentId={props.environmentId}
          environmentLabel={props.environmentLabel}
          instanceId={props.instanceId}
          provider={props.provider}
          binaryPath={props.binaryPath}
          authMethod={props.authMethod ?? "oauth-personal"}
          enabled={props.enabled}
        />
      )}
    </section>
  );
}

function ProviderSetupActions({
  environmentId,
  environmentLabel,
  instanceId,
  provider,
  enabled,
  binaryPath,
  authMethod,
}: Pick<
  ProviderSetupSectionProps,
  "environmentId" | "environmentLabel" | "instanceId" | "enabled" | "binaryPath"
> & {
  readonly provider: ServerProvider;
  readonly authMethod: AntigravityAuthMethod;
}) {
  const { t, locale } = useI18n();
  const target = { environmentId, input: { instanceId } };
  const usesBrowser = authMethod === "oauth-personal" || authMethod === "oauth-business";
  const phaseLabels = usesBrowser ? AUTH_PHASE_LABELS : CREDENTIAL_PHASE_LABELS;
  const methodLabel = translateProviderSettingsText(
    ANTIGRAVITY_AUTH_METHODS.find((method) => method.value === authMethod)?.label ??
      "Google account",
    t,
  );
  const authQuery = useEnvironmentQuery(serverEnvironment.providerAuthState(target));
  const installQuery = useEnvironmentQuery(serverEnvironment.providerInstallState(target));
  const auth = authQuery.data;
  const installation = installQuery.data;
  const commandOptions = { reportFailure: false, reportDefect: false };
  const startAuth = useAtomCommand(serverEnvironment.startProviderAuth, commandOptions);
  const completeAuth = useAtomCommand(serverEnvironment.completeProviderAuth, commandOptions);
  const cancelAuth = useAtomCommand(serverEnvironment.cancelProviderAuth, commandOptions);
  const logoutAuth = useAtomCommand(serverEnvironment.logoutProviderAuth, commandOptions);
  const startInstall = useAtomCommand(serverEnvironment.startProviderInstall, commandOptions);
  const cancelInstall = useAtomCommand(serverEnvironment.cancelProviderInstall, commandOptions);
  const removeInstall = useAtomCommand(
    serverEnvironment.removeProviderInstallation,
    commandOptions,
  );
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackDraft, setCallbackDraft] = useState({ flowId: null as string | null, value: "" });
  const [copiedFlowId, setCopiedFlowId] = useState<string | null>(null);
  const callbackUrl = callbackDraft.flowId === auth?.flowId ? callbackDraft.value : "";
  const authActive =
    auth?.phase === "starting" || auth?.phase === "waiting" || auth?.phase === "verifying";
  const installActive =
    installation?.phase === "downloading" ||
    installation?.phase === "extracting" ||
    installation?.phase === "verifying";
  const usesCustomBinary = Boolean(binaryPath?.trim());
  const installed =
    provider.installed || (!usesCustomBinary && installation?.installedVersion != null);
  const authenticated = provider.auth.status === "authenticated";
  const authStatusMessage =
    auth === null
      ? t("settings.providers.readingSignIn")
      : authActive || auth.phase === "failed" || auth.phase === "cancelled"
        ? (auth.message ?? t(phaseLabels[auth.phase]))
        : authenticated
          ? usesBrowser
            ? t("settings.providers.signedInGoogle")
            : t("settings.providers.connected")
          : auth.phase === "idle" && auth.message
            ? auth.message
            : t(phaseLabels.idle);
  const authorizationUrl = auth?.phase === "waiting" ? auth.authorizationUrl : null;
  const queryError = authQuery.error ?? installQuery.error;
  const actionsDisabled = pendingLabel !== null || queryError !== null;
  const installationStatusMessage =
    installation?.phase === "downloading"
      ? installation.totalBytes === null
        ? t("settings.providers.downloadProgress", {
            downloaded: (installation.downloadedBytes / 1_000_000).toFixed(1),
          })
        : t("settings.providers.downloadProgressTotal", {
            downloaded: (installation.downloadedBytes / 1_000_000).toFixed(1),
            total: (installation.totalBytes / 1_000_000).toFixed(1),
          })
      : installation?.phase === "extracting"
        ? t("settings.providers.extracting")
        : installation?.phase === "verifying"
          ? t("settings.providers.checkingRuntime")
          : installed
            ? t("settings.providers.installed")
            : usesCustomBinary
              ? enabled
                ? t("settings.providers.customRuntimeUnavailable")
                : t("settings.providers.customRuntimeUnchecked")
              : installation?.totalBytes
                ? t("settings.providers.downloadSize", {
                    size: Math.ceil(installation.totalBytes / 1_000_000),
                  })
                : t("settings.providers.notInstalled");

  async function runCommand<A, E>(
    label: string,
    request: () => Promise<AtomCommandResult<A, E>>,
  ): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPendingLabel(label);
    setError(null);
    try {
      const result = await request();
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const failure = squashAtomCommandFailure(result);
          setError(
            failure instanceof Error ? failure.message : t("settings.providers.setupFailed"),
          );
        }
        return false;
      }
      return true;
    } catch {
      setError(t("settings.providers.setupRetry"));
      return false;
    } finally {
      pendingRef.current = false;
      setPendingLabel(null);
    }
  }

  async function openSignInPage() {
    if (!authorizationUrl) return;
    try {
      await ensureLocalApi().shell.openExternal(authorizationUrl);
      setError(null);
    } catch {
      setError(t("settings.providers.openSignInFailed"));
    }
  }

  async function copySignInLink() {
    if (!authorizationUrl) return;
    try {
      await writeTextToClipboard(authorizationUrl, t("settings.providers.googleSignInLink"));
      setCopiedFlowId(auth?.flowId ?? null);
      setError(null);
    } catch {
      setError(t("settings.providers.copySignInFailed"));
    }
  }

  async function submitCallback() {
    const flowId = auth?.flowId;
    if (!flowId || !callbackUrl.trim() || auth.phase !== "waiting") return;
    const accepted = await runCommand(t("settings.providers.checkingRedirect"), () =>
      completeAuth({ environmentId, input: { instanceId, flowId, callbackUrl } }),
    );
    if (accepted) {
      setCallbackDraft({ flowId: null, value: "" });
    }
  }

  async function signOut() {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      t("settings.providers.signOutConfirm", {
        action: usesBrowser ? t("settings.providers.signOutGoogle") : t("action.disconnect"),
        provider: provider.displayName ?? "Antigravity",
        environment: environmentLabel,
      }),
    );
    if (confirmed) {
      await runCommand(t("settings.providers.signingOut"), () => logoutAuth(target));
    }
  }

  async function removeRuntime() {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      t("settings.providers.removeRuntimeConfirm", { environment: environmentLabel }),
    );
    if (confirmed) {
      await runCommand(t("settings.providers.removingRuntime"), () => removeInstall(target));
    }
  }

  return (
    <div className="divide-y divide-border/50">
      <SettingsRow
        title={t("settings.providers.runtime")}
        className="@max-lg/setup:[&>div:first-child]:flex @max-lg/setup:[&>div:first-child]:items-stretch @max-lg/setup:[&>div:first-child]:gap-3"
        description={t("settings.providers.manageAntigravity")}
        status={
          <div className="space-y-2">
            {usesCustomBinary ? (
              <p className="text-muted-foreground">{t("settings.providers.customBinaryHelp")}</p>
            ) : null}
            {!installed && !provider.setup?.canInstall ? (
              <p className="text-muted-foreground">
                {t("settings.providers.autoInstallUnavailable")}
              </p>
            ) : null}
          </div>
        }
        control={
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-56 sm:text-right">
            <p role="status" className="min-h-4 text-muted-foreground tabular-nums">
              {installationStatusMessage}
            </p>
            <div className="h-1">
              {installation?.phase === "downloading" &&
              installation.totalBytes !== null &&
              installation.totalBytes > 0 ? (
                <progress
                  aria-label={t("settings.providers.antigravityDownload")}
                  className="block h-1 w-full accent-foreground"
                  value={installation.downloadedBytes}
                  max={installation.totalBytes}
                />
              ) : null}
            </div>
            {!installActive &&
            installation?.message &&
            installation.message !== installationStatusMessage ? (
              <p className="text-muted-foreground [overflow-wrap:anywhere]">
                {installation.message}
              </p>
            ) : null}
            <div className="grid min-h-7 grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
              <div className="col-start-2 row-start-1 grid">
                {installActive && installation.operationId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionsDisabled}
                    onClick={() => {
                      const operationId = installation.operationId;
                      if (!operationId) return;
                      void runCommand(t("settings.providers.cancellingInstall"), () =>
                        cancelInstall({ environmentId, input: { instanceId, operationId } }),
                      );
                    }}
                  >
                    {t("settings.providers.cancelInstall")}
                  </Button>
                ) : !installActive && provider.setup?.canInstall ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionsDisabled || installation === null || authActive}
                    onClick={() =>
                      void runCommand(t("settings.providers.startingInstall"), () =>
                        startInstall(target),
                      )
                    }
                  >
                    {installation?.installedVersion
                      ? installation.version &&
                        installation.version !== installation.installedVersion
                        ? t("settings.providers.updateAntigravity")
                        : t("settings.providers.reinstallAntigravity")
                      : installation?.phase === "failed" || installation?.phase === "cancelled"
                        ? t("settings.providers.retryInstall")
                        : installed
                          ? t("settings.providers.installManaged")
                          : t("settings.providers.installAntigravity")}
                  </Button>
                ) : null}
              </div>
              {installation?.canRemove && !installActive ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="col-start-1 row-start-1"
                        aria-label={t("settings.providers.removeRuntime")}
                        disabled={actionsDisabled || authActive}
                        onClick={() => void removeRuntime()}
                      />
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup>{t("settings.providers.removeRuntime")}</TooltipPopup>
                </Tooltip>
              ) : null}
            </div>
          </div>
        }
      />

      <SettingsRow
        title={methodLabel}
        className="@max-lg/setup:[&>div:first-child]:flex @max-lg/setup:[&>div:first-child]:items-stretch @max-lg/setup:[&>div:first-child]:gap-3"
        description={
          usesBrowser
            ? t("settings.providers.connectGoogle")
            : t("settings.providers.connectCredentials")
        }
        control={
          <div className="flex min-w-0 flex-col gap-2 sm:max-w-56 sm:items-end sm:text-right xl:max-w-72">
            <p
              role="status"
              className={
                authStatusMessage === t(phaseLabels.idle)
                  ? "sr-only"
                  : "text-muted-foreground [overflow-wrap:anywhere]"
              }
            >
              {authStatusMessage}
            </p>
            {authorizationUrl ? (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button size="sm" variant="outline" onClick={() => void openSignInPage()}>
                  {t("settings.providers.openSignIn")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void copySignInLink()}>
                  {copiedFlowId === auth?.flowId
                    ? t("settings.providers.linkCopied")
                    : t("settings.providers.copySignIn")}
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {authActive && auth?.flowId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actionsDisabled}
                  onClick={() => {
                    const flowId = auth.flowId;
                    if (!flowId) return;
                    void runCommand(t("settings.providers.cancellingSignIn"), () =>
                      cancelAuth({ environmentId, input: { instanceId, flowId } }),
                    );
                  }}
                >
                  {t("settings.providers.cancelSignIn")}
                </Button>
              ) : !authActive && !authenticated && provider.setup?.canAuthenticate ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionsDisabled || !installed || auth === null || installActive}
                  onClick={() =>
                    void runCommand(t("settings.providers.startingSignIn"), () => startAuth(target))
                  }
                >
                  {usesBrowser
                    ? auth?.phase === "failed" || auth?.phase === "cancelled"
                      ? t("settings.providers.retryGoogle")
                      : t("settings.providers.signInGoogle")
                    : auth?.phase === "failed" || auth?.phase === "cancelled"
                      ? t("settings.providers.retryConnection")
                      : t("action.connect")}
                </Button>
              ) : null}
              {!authActive && provider.setup?.canAuthenticate ? (
                <Button
                  size="sm"
                  variant={authenticated ? "outline" : "ghost"}
                  disabled={actionsDisabled || auth === null}
                  onClick={() => void signOut()}
                >
                  {usesBrowser ? t("settings.providers.signOutGoogle") : t("action.disconnect")}
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        {authorizationUrl || auth?.phase === "waiting" ? (
          <div className="space-y-2 pb-2">
            {authorizationUrl ? (
              <>
                {auth?.expiresAt ? (
                  <p className="text-muted-foreground">
                    <time dateTime={auth.expiresAt}>
                      {t("settings.providers.linkExpires", {
                        time: new Date(auth.expiresAt).toLocaleTimeString(locale, {
                          hour: "numeric",
                          minute: "2-digit",
                        }),
                      })}
                    </time>
                  </p>
                ) : null}
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitCallback();
                  }}
                >
                  <label htmlFor={`provider-callback-${instanceId}`}>
                    {t("settings.providers.callbackHelp")}
                  </label>
                  <Input
                    id={`provider-callback-${instanceId}`}
                    size="sm"
                    type="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="http://127.0.0.1:..."
                    value={callbackUrl}
                    maxLength={16_384}
                    disabled={actionsDisabled}
                    onChange={(event) =>
                      setCallbackDraft({ flowId: auth?.flowId ?? null, value: event.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    type="submit"
                    className="w-fit"
                    disabled={actionsDisabled || !callbackUrl.trim()}
                  >
                    {t("action.continue")}
                  </Button>
                </form>
              </>
            ) : auth?.phase === "waiting" ? (
              <p className="text-muted-foreground">{t("settings.providers.signInOtherClient")}</p>
            ) : null}
          </div>
        ) : null}
      </SettingsRow>

      <p className="sr-only" role="status">
        {pendingLabel}
      </p>
      {error || queryError ? (
        <div className="grid gap-2 px-3 py-3 sm:px-4">
          <p role="alert" className="text-destructive [overflow-wrap:anywhere]">
            {error ?? queryError}
          </p>
          {queryError ? (
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => {
                authQuery.refresh();
                installQuery.refresh();
              }}
            >
              {t("settings.providers.retrySetup")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
