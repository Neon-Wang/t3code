import { i18n, type I18n, type MessageKey } from "@t3tools/shared/i18n";
import { useI18n } from "~/hooks/useI18n";
import type { EnvironmentId, ServerSelfUpdateCapability } from "@t3tools/contracts";
import type { ServerUpdateStage, ServerUpdateState } from "@t3tools/client-runtime/state/server";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { CircleArrowUpIcon } from "lucide-react";
import { type ComponentProps, useRef, useState } from "react";

import { requestConfirmDialog } from "~/confirmDialog";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { manualServerUpdateCommand } from "~/versionSkew";
import { Button } from "./ui/button";
import { toastManager } from "./ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

// The wire "installing" stage is a sub-second launcher handoff, so the UI
// folds it into the download phase; everything after the handoff is the
// restart the user is actually waiting through.
const UPDATE_STAGE_LABELS: Record<ServerUpdateStage, MessageKey> = {
  downloading: "settings.label.downloading",
  installing: "settings.label.downloading",
  resuming: "ui.serverUpdate.restarting",
};
const pendingUpdateEnvironmentIds = new Set<EnvironmentId>();

export function serverUpdateStageLabel(stage: ServerUpdateStage, t: I18n["t"] = i18n.t): string {
  return t(UPDATE_STAGE_LABELS[stage]);
}

function updateFailureMessage(error: unknown, t: I18n["t"] = i18n.t): string {
  return error instanceof Error
    ? error.message
    : t("ui.serverUpdateAction.serverUpdateFailedSentence");
}

export interface ServerUpdateTarget {
  readonly environmentId: EnvironmentId;
  readonly serverLabel: string;
  readonly selfUpdate: ServerSelfUpdateCapability | null;
  readonly desktopAppUpdate?: boolean;
  readonly threadContinuation?: boolean;
  readonly targetVersion: string;
  readonly continueThreadsAfterServerUpdate?: boolean;
}

type UpdateButtonProps = Pick<ComponentProps<typeof Button>, "variant" | "size" | "className"> & {
  readonly label?: string;
  /** "icon" renders a compact icon button with the label in a tooltip. */
  readonly appearance?: "button" | "icon";
};

function useServerUpdate() {
  const { t } = useI18n();
  const updateServer = useAtomCommand(serverEnvironment.updateServer, { reportFailure: false });
  return async (
    target: ServerUpdateTarget,
    failureTitle = t("ui.serverUpdateAction.serverUpdateFailed"),
  ) => {
    const { environmentId, serverLabel, selfUpdate, targetVersion } = target;
    if (pendingUpdateEnvironmentIds.has(environmentId)) return;
    pendingUpdateEnvironmentIds.add(environmentId);
    try {
      const result = await updateServer({
        environmentId,
        input: {
          targetVersion,
          ...(target.threadContinuation && target.continueThreadsAfterServerUpdate
            ? { continueRunningThreads: true }
            : {}),
        },
      });
      if (result._tag === "Failure") {
        if (isAtomCommandInterrupted(result)) return;
        throw squashAtomCommandFailure(result);
      }
      toastManager.add({
        type: "success",
        title: t("ui.serverUpdateAction.serverUpdated", { server: serverLabel }),
        description:
          selfUpdate === "desktop-managed"
            ? t("ui.serverUpdateAction.desktopAppRelaunchedOnVersion", {
                version: result.value.targetVersion,
              })
            : t("ui.serverUpdateAction.reconnectedOnT3Version", {
                version: result.value.targetVersion,
              }),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: failureTitle,
        description: updateFailureMessage(error, t),
      });
    } finally {
      pendingUpdateEnvironmentIds.delete(environmentId);
    }
  };
}

/** Updates eligible machines independently; manual paths remain in the machine list. */
export function ServerUpdatesAction({
  targets,
  label: suppliedLabel,
  variant = "outline",
  size = "xs",
  className,
}: UpdateButtonProps & {
  readonly targets: ReadonlyArray<ServerUpdateTarget>;
}) {
  const { t } = useI18n();
  const label = suppliedLabel ?? t("chat.ui.updateAll");
  const update = useServerUpdate();
  const pending = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const eligible = targets.filter(
    (target) =>
      target.selfUpdate !== null &&
      (target.selfUpdate !== "desktop-managed" || target.desktopAppUpdate),
  );
  const handleUpdate = async () => {
    if (pending.current) return;
    pending.current = true;
    setIsPending(true);
    try {
      const available = eligible.filter(
        (target) => !pendingUpdateEnvironmentIds.has(target.environmentId),
      );
      const desktopTargets = available.filter((target) => target.selfUpdate === "desktop-managed");
      if (desktopTargets.length > 0) {
        const confirmed =
          (await requestConfirmDialog(
            t("ui.serverUpdateAction.updateTheT3CodeDesktopAppsOnServers", {
              servers: desktopTargets.map((target) => target.serverLabel).join(", "),
            }),
          )) ?? true;
        if (!confirmed) return;
      }
      await Promise.all(
        available.map((target) =>
          update(
            target,
            t("ui.serverUpdateAction.serverUpdateFailed129", { server: target.serverLabel }),
          ),
        ),
      );
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  };
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={isPending || eligible.length === 0}
      onClick={() => void handleUpdate()}
    >
      {label}
    </Button>
  );
}

/**
 * One-row status for an in-flight server update: "ui.serverUpdate.downloading" then
 * "ui.serverUpdate.restarting". The update is a wait, not a warning: a single pulsing dot
 * and label, no step rail, no versions. Failure turns the row red with the
 * rollback reason.
 */
export function ServerUpdateProgress({
  state,
}: {
  readonly state: Exclude<ServerUpdateState, { status: "idle" }>;
}) {
  const { t } = useI18n();
  if (state.status === "failed") {
    return (
      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-destructive" role="alert">
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger render={<span className="min-w-0 truncate">{state.message}</span>} />
          <TooltipPopup side="top">{state.message}</TooltipPopup>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-foreground">
      <span
        className="size-1.5 shrink-0 animate-status-pulse rounded-full bg-foreground"
        aria-hidden="true"
      />
      <span>{serverUpdateStageLabel(state.stage, t)}</span>
    </div>
  );
}

/**
 * Offers the update path advertised by a version-skewed server. Self-updates
 * delegate their full lifecycle to client-runtime so this component can
 * unmount during reconnect without losing operation state.
 */
export function ServerUpdateAction({
  environmentId,
  serverLabel,
  selfUpdate,
  desktopAppUpdate = false,
  threadContinuation = false,
  targetVersion,
  label: suppliedLabel,
  variant = "outline",
  size = "xs",
  className,
  appearance = "button",
}: Omit<ServerUpdateTarget, "continueThreadsAfterServerUpdate"> & UpdateButtonProps) {
  const { t } = useI18n();
  const label = suppliedLabel ?? t("chat.view.update");
  const isDesktopAppUpdate = selfUpdate === "desktop-managed";
  const continueThreadsAfterServerUpdate = useEnvironmentSettings(
    environmentId,
    (settings) => settings.continueThreadsAfterServerUpdate,
  );
  const update = useServerUpdate();
  const { copyToClipboard } = useCopyToClipboard<{ command: string }>({
    target: t("ui.serverUpdateAction.updateCommand"),
    onCopy: ({ command }) => {
      toastManager.add({
        type: "success",
        title: t("ui.serverUpdateAction.updateCommandCopied"),
        description: t("ui.serverUpdateAction.runCommandOnServerToUpdateIt", {
          command: command,
          server: serverLabel,
        }),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("ui.serverUpdateAction.couldNotCopyUpdateCommand"),
        description: error.message,
      });
    },
  });

  const handleUpdate = async () => {
    if (pendingUpdateEnvironmentIds.has(environmentId)) {
      return;
    }
    if (isDesktopAppUpdate) {
      // No themed host mounted (undefined) means proceed: the click itself
      // was the request. This is the only confirmation in the flow; the
      // remote machine installs without asking anyone there.
      const confirmed =
        (await requestConfirmDialog(
          t("ui.serverUpdateAction.updateTheT3CodeDesktopAppThatRuns", { server: serverLabel }),
        )) ?? true;
      if (!confirmed) {
        return;
      }
    }
    await update({
      environmentId,
      serverLabel,
      selfUpdate,
      desktopAppUpdate,
      threadContinuation,
      targetVersion,
      continueThreadsAfterServerUpdate,
    });
  };

  if (selfUpdate === "desktop-managed" && !desktopAppUpdate) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("ui.serverUpdateAction.updateTheDesktopAppOnThatMachineTo")}
      </span>
    );
  }

  const manualCommand = selfUpdate === null ? manualServerUpdateCommand(targetVersion) : null;
  const actionLabel = manualCommand !== null ? t("settings.providers.copyUpdateCommand") : label;
  const onClick =
    manualCommand !== null
      ? () => copyToClipboard(manualCommand, { command: manualCommand })
      : () => void handleUpdate();

  if (appearance === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost-muted"
              className={className}
              aria-label={t("ui.serverUpdateAction.actionForServer", {
                action: actionLabel,
                server: serverLabel,
              })}
              onClick={onClick}
            />
          }
        >
          <CircleArrowUpIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">{actionLabel}</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Button size={size} variant={variant} className={className} onClick={onClick}>
      {actionLabel}
    </Button>
  );
}
