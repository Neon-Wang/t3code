import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import { DeviceHostUpdates } from "./DeviceHostUpdates";
import type { DevicePlatform, DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import { Check } from "lucide-react";
import { Check as CheckGlyph, CircleAlert } from "lucide";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { MorphIcon } from "~/components/MorphIcon";
import { WizardHeader, WizardPanel, WizardSteps, WizardFooter } from "~/components/ui/wizard";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { deviceEnvironment } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { cn } from "~/lib/utils";

const platformName = (platform: DevicePlatform) => (platform === "ios" ? "iOS" : "Android");

export const deviceHubDescription = () =>
  i18n.t(
    "device.enableThisEnvironmentToOpenSimulatorsAndEmulatorsWhetherTheyRunHereOrOnARemoteDeviceHost",
  );
export const agentDeviceDescription = () =>
  i18n.t(
    "device.allowNewAgentSessionsInThisEnvironmentToStartAndControlLocalAndRemoteDevicesWithRequiredToolsSetUpAutomatically",
  );

export const isAndroidDiscoveryUncertain = (state: DeviceServiceState) =>
  Object.values(state.hostStatuses).some(
    (status) => status.status === "ready" && status.androidDiscoveryIncomplete,
  );

/**
 * `hostStatus` only tracks this machine. A machine without simulator tooling never
 * starts its own hub, so setup and the panel must also count remote device hosts.
 */
export function deviceHubReadiness(state: DeviceServiceState) {
  const statuses = Object.values(state.hostStatuses).map((host) => host.status);
  const ready = state.hostStatus === "ready" || statuses.includes("ready");
  const busy =
    !ready &&
    [state.hostStatus, ...statuses].some(
      (status) => status === "installing" || status === "starting",
    );
  return { ready, busy };
}

/** A ready host keeps its devices usable but may still carry a discovery warning. */
function deviceHostDiagnostics(
  hosts: ReadonlyArray<Pick<DeviceServiceState["hosts"][number], "id" | "label">>,
  hostStatuses: DeviceServiceState["hostStatuses"],
) {
  return hosts.flatMap((host) => {
    const status = hostStatuses[host.id];
    return status?.status === "ready" && status.detail
      ? [{ hostId: host.id, label: host.label, detail: status.detail }]
      : [];
  });
}

export function DeviceHostDiagnostics(props: {
  readonly hosts: ReadonlyArray<Pick<DeviceServiceState["hosts"][number], "id" | "label">>;
  readonly hostStatuses: DeviceServiceState["hostStatuses"];
  readonly className?: string;
}) {
  const diagnostics = deviceHostDiagnostics(props.hosts, props.hostStatuses);
  if (diagnostics.length === 0) return null;
  return (
    <div role="status" className={cn("space-y-1 text-xs text-muted-foreground", props.className)}>
      {diagnostics.map(({ hostId, label, detail }) => (
        <p key={hostId} className="whitespace-pre-line break-words">
          {label}: {detail}
        </p>
      ))}
    </div>
  );
}

export function platformSetupStatus(state: DeviceServiceState, platform: DevicePlatform) {
  const hasDevices = state.devices.some((device) => device.platform === platform);
  if (platform === "android" && !hasDevices && isAndroidDiscoveryUncertain(state)) {
    return {
      ready: false,
      message: i18n.t("v2.surfaces.theAndroidDeviceListMayBeIncomplete"),
    };
  }
  const availabilities = state.hosts.flatMap((host) =>
    host.platforms
      .filter((candidate) => candidate.platform === platform)
      .map((candidate) => ({ ...candidate, host })),
  );
  const supportingHosts = availabilities
    .filter((candidate) => candidate.available)
    .map((candidate) => candidate.host);
  if (supportingHosts.length === 0) {
    return {
      ready: false,
      message:
        availabilities[0]?.reason ??
        i18n.t("v2.surfaces.platformSupportWasNotDetected", { platform: platformName(platform) }),
    };
  }
  const readyHosts = supportingHosts.filter(
    (host) =>
      state.hostStatuses[host.id]?.status === "ready" ||
      (host.kind === "local" && state.hostStatus === "ready"),
  );
  if (readyHosts.length > 0 && !hasDevices) {
    return {
      ready: false,
      message:
        platform === "ios"
          ? i18n.t(
              "device.xcodeIsInstalledButNoIosSimulatorIsAvailableInstallARuntimeInXcodeSettingsComponents",
            )
          : i18n.t(
              "device.theAndroidSdkIsInstalledButNoVirtualDeviceExistsCreateOneInAndroidStudioDeviceManager",
            ),
    };
  }
  const remoteHost = supportingHosts.every((host) => host.kind !== "local")
    ? supportingHosts[0]
    : undefined;
  const location = remoteHost ? i18n.t("v2.surfaces.onHost", { host: remoteHost.label }) : "";
  return {
    ready: true,
    message:
      remoteHost?.kind === "eas"
        ? i18n.t("v2.surfaces.hostStartsIosSimulatorsInTheCloud", {
            label: remoteHost.label,
          })
        : platform === "ios"
          ? i18n.t("v2.surfaces.xcodeAndIOSSimulatorAreAvailableLocation", { location })
          : i18n.t("v2.surfaces.theAndroidSDKAndEmulatorAreAvailable", { location }),
  };
}

export function DeviceSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly state: DeviceServiceState;
  readonly onComplete?: () => void;
}) {
  const { t } = useI18n();
  const canConfigure = useEnvironmentScope(props.environmentId, AuthSettingsWriteScope);
  const configure = useAtomCommand(deviceEnvironment.configure);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<"hub" | "check" | "agent" | "complete" | null>(null);
  const [step, setStep] = useState(0);
  const enabled = props.state.hostStatus !== "disabled";
  const { ready, busy } = deviceHubReadiness(props.state);
  const localPlatformsUnavailable = props.state.hosts.some(
    (host) => host.kind === "local" && !host.platforms.some((platform) => platform.available),
  );

  // Remote hosts report platforms only after a probe, like the Device panel's refresh on open.
  useEffect(() => {
    if (enabled) void list({ environmentId: props.environmentId, input: {} });
  }, [enabled, list, props.environmentId]);

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean; onboardingCompleted?: boolean },
  ) => {
    if (!readEnvironmentScope(props.environmentId, AuthSettingsWriteScope)) return;
    setPending(kind);
    const result = await configure({ environmentId: props.environmentId, input });
    setPending(null);
    if (kind === "complete" && result._tag === "Success") props.onComplete?.();
  };

  return (
    <>
      <WizardHeader
        title={t("device.setUpDevices")}
        description={t("device.reviewWhatRunsOnThisEnvironmentBeforeUsingSimulatorsAndEmulators")}
      >
        <WizardSteps
          steps={[t("device.deviceHub"), t("device.simulators"), t("device.agentAccess")]}
          currentStep={step}
          onStepChange={setStep}
          isStepDisabled={(requested) => busy || pending !== null || requested > step}
        />
      </WizardHeader>

      <WizardPanel>
        <DeviceHostUpdates state={props.state} environmentId={props.environmentId} />
        {step === 0 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">{t("device.enableTheDeviceHub")}</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{deviceHubDescription()}</p>
              <Switch
                checked={enabled}
                disabled={!canConfigure || busy || pending !== null}
                aria-label={t("device.enableDeviceHub")}
                onCheckedChange={(checked) =>
                  void update("hub", {
                    enabled: Boolean(checked),
                    ...(checked ? {} : { agentAccessEnabled: false }),
                  })
                }
              />
            </div>
            <DeviceHubSetupStatus
              state={props.state}
              pending={pending === "hub" || (busy && pending !== "agent")}
            />
          </section>
        ) : null}

        {step === 1 || (step === 0 && enabled && localPlatformsUnavailable) ? (
          <section className={cn("space-y-3 text-sm", step === 0 && "mt-4")}>
            <h3 className="font-medium">{t("device.checkSimulatorSupport")}</h3>
            <DevicePlatformSetup
              state={props.state}
              checking={pending === "check"}
              disabled={!enabled || busy || pending !== null}
              onCheck={() => {
                setPending("check");
                void list({ environmentId: props.environmentId, input: {} }).finally(() =>
                  setPending(null),
                );
              }}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">{t("device.allowAgentControl")}</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{agentDeviceDescription()}</p>
              <Switch
                checked={props.state.agentAccessEnabled}
                disabled={!canConfigure || !enabled || busy || pending !== null}
                aria-label={t("device.allowAgentsToControlDevices")}
                onCheckedChange={(checked) =>
                  void update("agent", { agentAccessEnabled: Boolean(checked) })
                }
              />
            </div>
            <AgentDeviceSetupStatus state={props.state} pending={pending === "agent"} />
            <p className="text-xs text-muted-foreground">
              {t("device.leaveThisOffToKeepManualDeviceControlsWithoutGivingAgentsAccess")}
            </p>
          </section>
        ) : null}
        {props.state.hostStatus === "failed" && props.state.hostStatusDetail ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {props.state.hostStatusDetail}
          </p>
        ) : null}
      </WizardPanel>

      <WizardFooter>
        {step === 0 ? (
          <DialogClose render={<Button variant="outline" />}>{t("action.cancel")}</DialogClose>
        ) : (
          <Button
            variant="outline"
            disabled={busy || pending !== null}
            onClick={() => setStep(step - 1)}
          >
            {t("action.back")}
          </Button>
        )}
        {step < 2 ? (
          <Button disabled={!ready || pending !== null} onClick={() => setStep(step + 1)}>
            {t("action.continue")}
          </Button>
        ) : (
          <Button
            disabled={!canConfigure || !ready || pending !== null}
            onClick={() => void update("complete", { onboardingCompleted: true })}
          >
            {pending === "complete" ? t("common.saving") : t("action.done")}
          </Button>
        )}
      </WizardFooter>
    </>
  );
}

export function DeviceHubSetupStatus({
  state,
  pending,
  compact = false,
}: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  const { t } = useI18n();
  if (!pending && !deviceHubReadiness(state).ready) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      {pending ? <Spinner size="xs" /> : <Check className="size-3 text-success" />}
      {pending
        ? state.hostStatus === "installing"
          ? compact
            ? t("device.installing")
            : t("device.installingDeviceHub")
          : state.hostStatus === "starting"
            ? compact
              ? t("device.startingText")
              : t("device.startingDeviceHub")
            : compact
              ? t("device.updating")
              : t("device.updatingDeviceHub")
        : t("device.deviceHubIsReady")}
    </p>
  );
}

function DevicePlatformSetup(props: {
  readonly state: DeviceServiceState;
  readonly checking: boolean;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <PlatformStatus platform="iOS" status={platformSetupStatus(props.state, "ios")} />
      <PlatformStatus platform="Android" status={platformSetupStatus(props.state, "android")} />
      <DeviceHostDiagnostics hosts={props.state.hosts} hostStatuses={props.state.hostStatuses} />
      <p className="text-xs text-muted-foreground">
        {t("device.youCanUseEitherPlatformFixingAMissingPlatformDoesNotBlockTheOtherOne")}
      </p>
      <Button size="compact" variant="outline" disabled={props.disabled} onClick={props.onCheck}>
        {props.checking ? <Spinner size="xs" /> : null}
        {props.checking ? t("device.checking") : t("prList.checkAgain")}
      </Button>
    </div>
  );
}

export function AgentDeviceSetupStatus(props: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  const { t } = useI18n();
  if (props.pending) {
    const label =
      props.state.hostStatus === "installing"
        ? props.compact
          ? t("device.installing")
          : t("device.installingAgentTools")
        : props.state.hostStatus === "starting"
          ? props.compact
            ? t("device.startingText")
            : t("device.startingAgentTools")
          : props.compact
            ? t("device.updating")
            : t("device.updatingAgentAccess");
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size="xs" />
        {label}
      </p>
    );
  }
  if (
    props.state.agentAccessEnabled &&
    deviceHubReadiness(props.state).ready &&
    props.state.hosts.some((host) => host.agentDeviceInstalled)
  ) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3 text-success" />
        {t("device.agentToolsAreReady")}
      </p>
    );
  }
  return null;
}

export function PlatformStatus(props: {
  readonly platform: string;
  readonly status: { readonly ready: boolean; readonly message: string };
  readonly compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn("flex gap-2", !props.compact && "rounded-md border border-border/60 px-3 py-2")}
    >
      <MorphIcon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          props.status.ready ? "text-success" : "text-muted-foreground",
        )}
        icon={props.status.ready ? CheckGlyph : CircleAlert}
      />
      <div className={cn(props.compact && props.status.ready && "flex items-center gap-2")}>
        <p className="font-medium">{props.platform}</p>
        <p className="text-xs text-muted-foreground">
          {props.compact && props.status.ready ? t("device.ready") : props.status.message}
        </p>
      </div>
    </div>
  );
}
