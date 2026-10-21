import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import { SessionPermissions } from "./SessionPermissions";
import {
  ChevronRightIcon,
  ChevronsLeftRightEllipsisIcon,
  EllipsisIcon,
  PlusIcon,
  TerminalIcon,
} from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthEnvironmentMaintainScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  type AuthClientSession,
  type AuthPairingLink,
  type AuthPairingCredentialResult,
  type AdvertisedEndpoint,
  type DesktopDiscoveredSshHost,
  type DesktopSshEnvironmentTarget,
  type DesktopServerExposureState,
  type DesktopWslState,
  type EnvironmentId,
  resolveEnvironmentMachineKind,
} from "@t3tools/contracts";
import {
  RelayConnectionRegistration,
  RelayConnectionTarget,
} from "@t3tools/client-runtime/connection";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";

import { cn } from "../../lib/utils";
import { isLocalEnvironmentDisabled } from "../../localEnvironment";
import {
  applyWslEnableSelection,
  isWslSettingsRowVisible,
  missingTailscaleEndpointDescription,
  resolveLocalVersionStatusLabel,
} from "./ConnectionsSettings.logic";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { LocalEnvironmentSetting } from "./LocalEnvironmentSetting";
import { searchableSetting } from "./settingsSearch";
import { EnvironmentIconMenu } from "./EnvironmentIconPicker";
import { formatDesktopSshTarget } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { LoadBalancingSettings } from "./LoadBalancingSettings";
import { GitHubRoutingSettings } from "./GitHubRoutingSettings";
import { Input } from "../ui/input";
import { CommandShortcut } from "../ui/command";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "../ui/autocomplete";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Spinner } from "../ui/spinner";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { AnimatedHeight } from "../AnimatedHeight";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  revokeOtherServerClientSessions,
  revokeServerClientSession,
  revokeServerPairingLink,
  usePrimarySessionState,
  type ServerClientSessionRecord,
} from "~/environments/primary";
import { isDesktopLocalConnectionTarget } from "~/connection/desktopLocal";
import { useUiStateStore } from "~/uiStateStore";
import {
  resolveServerConfigVersionMismatch,
  resolveServerSelfUpdateCapability,
  supportsDesktopAppUpdate,
  supportsServerUpdateThreadContinuation,
} from "~/versionSkew";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { RemoveT3ConnectEnvironmentDialog } from "../clerk/RemoveT3ConnectEnvironmentDialog";
import { authEnvironment } from "~/state/auth";
import { environmentCatalog } from "~/connection/catalog";
import {
  connectPairing as connectPairingAtom,
  connectSshEnvironment as connectSshEnvironmentAtom,
} from "~/connection/onboarding";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import {
  desktopNetworkAccessStateAtom,
  refreshDesktopNetworkAccessState,
} from "~/state/desktopNetworkAccess";
import { desktopSshHostsStateAtom, filterDiscoveredSshHosts } from "~/state/desktopSshHosts";
import { desktopWslStateAtom, refreshDesktopWslState } from "~/state/desktopWslState";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import {
  type EnvironmentPresentation,
  useEnvironments,
  usePrimaryEnvironment,
  useRelayEnvironmentDiscovery,
} from "~/state/environments";
import { requestConfirmDialog } from "~/confirmDialog";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentIdsKey } from "~/state/environmentAtomList";
import {
  environmentUpdateStatesAtom,
  primaryServerKeybindingsAtom,
  serverEnvironment,
} from "~/state/server";
import {
  ServerUpdateAction,
  ServerUpdateProgress,
  ServerUpdatesAction,
  type ServerUpdateTarget,
} from "../ServerUpdateAction";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
} from "../../keybindings";
import {
  parseManualDesktopSshTarget,
  parsePairingUrlFields,
  parseRemotePairingFields,
  formatDesktopSshConnectionError,
  sortDesktopPairingLinks,
  summarizeAuthorizedClients,
  sortDesktopClientSessions,
  toDesktopPairingLinkRecord,
  toDesktopClientSessionRecord,
  selectPairingEndpoint,
  isTailscaleHttpsEndpoint,
  endpointDefaultPreferenceKey,
} from "./ConnectionsSettings.logic";
import {
  type AccessSectionPresentation,
  accessRowClassName,
  AdvertisedEndpointListRow,
  AuthorizedClientsHeaderAction,
  NetworkAccessDescription,
  PairingClientsList,
} from "./AuthorizedClientsSettings";
import {
  CloudLinkRow,
  CloudRemoteEnvironmentRows,
  SavedBackendListRow,
} from "./SavedEnvironmentRows";

const DEFAULT_TAILSCALE_SERVE_PORT = 443;
const EMPTY_ADVERTISED_ENDPOINTS: ReadonlyArray<AdvertisedEndpoint> = [];
const EMPTY_DISCOVERED_SSH_HOSTS: ReadonlyArray<DesktopDiscoveredSshHost> = [];

// Sentinels for the consolidated WSL backend picker. The colon is
// rejected by DISTRO_NAME_PATTERN (validated on the desktop side) so
// neither can collide with a real distro name.
const BACKEND_VALUE_DEFAULT_WSL = "backend:default-wsl";
const BACKEND_VALUE_WSL_OFF = "backend:wsl-off";

// Subscribes on its own so desktop download progress does not re-render the page.
function LocalVersionStatusLabel() {
  const updateState = useDesktopUpdateState();
  return (
    <span className="text-xs text-muted-foreground">
      {resolveLocalVersionStatusLabel(updateState)}
    </span>
  );
}

export function ConnectionsSettings() {
  const { t } = useI18n();
  const desktopBridge = window.desktopBridge;
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const connectPairing = useAtomCommand(connectPairingAtom, { reportFailure: false });
  const connectSshEnvironment = useAtomCommand(connectSshEnvironmentAtom, {
    reportFailure: false,
  });
  const removeEnvironment = useAtomCommand(environmentCatalog.remove, { reportFailure: false });
  const registerEnvironment = useAtomCommand(environmentCatalog.register, {
    reportFailure: false,
  });
  const relayDiscoveryState = useRelayEnvironmentDiscovery();
  const setEnvironmentEnabled = useAtomCommand(environmentCatalog.setEnabled, {
    reportFailure: false,
  });
  const primaryEnvironmentId = primaryEnvironment?.environmentId ?? null;
  const primarySessionState = usePrimarySessionState();
  const currentSessionScopes = primarySessionState.data?.authenticated
    ? (primarySessionState.data.permissions ?? primarySessionState.data.scopes ?? null)
    : null;
  const currentAuthPolicy = desktopBridge ? null : (primarySessionState.data?.auth.policy ?? null);
  const savedEnvironments = environments.filter(
    (environment) => environment.entry.target._tag !== "PrimaryConnectionTarget",
  );
  const listedEnvironments = savedEnvironments.filter(
    (environment) => !isDesktopLocalConnectionTarget(environment.entry.target),
  );
  const savedUpdateStates = useAtomValue(
    environmentUpdateStatesAtom(
      environmentIdsKey(savedEnvironments.map(({ environmentId }) => environmentId)),
    ),
  );
  const savedServerUpdateStates = savedEnvironments.map((environment, index) => ({
    environment,
    updateStatus: savedUpdateStates[index]!.status,
  }));
  const savedServerUpdateTargets = savedServerUpdateStates.flatMap(
    ({ environment, updateStatus }): ServerUpdateTarget[] => {
      const mismatch = resolveServerConfigVersionMismatch(environment.serverConfig);
      const selfUpdate = resolveServerSelfUpdateCapability(environment.serverConfig);
      const desktopAppUpdate = supportsDesktopAppUpdate(environment.serverConfig);
      if (
        !mismatch ||
        updateStatus === "running" ||
        !environment.entry.enabled ||
        environment.connection.phase !== "connected" ||
        isDesktopLocalConnectionTarget(environment.entry.target) ||
        selfUpdate === null ||
        (selfUpdate === "desktop-managed" && !desktopAppUpdate)
      ) {
        return [];
      }
      return [
        {
          environmentId: environment.environmentId,
          serverLabel: environment.label,
          selfUpdate,
          installation: environment.serverConfig?.environment.capabilities.serverInstallation,
          desktopAppUpdate,
          threadContinuation: supportsServerUpdateThreadContinuation(environment.serverConfig),
          continueThreadsAfterServerUpdate:
            environment.serverConfig?.settings.continueThreadsAfterServerUpdate ?? false,
          targetVersion: mismatch.clientVersion,
        },
      ];
    },
  );
  const loadBalancingEnvironments = [
    ...(primaryEnvironment ? [primaryEnvironment] : []),
    ...savedEnvironments.filter((environment) => environment.entry.enabled),
  ].filter((environment) => environment.connection.phase !== "unsupported");
  const savedDesktopSshEnvironmentKeys = (() => {
    const keys = new Set<string>();
    for (const environment of savedEnvironments) {
      const profile = environment.entry.profile;
      if (
        environment.entry.target._tag !== "SshConnectionTarget" ||
        Option.isNone(profile) ||
        profile.value._tag !== "SshConnectionProfile"
      ) {
        continue;
      }
      const target = profile.value.target;
      keys.add(target.alias);
      keys.add(formatDesktopSshTarget(target));
    }
    return keys;
  })();
  const [desktopServerExposureMutationError, setDesktopServerExposureMutationError] = useState<
    string | null
  >(null);
  const [desktopAccessManagementMutationError, setDesktopAccessManagementMutationError] = useState<
    string | null
  >(null);
  const [createdPairingCredentials, setCreatedPairingCredentials] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const handlePairingLinkCreated = (created: AuthPairingCredentialResult) => {
    setCreatedPairingCredentials((current) => new Map(current).set(created.id, created.credential));
  };
  const [revokingDesktopPairingLinkId, setRevokingDesktopPairingLinkId] = useState<string | null>(
    null,
  );
  const [revokingDesktopClientSessionId, setRevokingDesktopClientSessionId] = useState<
    string | null
  >(null);
  const [isRevokingOtherDesktopClients, setIsRevokingOtherDesktopClients] = useState(false);
  const [addBackendDialogOpen, setAddBackendDialogOpen] = useState(false);
  const [routeTarget, setRouteTarget] = useState<EnvironmentPresentation | null>(null);
  const [savedBackendMode, setSavedBackendMode] = useState<"remote" | "ssh">("remote");
  const [savedBackendHost, setSavedBackendHost] = useState("");
  const [savedBackendPairingCode, setSavedBackendPairingCode] = useState("");
  const [savedBackendSshHost, setSavedBackendSshHost] = useState("");
  const [savedBackendSshUsername, setSavedBackendSshUsername] = useState("");
  const [savedBackendSshPort, setSavedBackendSshPort] = useState("");
  const [sshHostSuggestionsOpen, setSshHostSuggestionsOpen] = useState(false);
  const highlightedSshHostRef = useRef<DesktopDiscoveredSshHost | undefined>(undefined);
  const [savedBackendError, setSavedBackendError] = useState<string | null>(null);
  const [isAddingSavedBackend, setIsAddingSavedBackend] = useState(false);
  const [removingSavedEnvironmentId, setRemovingSavedEnvironmentId] =
    useState<EnvironmentId | null>(null);
  const [isUpdatingDesktopServerExposure, setIsUpdatingDesktopServerExposure] = useState(false);
  const [isUpdatingTailscaleServe, setIsUpdatingTailscaleServe] = useState(false);
  const [isUpdatingWslBackend, setIsUpdatingWslBackend] = useState(false);
  const [desktopWslMutationError, setDesktopWslMutationError] = useState<string | null>(null);
  type PendingWslChange =
    | { readonly kind: "disable"; readonly wasWslOnly: boolean }
    | { readonly kind: "distro"; readonly nextDistro: string | null }
    | { readonly kind: "enable"; readonly nextDistro: string | null }
    | { readonly kind: "wsl-only"; readonly nextValue: boolean };
  const [pendingWslChange, setPendingWslChange] = useState<PendingWslChange | null>(null);
  const isWslConfirmDialogOpen = pendingWslChange !== null;
  const [pendingTailscaleServeEndpoint, setPendingTailscaleServeEndpoint] =
    useState<AdvertisedEndpoint | null>(null);
  const [disableTailscaleServeDialogOpen, setDisableTailscaleServeDialogOpen] = useState(false);
  const [tailscaleServePortInput, setTailscaleServePortInput] = useState(
    String(DEFAULT_TAILSCALE_SERVE_PORT),
  );
  const [pendingDesktopServerExposureMode, setPendingDesktopServerExposureMode] = useState<
    DesktopServerExposureState["mode"] | null
  >(null);
  const primaryServerConfig = primaryEnvironment?.serverConfig ?? null;
  const primaryVersionMismatch = resolveServerConfigVersionMismatch(primaryServerConfig);
  const primaryServerUpdateState = useAtomValue(
    serverEnvironment.updateStateAtom(primaryEnvironmentId),
  );
  const [isAdvertisedEndpointListExpanded, setIsAdvertisedEndpointListExpanded] = useState(false);
  const defaultAdvertisedEndpointKey = useUiStateStore(
    (state) => state.defaultAdvertisedEndpointKey,
  );
  const setDefaultAdvertisedEndpointKey = useUiStateStore(
    (state) => state.setDefaultAdvertisedEndpointKey,
  );
  const canReadAccess = useEnvironmentScope(primaryEnvironmentId, AuthAccessReadScope);
  const canWriteAccess = useEnvironmentScope(primaryEnvironmentId, AuthAccessWriteScope);
  const canReadRelay = useEnvironmentScope(primaryEnvironmentId, AuthRelayReadScope);
  const canMaintain = useEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope);
  const canManageRelay = useEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope);
  const canManageLocalBackend = !isLocalEnvironmentDisabled() && canMaintain;
  const authAccessChanges = useEnvironmentQuery(
    canReadAccess && primaryEnvironmentId !== null
      ? authEnvironment.accessChanges({
          environmentId: primaryEnvironmentId,
          input: null,
        })
      : null,
  );
  const desktopNetworkAccess = useEnvironmentQuery(
    canManageLocalBackend && desktopBridge ? desktopNetworkAccessStateAtom : null,
  );
  const isSshDiscoveryActive =
    desktopBridge !== undefined && addBackendDialogOpen && savedBackendMode === "ssh";
  const desktopSshHosts = useEnvironmentQuery(
    isSshDiscoveryActive ? desktopSshHostsStateAtom : null,
  );
  // The discovery atom is kept alive across dialog opens, so re-read SSH config
  // each time the SSH tab is shown; stale hosts stay visible while it refreshes.
  const refreshDesktopSshHosts = desktopSshHosts.refresh;
  useEffect(() => {
    if (isSshDiscoveryActive) refreshDesktopSshHosts();
  }, [isSshDiscoveryActive, refreshDesktopSshHosts]);
  const desktopWsl = useEnvironmentQuery(
    canManageLocalBackend && desktopBridge ? desktopWslStateAtom : null,
  );
  const desktopWslState = desktopWsl.data;
  const desktopWslError = desktopWslMutationError ?? desktopWsl.error;
  const isLoadingWslState = desktopWsl.isPending && desktopWsl.data === null;
  const discoveredSshHosts = desktopSshHosts.data ?? EMPTY_DISCOVERED_SSH_HOSTS;
  const unsavedDiscoveredSshHosts = discoveredSshHosts.filter((target) => {
    const address = formatDesktopSshTarget(target);
    return (
      !savedDesktopSshEnvironmentKeys.has(target.alias) &&
      (target.source === "ssh-config" || !savedDesktopSshEnvironmentKeys.has(address))
    );
  });
  const filteredDiscoveredSshHosts = filterDiscoveredSshHosts(
    unsavedDiscoveredSshHosts,
    savedBackendSshHost,
  );
  const isLoadingDiscoveredSshHosts = desktopSshHosts.isPending && desktopSshHosts.data === null;
  const discoveredSshHostsError = desktopSshHosts.error;
  const hasSshHostSuggestionContent =
    desktopBridge !== undefined &&
    (isLoadingDiscoveredSshHosts || unsavedDiscoveredSshHosts.length > 0);
  const desktopServerExposureState = desktopNetworkAccess.data?.serverExposureState ?? null;
  const desktopAdvertisedEndpoints =
    desktopNetworkAccess.data?.advertisedEndpoints ?? EMPTY_ADVERTISED_ENDPOINTS;
  const desktopServerExposureError =
    desktopServerExposureMutationError ?? desktopNetworkAccess.error;
  const desktopAccessManagementError =
    desktopAccessManagementMutationError ?? authAccessChanges.error;
  const isLoadingDesktopAccessManagement =
    authAccessChanges.isPending && authAccessChanges.data === null;
  const desktopPairingLinks = (() => {
    const event = authAccessChanges.data;
    if (event?.type !== "snapshot") return [];
    return sortDesktopPairingLinks(
      event.payload.pairingLinks.map((pairingLink: AuthPairingLink) =>
        toDesktopPairingLinkRecord(pairingLink),
      ),
    );
  })();
  const desktopClientSessions = (() => {
    const event = authAccessChanges.data;
    if (event?.type !== "snapshot") return [];
    return sortDesktopClientSessions(
      event.payload.clientSessions.map((clientSession: AuthClientSession) =>
        toDesktopClientSessionRecord(clientSession),
      ),
    );
  })();
  const isLocalBackendNetworkAccessible = desktopBridge
    ? desktopServerExposureState?.mode === "network-accessible"
    : currentAuthPolicy === "remote-reachable";
  const trimmedTailscaleServePortInput = tailscaleServePortInput.trim();
  const parsedTailscaleServePort = Number(trimmedTailscaleServePortInput);
  const isTailscaleServePortValid =
    /^\d+$/u.test(trimmedTailscaleServePortInput) &&
    Number.isInteger(parsedTailscaleServePort) &&
    parsedTailscaleServePort >= 1 &&
    parsedTailscaleServePort <= 65_535;

  const pendingTailscaleServeBaseUrl = (() => {
    if (!pendingTailscaleServeEndpoint) return null;
    if (!isTailscaleServePortValid) return pendingTailscaleServeEndpoint.httpBaseUrl;
    if (parsedTailscaleServePort === DEFAULT_TAILSCALE_SERVE_PORT) {
      return pendingTailscaleServeEndpoint.httpBaseUrl;
    }
    try {
      const url = new URL(pendingTailscaleServeEndpoint.httpBaseUrl);
      url.port = String(parsedTailscaleServePort);
      return url.toString().replace(/\/$/u, "");
    } catch {
      return pendingTailscaleServeEndpoint.httpBaseUrl;
    }
  })();

  const handleDesktopServerExposureChange = async (checked: boolean) => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsUpdatingDesktopServerExposure(true);
    setDesktopServerExposureMutationError(null);
    try {
      await desktopBridge.setServerExposureMode(checked ? "network-accessible" : "local-only");
      refreshDesktopNetworkAccessState();
      setPendingDesktopServerExposureMode(null);
      setIsUpdatingDesktopServerExposure(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings.connections.failedToUpdateNetworkExposure");
      setPendingDesktopServerExposureMode(null);
      setDesktopServerExposureMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotUpdateNetworkAccess"),
          description: message,
        }),
      );
      setIsUpdatingDesktopServerExposure(false);
    }
  };

  const handleConfirmDesktopServerExposureChange = () => {
    if (pendingDesktopServerExposureMode === null) return;
    const checked = pendingDesktopServerExposureMode === "network-accessible";
    void handleDesktopServerExposureChange(checked);
  };

  const handleConfirmTailscaleServeSetup = async () => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    if (!isTailscaleServePortValid) return;
    setIsUpdatingTailscaleServe(true);
    setDesktopServerExposureMutationError(null);
    const settled = await settlePromise(async () => {
      await desktopBridge.setTailscaleServeEnabled({
        enabled: true,
        port: parsedTailscaleServePort,
      });
      refreshDesktopNetworkAccessState();
      setPendingTailscaleServeEndpoint(null);
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error
          ? error.message
          : t("settings.connections.failedToConfigureTailscaleHttps");
      setDesktopServerExposureMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotSetUpTailscaleHttps"),
          description: message,
        }),
      );
    }
    setIsUpdatingTailscaleServe(false);
  };

  const handleStartTailscaleServeSetup = (endpoint: AdvertisedEndpoint) => {
    setTailscaleServePortInput(
      String(desktopServerExposureState?.tailscaleServePort ?? DEFAULT_TAILSCALE_SERVE_PORT),
    );
    setPendingTailscaleServeEndpoint(endpoint);
  };

  const handleConfirmTailscaleServeDisable = async () => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsUpdatingTailscaleServe(true);
    setDesktopServerExposureMutationError(null);
    const settled = await settlePromise(async () => {
      await desktopBridge.setTailscaleServeEnabled({
        enabled: false,
        port: desktopServerExposureState?.tailscaleServePort ?? DEFAULT_TAILSCALE_SERVE_PORT,
      });
      refreshDesktopNetworkAccessState();
      setDisableTailscaleServeDialogOpen(false);
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error
          ? error.message
          : t("settings.connections.failedToDisableTailscaleHttps");
      setDesktopServerExposureMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotDisableTailscaleHttps"),
          description: message,
        }),
      );
    }
    setIsUpdatingTailscaleServe(false);
  };

  const handleStartTailscaleServeDisable = (_endpoint: AdvertisedEndpoint) => {
    setDisableTailscaleServeDialogOpen(true);
  };

  const handleRevokeDesktopPairingLink = async (id: string) => {
    if (
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthAccessWriteScope)
    )
      return;
    setRevokingDesktopPairingLinkId(id);
    setDesktopAccessManagementMutationError(null);
    const settled = await settlePromise(async () => {
      await revokeServerPairingLink(id);
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error
          ? error.message
          : t("settings.connections.failedToRevokePairingLink");
      setDesktopAccessManagementMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotRevokePairingLink"),
          description: message,
        }),
      );
    }
    setRevokingDesktopPairingLinkId(null);
  };

  const handleRevokeDesktopClientSession = async (
    sessionId: ServerClientSessionRecord["sessionId"],
  ) => {
    if (
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthAccessWriteScope)
    )
      return;
    setRevokingDesktopClientSessionId(sessionId);
    setDesktopAccessManagementMutationError(null);
    const settled = await settlePromise(async () => {
      await revokeServerClientSession(sessionId);
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error
          ? error.message
          : t("settings.connections.failedToRevokeClientAccess");
      setDesktopAccessManagementMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotRevokeClientAccess"),
          description: message,
        }),
      );
    }
    setRevokingDesktopClientSessionId(null);
  };

  const handleRevokeOtherDesktopClients = async () => {
    if (
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthAccessWriteScope)
    )
      return;
    setIsRevokingOtherDesktopClients(true);
    setDesktopAccessManagementMutationError(null);
    const settled = await settlePromise(async () => {
      const revokedCount = await revokeOtherServerClientSessions();
      toastManager.add({
        type: "success",
        title:
          revokedCount === 1
            ? t("settings.connections.revoked1OtherClient")
            : i18n.t("settings.connections.revokedValueClients", { arg0: revokedCount }),
        description: t(
          "settings.connections.otherPairedClientsWillNeedANewPairingLinkBeforeReconnecting",
        ),
      });
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error
          ? error.message
          : t("settings.connections.failedToRevokeOtherClients");
      setDesktopAccessManagementMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotRevokeOtherClients"),
          description: message,
        }),
      );
    }
    setIsRevokingOtherDesktopClients(false);
  };

  const connectSavedBackendSshTarget = async (target: DesktopSshEnvironmentTarget) => {
    setIsAddingSavedBackend(true);
    setSavedBackendError(null);
    const result = await connectSshEnvironment({
      target,
      label: "",
      ...(routeTarget ? { expectedEnvironmentId: routeTarget.environmentId } : {}),
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        setSavedBackendError(formatDesktopSshConnectionError(squashAtomCommandFailure(result)));
      }
      setIsAddingSavedBackend(false);
      return;
    }

    setSavedBackendHost("");
    setSavedBackendPairingCode("");
    setSavedBackendSshHost("");
    setSavedBackendSshUsername("");
    setSavedBackendSshPort("");
    setAddBackendDialogOpen(false);
    toastManager.add({
      type: "success",
      title: routeTarget
        ? t("v2.settings.routeAdded")
        : t("settings.connections.environmentConnected"),
      description: routeTarget
        ? i18n.t("v2.settings.valueCanNowBeReachedOverSSHValue", {
            arg0: routeTarget.label,
            arg1: target.alias,
          })
        : i18n.t("settings.connections.valueIsReadyOverAnSshManagedTunnel", { arg0: target.alias }),
    });
    setIsAddingSavedBackend(false);
  };

  const handleAddSavedBackend = async () => {
    if (savedBackendMode === "ssh") {
      let target: DesktopSshEnvironmentTarget;
      try {
        target = parseManualDesktopSshTarget({
          host: savedBackendSshHost,
          username: savedBackendSshUsername,
          port: savedBackendSshPort,
        });
      } catch (error) {
        setSavedBackendError(formatDesktopSshConnectionError(error));
        return;
      }

      await connectSavedBackendSshTarget(target);
      return;
    }

    setIsAddingSavedBackend(true);
    setSavedBackendError(null);
    let remotePairingInput: ReturnType<typeof parseRemotePairingFields>;
    try {
      remotePairingInput = parseRemotePairingFields({
        host: savedBackendHost,
        pairingCode: savedBackendPairingCode,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("settings.connections.failedToAddBackend");
      setSavedBackendError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotAddBackend"),
          description: message,
        }),
      );
      setIsAddingSavedBackend(false);
      return;
    }

    const result = await connectPairing({
      ...remotePairingInput,
      ...(routeTarget ? { expectedEnvironmentId: routeTarget.environmentId } : {}),
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        const message =
          error instanceof Error ? error.message : t("settings.connections.failedToAddBackend");
        setSavedBackendError(message);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: t("settings.connections.couldNotAddBackend"),
            description: message,
          }),
        );
      }
      setIsAddingSavedBackend(false);
      return;
    }

    setSavedBackendHost("");
    setSavedBackendPairingCode("");
    setSavedBackendSshHost("");
    setSavedBackendSshUsername("");
    setSavedBackendSshPort("");
    setAddBackendDialogOpen(false);
    toastManager.add(
      routeTarget
        ? {
            type: "success",
            title: t("v2.settings.routeAdded"),
            description: i18n.t("v2.settings.valueNowHasAnotherWayToConnect", {
              arg0: routeTarget.label,
            }),
          }
        : {
            type: "success",
            title: t("settings.connections.backendAdded"),
            description: t(
              "settings.connections.theEnvironmentIsSavedAndWillReconnectOnAppStartup",
            ),
          },
    );
    setIsAddingSavedBackend(false);
  };

  const handleSavedBackendSshFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && savedBackendSshHost.trim().length > 0) {
      event.preventDefault();
      void handleAddSavedBackend();
    }
  };

  const handleSelectSshHostSuggestion = async (target: DesktopDiscoveredSshHost) => {
    if (isAddingSavedBackend || !desktopBridge) return;

    setIsAddingSavedBackend(true);
    setSavedBackendError(null);
    setSavedBackendSshHost(target.alias);
    let resolved: DesktopSshEnvironmentTarget;
    try {
      resolved = await desktopBridge.resolveSshHost(target.alias);
    } catch (error) {
      setSavedBackendError(formatDesktopSshConnectionError(error));
      setIsAddingSavedBackend(false);
      return;
    }
    setSavedBackendSshUsername(resolved.username ?? "");
    setSavedBackendSshPort(resolved.port === null ? "" : String(resolved.port));
    await connectSavedBackendSshTarget(resolved);
  };

  const handleSavedBackendSshHostKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    const isSshHostPopupVisible = sshHostSuggestionsOpen && hasSshHostSuggestionContent;
    if (isSshHostPopupVisible) {
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: { modelPickerOpen: false },
      });
      const index = threadJumpIndexFromCommand(command ?? "");
      const target = index === null ? undefined : filteredDiscoveredSshHosts[index];
      if (target) {
        event.preventDefault();
        event.stopPropagation();
        setSshHostSuggestionsOpen(false);
        void handleSelectSshHostSuggestion(target);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const hasHighlightedSshHost =
      isSshHostPopupVisible && highlightedSshHostRef.current !== undefined;
    if (
      !event.defaultPrevented &&
      !hasHighlightedSshHost &&
      event.key === "Enter" &&
      savedBackendSshHost.trim().length > 0
    ) {
      event.preventDefault();
      void handleAddSavedBackend();
    }
  };

  const handleSetSavedBackendEnabled = async (environmentId: EnvironmentId, enabled: boolean) => {
    setSavedBackendError(null);
    const result = await setEnvironmentEnabled({ environmentId, enabled });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message =
        error instanceof Error
          ? error.message
          : i18n.t("settings.connections.failedToSwitchTheBackendValue", {
              arg0: enabled ? "on" : "off",
            });
      setSavedBackendError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: i18n.t("settings.connections.couldNotSwitchBackendValue", {
            arg0: enabled ? "on" : "off",
          }),
          description: message,
        }),
      );
    }
  };

  const removeSavedBackend = async (environment: EnvironmentPresentation) => {
    const environmentId = environment.environmentId;
    setRemovingSavedEnvironmentId(environmentId);
    setSavedBackendError(null);
    const result = await removeEnvironment(environmentId);
    setRemovingSavedEnvironmentId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message =
        error instanceof Error ? error.message : t("settings.connections.failedToRemoveBackend");
      setSavedBackendError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotRemoveBackend"),
          description: message,
        }),
      );
    }
  };

  // T3 Connect environments get their own dialog: removing one here leaves its
  // account registration, so it points to where that can be deregistered.
  const [pendingT3ConnectRemoval, setPendingT3ConnectRemoval] =
    useState<EnvironmentPresentation | null>(null);
  const handleRemoveSavedBackend = async (environment: EnvironmentPresentation) => {
    if (environment.relayManaged && hasCloudPublicConfig()) {
      setPendingT3ConnectRemoval(environment);
      return;
    }
    const confirmed = await requestConfirmDialog(
      i18n.t(
        "settings.connections.removeValueFromThisDeviceThisForgetsItsPairingCredentialsAndCachedThreadsHereSwitchItOffInsteadToKeepItSaved",
        { arg0: environment.label },
      ),
      { variant: "destructive" },
    );
    if (confirmed === true) await removeSavedBackend(environment);
  };

  const visibleDesktopPairingLinks = desktopPairingLinks;
  const tailscaleHttpsEndpoint = desktopAdvertisedEndpoints.find(isTailscaleHttpsEndpoint) ?? null;
  const visibleDesktopNetworkAdvertisedEndpoints = isLocalBackendNetworkAccessible
    ? desktopAdvertisedEndpoints.filter((endpoint) => !isTailscaleHttpsEndpoint(endpoint))
    : [];
  const visibleDesktopAdvertisedEndpoints = tailscaleHttpsEndpoint
    ? [...visibleDesktopNetworkAdvertisedEndpoints, tailscaleHttpsEndpoint]
    : visibleDesktopNetworkAdvertisedEndpoints;
  const defaultDesktopNetworkAdvertisedEndpoint = selectPairingEndpoint(
    visibleDesktopNetworkAdvertisedEndpoints,
    defaultAdvertisedEndpointKey,
  );
  const defaultDesktopAdvertisedEndpoint =
    defaultDesktopNetworkAdvertisedEndpoint ??
    selectPairingEndpoint(
      tailscaleHttpsEndpoint ? [tailscaleHttpsEndpoint] : [],
      defaultAdvertisedEndpointKey,
    );
  const defaultDesktopAdvertisedEndpointKey = defaultDesktopAdvertisedEndpoint
    ? endpointDefaultPreferenceKey(defaultDesktopAdvertisedEndpoint)
    : null;
  const handleSetDefaultAdvertisedEndpoint = (endpoint: AdvertisedEndpoint) => {
    setDefaultAdvertisedEndpointKey(endpointDefaultPreferenceKey(endpoint));
  };
  const handleSavedBackendHostChange = (value: string) => {
    const parsedPairingUrl = parsePairingUrlFields(value);
    if (parsedPairingUrl) {
      setSavedBackendHost(parsedPairingUrl.host);
      setSavedBackendPairingCode(parsedPairingUrl.pairingCode);
      return;
    }
    setSavedBackendHost(value);
  };

  const renderConnectionModeCard = (input: {
    readonly mode: "remote" | "ssh";
    readonly title: string;
    readonly description: string;
    readonly icon?: ReactNode;
  }) => {
    const selected = savedBackendMode === input.mode;
    return (
      <button
        type="button"
        aria-pressed={selected}
        className={cn(
          "group flex min-h-24 items-start gap-3 rounded-lg border p-4 text-left",
          selected ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted/40",
        )}
        disabled={isAddingSavedBackend}
        onClick={() => {
          setSavedBackendMode(input.mode);
        }}
      >
        {input.icon ? (
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
              selected
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-muted-foreground group-hover:text-foreground",
            )}
          >
            {input.icon}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{input.title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {input.description}
          </span>
        </span>
      </button>
    );
  };

  const renderRemoteFields = () => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-foreground">
            {t("settings.connections.host")}
          </span>
          <Input
            value={savedBackendHost}
            onChange={(event) => handleSavedBackendHostChange(event.target.value)}
            placeholder="backend.example.com"
            disabled={isAddingSavedBackend}
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-foreground">
            {t("settings.connections.pairingCode")}
          </span>
          <Input
            value={savedBackendPairingCode}
            onChange={(event) => setSavedBackendPairingCode(event.target.value)}
            placeholder="PAIRCODE"
            disabled={isAddingSavedBackend}
            spellCheck={false}
          />
        </label>
      </div>
      <div>
        <span className="mt-1 block text-2xs text-muted-foreground">
          {t("settings.connections.pasteAFullPairingUrlHereToFillBothFieldsAutomatically")}
        </span>
      </div>
    </div>
  );
  const relayRouteOffer =
    routeTarget !== null &&
    !routeTarget.relayManaged &&
    relayDiscoveryState.environments.has(routeTarget.environmentId)
      ? relayDiscoveryState.environments.get(routeTarget.environmentId)!.environment
      : null;
  const addRelayRoute = async () => {
    if (relayRouteOffer === null || routeTarget === null) return;
    setIsAddingSavedBackend(true);
    const result = await registerEnvironment(
      new RelayConnectionRegistration({
        target: new RelayConnectionTarget({
          environmentId: relayRouteOffer.environmentId,
          label: routeTarget.label,
        }),
      }),
    );
    setIsAddingSavedBackend(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setSavedBackendError(
          error instanceof Error ? error.message : t("v2.settings.couldNotAddTheRoute"),
        );
      }
      return;
    }
    setAddBackendDialogOpen(false);
    toastManager.add({
      type: "success",
      title: t("v2.settings.routeAdded"),
      description: i18n.t("v2.settings.valueFallsBackToT3ConnectWhenItsOtherRoutesAreUnreachable", {
        arg0: routeTarget.label,
      }),
    });
  };
  const renderRemoteModeBody = () => (
    <div className="space-y-4">
      {relayRouteOffer !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {t("v2.settings.thisMachineIsOnYourT3ConnectAccountUseItAsA")}
          </p>
          <Button
            size="xs"
            variant="outline"
            disabled={isAddingSavedBackend}
            onClick={() => void addRelayRoute()}
          >
            {t("v2.settings.addT3Connect")}
          </Button>
        </div>
      ) : null}
      {renderRemoteFields()}
      {savedBackendError ? <p className="text-xs text-destructive">{savedBackendError}</p> : null}
      <Button
        variant="outline"
        className="w-full"
        disabled={isAddingSavedBackend}
        onClick={() => void handleAddSavedBackend()}
      >
        <PlusIcon className="size-3.5" />
        {isAddingSavedBackend
          ? t("settings.connections.adding")
          : routeTarget
            ? t("v2.settings.addRoute")
            : t("settings.connections.addEnvironment")}
      </Button>
    </div>
  );
  const renderSshFields = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="block">
          <label
            htmlFor="saved-backend-ssh-host"
            className="mb-1.5 block text-xs font-medium text-foreground"
          >
            {t("settings.connections.sshHostOrAlias")}
          </label>
          <Autocomplete
            items={filteredDiscoveredSshHosts}
            itemToStringValue={(target) => target.alias}
            mode="none"
            openOnInputClick
            open={sshHostSuggestionsOpen}
            onOpenChange={setSshHostSuggestionsOpen}
            onItemHighlighted={(target) => {
              highlightedSshHostRef.current = target;
            }}
            value={savedBackendSshHost}
            onValueChange={(value, eventDetails) => {
              setSavedBackendSshHost(value);
              if (eventDetails.reason !== "item-press") return;

              const target = filteredDiscoveredSshHosts.find((host) => host.alias === value);
              if (target) void handleSelectSshHostSuggestion(target);
            }}
          >
            <AutocompleteInput
              id="saved-backend-ssh-host"
              onKeyDown={handleSavedBackendSshHostKeyDown}
              placeholder={t("settings.connections.searchHostsOrTypeDevbox")}
              disabled={isAddingSavedBackend}
              spellCheck={false}
            />
            {hasSshHostSuggestionContent ? (
              <AutocompletePopup>
                {isLoadingDiscoveredSshHosts ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t("settings.connections.loadingHosts")}
                  </div>
                ) : filteredDiscoveredSshHosts.length > 0 ? (
                  <AutocompleteList className="max-h-72">
                    {filteredDiscoveredSshHosts.map((target, index) => {
                      const address = formatDesktopSshTarget(target);
                      const shortcutCommand = index < 9 ? threadJumpCommandForIndex(index) : null;
                      const shortcutLabel = shortcutCommand
                        ? shortcutLabelForCommand(keybindings, shortcutCommand, navigator.platform)
                        : null;
                      return (
                        <AutocompleteItem
                          key={`${target.alias}:${target.hostname}:${target.port ?? ""}`}
                          value={target}
                          className="h-8 min-h-8 whitespace-nowrap"
                        >
                          <span className="min-w-0 truncate text-sm font-medium">
                            {target.alias}
                          </span>
                          {address !== target.alias ? (
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {address}
                            </span>
                          ) : (
                            <span className="flex-1" />
                          )}
                          {shortcutLabel ? (
                            <CommandShortcut className="shrink-0">{shortcutLabel}</CommandShortcut>
                          ) : null}
                        </AutocompleteItem>
                      );
                    })}
                  </AutocompleteList>
                ) : (
                  <AutocompleteEmpty className="break-all">
                    {t("settings.connections.noHostsMatch")}
                    {savedBackendSshHost.trim()}
                    {t("settings.connections.message")}
                  </AutocompleteEmpty>
                )}
              </AutocompletePopup>
            ) : null}
          </Autocomplete>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              {t("settings.connections.username")}
            </span>
            <Input
              value={savedBackendSshUsername}
              onChange={(event) => setSavedBackendSshUsername(event.target.value)}
              onKeyDown={handleSavedBackendSshFieldKeyDown}
              placeholder="root"
              disabled={isAddingSavedBackend}
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              {t("settings.connections.port")}
            </span>
            <Input
              value={savedBackendSshPort}
              onChange={(event) => setSavedBackendSshPort(event.target.value)}
              onKeyDown={handleSavedBackendSshFieldKeyDown}
              placeholder="22"
              inputMode="numeric"
              disabled={isAddingSavedBackend}
              spellCheck={false}
            />
          </label>
        </div>
        {savedBackendError || discoveredSshHostsError ? (
          <Alert variant="error">
            <AlertDescription>{savedBackendError ?? discoveredSshHostsError}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          variant="outline"
          className="w-full"
          disabled={isAddingSavedBackend}
          onClick={() => void handleAddSavedBackend()}
        >
          <PlusIcon className="size-3.5" />
          {isAddingSavedBackend
            ? t("settings.connections.adding")
            : routeTarget
              ? t("v2.settings.addRoute")
              : t("settings.connections.addEnvironment")}
        </Button>
      </div>
    </div>
  );
  const renderNetworkAccessToggle = () => (
    <Switch
      checked={desktopServerExposureState?.mode === "network-accessible"}
      disabled={!desktopServerExposureState || isUpdatingDesktopServerExposure}
      onCheckedChange={(checked) => {
        setPendingDesktopServerExposureMode(checked ? "network-accessible" : "local-only");
      }}
      aria-label={t("settings.connections.enableNetworkAccess")}
    />
  );
  const renderEndpointRows = (presentation: AccessSectionPresentation) =>
    isAdvertisedEndpointListExpanded
      ? visibleDesktopNetworkAdvertisedEndpoints.map((endpoint) => {
          const endpointKey = endpointDefaultPreferenceKey(endpoint);
          return (
            <AdvertisedEndpointListRow
              key={endpoint.id}
              endpoint={endpoint}
              isDefault={endpointKey === defaultDesktopAdvertisedEndpointKey}
              presentation={presentation}
              onSetDefault={handleSetDefaultAdvertisedEndpoint}
              onSetupTailscaleServe={handleStartTailscaleServeSetup}
              onDisableTailscaleServe={handleStartTailscaleServeDisable}
              isUpdatingTailscaleServe={isUpdatingTailscaleServe}
            />
          );
        })
      : null;
  const applyWslSettingChange = async (apply: () => Promise<DesktopWslState>) => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsUpdatingWslBackend(true);
    setDesktopWslMutationError(null);
    const settled = await settlePromise(async () => {
      await apply();
      refreshDesktopWslState();
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error ? error.message : t("settings.connections.failedToUpdateWslBackend");
      setDesktopWslMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.connections.couldNotChangeWslBackend"),
          description: message,
        }),
      );
      refreshDesktopWslState();
    }
    setIsUpdatingWslBackend(false);
  };

  const loadWslState = () => {
    setDesktopWslMutationError(null);
    refreshDesktopWslState();
  };

  const hasWslRegistrationToLose = environments.some((environment) =>
    isDesktopLocalConnectionTarget(environment.entry.target),
  );

  const handleSelectWslMode = (value: string) => {
    if (!desktopBridge || !desktopWslState) return;
    const defaultDistroName =
      desktopWslState.distros.find((distro) => distro.isDefault)?.name ?? null;
    if (value === BACKEND_VALUE_WSL_OFF) {
      // Match the recovery row's visibility (`enabled || wslOnly`): when WSL
      // went unavailable while wsl-only was persisted, `enabled` can be false
      // while `wslOnly` is true, and the "Switch to Windows" button must
      // still clear that state instead of silently no-op'ing.
      if (!desktopWslState.enabled && !desktopWslState.wslOnly) return;
      const wasWslOnly = desktopWslState.wslOnly;
      if (hasWslRegistrationToLose || wasWslOnly) {
        setPendingWslChange({ kind: "disable", wasWslOnly });
        return;
      }
      void applyWslSettingChange(() => desktopBridge.setWslBackendEnabled(false));
      return;
    }
    const nextDistro = value === BACKEND_VALUE_DEFAULT_WSL ? null : value;
    const resolvedNext = nextDistro ?? defaultDistroName;
    if (!desktopWslState.enabled) {
      setPendingWslChange({ kind: "enable", nextDistro });
      return;
    }
    const resolvedCurrent = desktopWslState.distro ?? defaultDistroName;
    if (resolvedCurrent === resolvedNext) return;
    if (hasWslRegistrationToLose || desktopWslState.wslOnly) {
      setPendingWslChange({ kind: "distro", nextDistro });
      return;
    }
    void applyWslSettingChange(() => desktopBridge.setWslDistro(nextDistro));
  };

  const handleConfirmEnableWsl = (mode: "both" | "wsl-only") => {
    if (!desktopBridge || !pendingWslChange || pendingWslChange.kind !== "enable") return;
    const nextDistro = pendingWslChange.nextDistro;
    setPendingWslChange(null);
    const persistedDistro = desktopWslState?.distro ?? null;
    void applyWslSettingChange(() =>
      applyWslEnableSelection({
        bridge: desktopBridge,
        mode,
        nextDistro,
        persistedDistro,
      }),
    );
  };

  const handleToggleWslOnly = (enabled: boolean) => {
    if (!desktopBridge || !desktopWslState || desktopWslState.wslOnly === enabled) return;
    setPendingWslChange({ kind: "wsl-only", nextValue: enabled });
  };

  const handleConfirmWslChange = () => {
    if (!desktopBridge || !pendingWslChange) return;
    const change = pendingWslChange;
    if (change.kind === "enable") return;
    setPendingWslChange(null);
    if (change.kind === "disable") {
      void applyWslSettingChange(async () => {
        const next = await desktopBridge.setWslBackendEnabled(false);
        if (change.wasWslOnly) {
          return await desktopBridge.setWslOnly(false);
        }
        return next;
      });
      return;
    }
    if (change.kind === "distro") {
      void applyWslSettingChange(() => desktopBridge.setWslDistro(change.nextDistro));
      return;
    }
    void applyWslSettingChange(() => desktopBridge.setWslOnly(change.nextValue));
  };

  const renderWslRow = () => {
    if (!desktopWslState) {
      if (
        isWslSettingsRowVisible({ state: null, error: desktopWslError }) &&
        canManageLocalBackend
      ) {
        return (
          <SettingsRow
            {...searchableSetting("wsl-backend")}
            description={t("settings.connections.couldnTLoadTheWslBackendState")}
            status={<span className="block text-destructive">{desktopWslError}</span>}
            control={
              <Button
                size="sm"
                variant="outline"
                onClick={loadWslState}
                disabled={isLoadingWslState}
              >
                {isLoadingWslState ? t("device.retrying") : t("action.retry")}
              </Button>
            }
          />
        );
      }
      return null;
    }
    if (!isWslSettingsRowVisible({ state: desktopWslState, error: desktopWslError })) {
      return null;
    }
    if (!desktopWslState.available) {
      return (
        <SettingsRow
          {...searchableSetting("wsl-backend")}
          description={t(
            "settings.connections.wslIsUnavailableSoWindowsIsRunningInsteadTurnWslOffToClearThisPreference",
          )}
          status={
            desktopWslError ? (
              <span className="block text-destructive">{desktopWslError}</span>
            ) : null
          }
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={isUpdatingWslBackend}
              onClick={() => handleSelectWslMode(BACKEND_VALUE_WSL_OFF)}
            >
              {t("settings.connections.switchToWindows")}
            </Button>
          }
        />
      );
    }
    const defaultDistroName =
      desktopWslState.distros.find((distro) => distro.isDefault)?.name ?? null;
    const selectValue = !desktopWslState.enabled
      ? BACKEND_VALUE_WSL_OFF
      : (desktopWslState.distro ?? defaultDistroName ?? BACKEND_VALUE_DEFAULT_WSL);
    const selectLabel =
      selectValue === BACKEND_VALUE_WSL_OFF
        ? t("settings.misc.off")
        : selectValue === BACKEND_VALUE_DEFAULT_WSL
          ? t("settings.connections.defaultDistro")
          : selectValue;
    return (
      <>
        <SettingsRow
          {...searchableSetting("wsl-backend")}
          description={t(
            "settings.connections.runTheSelectedWslDistroAlongsideWindowsProjectsRemainOnTheirCurrentFilesystem",
          )}
          status={
            desktopWslError ? (
              <span className="block text-destructive">{desktopWslError}</span>
            ) : desktopWslState.preflightError ? (
              <span className="block text-destructive">
                {t("settings.connections.wslBackendCouldnTStart")} {desktopWslState.preflightError}
              </span>
            ) : null
          }
          control={
            <Select
              value={selectValue}
              onValueChange={(value) => {
                if (typeof value !== "string") return;
                handleSelectWslMode(value);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-56"
                aria-label={t("settings.label.wslBackend")}
                disabled={isUpdatingWslBackend}
              >
                <SelectValue>{selectLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value={BACKEND_VALUE_WSL_OFF}>
                  {t("settings.misc.off")}
                </SelectItem>
                {desktopWslState.distros.length === 0 ? (
                  <SelectItem hideIndicator value={BACKEND_VALUE_DEFAULT_WSL}>
                    {t("settings.connections.defaultDistro")}
                  </SelectItem>
                ) : (
                  desktopWslState.distros.map((distro) => (
                    <SelectItem hideIndicator key={distro.name} value={distro.name}>
                      {distro.name}
                      {distro.isDefault ? t("settings.connections.default") : ""}
                    </SelectItem>
                  ))
                )}
              </SelectPopup>
            </Select>
          }
        />
        {desktopWslState.enabled ? (
          <SettingsRow
            title={t("settings.connections.wslOnly")}
            description={t(
              "settings.connections.runOnlyTheWslBackendT3CodeRestartsWhenThisChanges",
            )}
            className="bg-muted/20 pl-7 sm:pl-8"
            control={
              <Switch
                checked={desktopWslState.wslOnly}
                disabled={isUpdatingWslBackend}
                onCheckedChange={(checked) => handleToggleWslOnly(checked)}
                aria-label={t("settings.connections.runWslOnly")}
              />
            }
          />
        ) : null}
      </>
    );
  };

  const renderTailscaleRow = () => (
    <SettingsRow
      title={searchableSetting("tailscale-https").title}
      description={
        tailscaleHttpsEndpoint
          ? tailscaleHttpsEndpoint.status === "available"
            ? tailscaleHttpsEndpoint.httpBaseUrl
            : t("settings.connections.useTailscaleServeToExposeThisBackendThroughAMagicdnsHttpsUrl")
          : missingTailscaleEndpointDescription(desktopServerExposureState)
      }
      control={
        tailscaleHttpsEndpoint ? (
          <Switch
            checked={tailscaleHttpsEndpoint.status === "available"}
            disabled={isUpdatingTailscaleServe}
            onCheckedChange={(checked) => {
              if (checked) {
                handleStartTailscaleServeSetup(tailscaleHttpsEndpoint);
                return;
              }
              handleStartTailscaleServeDisable(tailscaleHttpsEndpoint);
            }}
            aria-label={t("settings.connections.enableTailscaleHttps")}
          />
        ) : null
      }
    />
  );
  const renderAuthorizedClients = (presentation: AccessSectionPresentation) => (
    <>
      {desktopAccessManagementError ? (
        <div className={accessRowClassName(presentation)}>
          <p className="text-xs text-destructive">{desktopAccessManagementError}</p>
        </div>
      ) : null}
      <PairingClientsList
        endpointUrl={desktopServerExposureState?.endpointUrl}
        endpoints={visibleDesktopAdvertisedEndpoints}
        defaultEndpointKey={defaultDesktopAdvertisedEndpointKey}
        presentation={presentation}
        isLoading={isLoadingDesktopAccessManagement}
        pairingLinks={visibleDesktopPairingLinks}
        createdPairingCredentials={createdPairingCredentials}
        clientSessions={desktopClientSessions}
        revokingPairingLinkId={revokingDesktopPairingLinkId}
        revokingClientSessionId={revokingDesktopClientSessionId}
        onRevokePairingLink={handleRevokeDesktopPairingLink}
        onRevokeClientSession={handleRevokeDesktopClientSession}
        canRevoke={canWriteAccess}
      />
    </>
  );
  const renderNetworkAccessRow = () => (
    <SettingsRow
      title={searchableSetting("network-access").title}
      description={
        isLocalBackendNetworkAccessible ? (
          <NetworkAccessDescription
            endpoint={defaultDesktopNetworkAdvertisedEndpoint}
            hiddenEndpointCount={Math.max(visibleDesktopNetworkAdvertisedEndpoints.length - 1, 0)}
            expanded={isAdvertisedEndpointListExpanded}
            onToggleExpanded={() => setIsAdvertisedEndpointListExpanded((expanded) => !expanded)}
            fallback={
              desktopServerExposureState?.endpointUrl
                ? i18n.t("settings.connections.reachableAtValue", {
                    arg0: desktopServerExposureState.endpointUrl,
                  })
                : desktopServerExposureState?.advertisedHost
                  ? i18n.t("settings.connections.exposedOnAllInterfacesPairingLinksUseValue", {
                      arg0: desktopServerExposureState.advertisedHost,
                    })
                  : t("settings.connections.exposedOnAllInterfaces")
            }
          />
        ) : desktopServerExposureState ? (
          t("settings.connections.limitedToThisMachine")
        ) : (
          t("common.loading")
        )
      }
      status={
        desktopServerExposureError ? (
          <span className="block text-destructive">{desktopServerExposureError}</span>
        ) : null
      }
      control={renderNetworkAccessToggle()}
    />
  );
  const renderDisabledNetworkAccessRow = () => (
    <SettingsRow
      title={searchableSetting("network-access").title}
      description={
        desktopBridge
          ? t("v2.settings.thisConnectionCannotViewOrChangeNetworkExposure")
          : currentAuthPolicy === "remote-reachable"
            ? t(
                "settings.connections.remoteAccessIsAlreadyConfiguredChangeNetworkExposureWhereTheServerStarts",
              )
            : currentAuthPolicy === "loopback-browser"
              ? t(
                  "settings.connections.onlyThisMachineCanConnectRestartWithANonLoopbackHostForRemotePairing",
                )
              : t("v2.settings.networkExposureInformationIsUnavailable")
      }
      control={
        !desktopBridge &&
        (currentAuthPolicy === "remote-reachable" || currentAuthPolicy === "loopback-browser") ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Switch
                    checked={isLocalBackendNetworkAccessible}
                    disabled
                    aria-label={t("settings.connections.enableNetworkAccess")}
                  />
                </span>
              }
            />
            <TooltipPopup side="top">
              {t(
                "settings.connections.networkExposureChangesRestartTheBackendAndMustBeControlledWhereTheServerProcessIsLaunched",
              )}
            </TooltipPopup>
          </Tooltip>
        ) : undefined
      }
    />
  );

  const primarySettings = (
    <>
      {primaryEnvironmentId !== null ? (
        <>
          <SettingsSection
            {...searchableSetting("connections-environment")}
            title={
              primaryEnvironment?.label ??
              (desktopBridge
                ? t("settings.label.thisMachine")
                : t("settings.connections.primaryEnvironment"))
            }
            icon={
              <EnvironmentMachineIcon
                aria-hidden
                kind={
                  primaryServerConfig
                    ? resolveEnvironmentMachineKind(primaryServerConfig)
                    : "desktop"
                }
                className="size-4"
              />
            }
            headerAction={
              primaryEnvironmentId !== null ? (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost-muted"
                        size="icon-xs"
                        aria-label={t("settings.connections.moreActionsForThisMachine")}
                      />
                    }
                  >
                    <EllipsisIcon className="size-3.5" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <EnvironmentIconMenu
                      environmentId={primaryEnvironmentId}
                      serverConfig={primaryServerConfig}
                    />
                  </MenuPopup>
                </Menu>
              ) : null
            }
          >
            <LocalEnvironmentSetting />
            {canManageLocalBackend ? (
              <SettingsRow
                title={t("settings.label.version")}
                description={
                  primaryServerUpdateState.status !== "idle" ? (
                    <ServerUpdateProgress state={primaryServerUpdateState} />
                  ) : (
                    [
                      primaryServerConfig?.environment.serverVersion ?? null,
                      primaryEnvironment?.displayUrl ?? null,
                    ]
                      .filter((value): value is string => value !== null)
                      .join(" · ") || t("common.loading")
                  )
                }
                control={
                  primaryVersionMismatch &&
                  primaryEnvironmentId !== null &&
                  primaryServerUpdateState.status !== "running" ? (
                    <ServerUpdateAction
                      size="sm"
                      environmentId={primaryEnvironmentId}
                      serverLabel={
                        primaryEnvironment
                          ? i18n.t("settings.connections.valueServer", {
                              arg0: primaryEnvironment.label,
                            })
                          : t("chat.view.server")
                      }
                      selfUpdate={resolveServerSelfUpdateCapability(primaryServerConfig)}
                      installation={
                        primaryServerConfig?.environment.capabilities.serverInstallation
                      }
                      desktopAppUpdate={supportsDesktopAppUpdate(primaryServerConfig)}
                      threadContinuation={supportsServerUpdateThreadContinuation(
                        primaryServerConfig,
                      )}
                      targetVersion={primaryVersionMismatch.clientVersion}
                      label={
                        primaryServerUpdateState.status === "failed"
                          ? t("settings.connections.retryUpdate")
                          : i18n.t("settings.connections.updateToValue", {
                              arg0: primaryVersionMismatch.clientVersion,
                            })
                      }
                    />
                  ) : primaryServerUpdateState.status === "idle" && primaryServerConfig ? (
                    <LocalVersionStatusLabel />
                  ) : undefined
                }
              />
            ) : null}
            {canManageLocalBackend && desktopBridge ? (
              <>
                {renderNetworkAccessRow()}
                {renderEndpointRows("endpoint-rail")}
                {renderTailscaleRow()}
                {renderWslRow()}
                {canReadRelay || canManageRelay ? (
                  <CloudLinkRow canReadRelay={canReadRelay} canManageRelay={canManageRelay} />
                ) : null}
              </>
            ) : canManageLocalBackend ? (
              <>
                {renderDisabledNetworkAccessRow()}
                {canReadRelay || canManageRelay ? (
                  <CloudLinkRow canReadRelay={canReadRelay} canManageRelay={canManageRelay} />
                ) : null}
              </>
            ) : null}
            {primaryEnvironment ? (
              <details className="group px-3 sm:px-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {t("device.permissions")}
                  <ChevronRightIcon
                    aria-hidden
                    className="size-3 text-muted-foreground group-open:rotate-90"
                  />
                </summary>
                <SessionPermissions
                  environmentId={primaryEnvironment.environmentId}
                  connected={primaryEnvironment.connection.phase === "connected"}
                />
              </details>
            ) : null}
          </SettingsSection>

          {canReadAccess || canWriteAccess ? (
            <FoldedSettingsSection
              id="authorized-clients"
              title={t("settings.connections.authorizedClients")}
              summary={summarizeAuthorizedClients(
                desktopClientSessions,
                visibleDesktopPairingLinks,
              )}
              control={
                canWriteAccess ? (
                  <AuthorizedClientsHeaderAction
                    delegatableScopes={currentSessionScopes ?? []}
                    onPairingLinkCreated={handlePairingLinkCreated}
                    clientSessions={
                      canReadAccess &&
                      authAccessChanges.error === null &&
                      authAccessChanges.data?.type === "snapshot"
                        ? desktopClientSessions
                        : null
                    }
                    isRevokingOtherClients={isRevokingOtherDesktopClients}
                    onRevokeOtherClients={handleRevokeOtherDesktopClients}
                  />
                ) : undefined
              }
            >
              <ScrollArea
                scrollFade
                chainVerticalScroll
                className="max-h-[22.5rem]"
                data-testid="authorized-clients-scroll-area"
              >
                {canReadAccess ? (
                  renderAuthorizedClients("current")
                ) : (
                  <p className="px-4 py-3 text-xs text-muted-foreground">
                    {t(
                      "v2.settings.thisConnectionCanCreateAccessLinksButCannotViewAuthorizedClients",
                    )}
                  </p>
                )}
              </ScrollArea>
            </FoldedSettingsSection>
          ) : null}
          <AlertDialog
            open={pendingDesktopServerExposureMode !== null && canManageLocalBackend}
            onOpenChange={(open) => {
              if (!open && !isUpdatingDesktopServerExposure)
                setPendingDesktopServerExposureMode(null);
            }}
          >
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingDesktopServerExposureMode === "network-accessible"
                    ? t("settings.connections.enableNetworkAccessText")
                    : t("settings.connections.disableNetworkAccess")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingDesktopServerExposureMode === "network-accessible"
                    ? t(
                        "settings.connections.letYourOtherDevicesConnectToT3CodeOverTheNetworkPairDevicesToGiveThemAccessT3CodeWillRestart",
                      )
                    : t(
                        "settings.connections.devicesConnectedOverYourLocalNetworkWillDisconnectExistingTunnelsSuchAsT3ConnectOrTailscaleHttpsKeepWorkingT3CodeWillRestart",
                      )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  disabled={isUpdatingDesktopServerExposure}
                  render={<Button variant="outline" disabled={isUpdatingDesktopServerExposure} />}
                >
                  <span className="[text-box:trim-both_cap_alphabetic]">{t("action.cancel")}</span>
                </AlertDialogClose>
                <Button
                  variant="default"
                  onClick={handleConfirmDesktopServerExposureChange}
                  disabled={
                    !canManageLocalBackend ||
                    pendingDesktopServerExposureMode === null ||
                    isUpdatingDesktopServerExposure
                  }
                >
                  {isUpdatingDesktopServerExposure && <Spinner size="sm" />}
                  <span className="[text-box:trim-both_cap_alphabetic]">
                    {isUpdatingDesktopServerExposure
                      ? t("ui.serverUpdate.restarting")
                      : pendingDesktopServerExposureMode === "network-accessible"
                        ? t("settings.connections.restartAndEnable")
                        : t("settings.connections.restartAndDisable")}
                  </span>
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <AlertDialog
            open={isWslConfirmDialogOpen && canManageLocalBackend}
            onOpenChange={(open) => {
              if (isUpdatingWslBackend) return;
              if (!open) setPendingWslChange(null);
            }}
          >
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingWslChange?.kind === "disable"
                    ? pendingWslChange.wasWslOnly
                      ? t("settings.connections.turnOffWslAndSwitchBackToWindows")
                      : t("settings.connections.disableWslBackend")
                    : pendingWslChange?.kind === "distro"
                      ? t("settings.connections.switchWslDistro")
                      : pendingWslChange?.kind === "enable"
                        ? t("settings.connections.startTheWslBackend")
                        : pendingWslChange?.nextValue
                          ? t("settings.connections.runOnlyTheWslBackend")
                          : t("settings.connections.reEnableTheWindowsBackend")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingWslChange?.kind === "disable"
                    ? pendingWslChange.wasWslOnly
                      ? t(
                          "settings.connections.t3CodeWillRestartOnTheWindowsBackendThreadsAndProjectsOpenedAgainstWslStaySafeInsideTheDistroAndBecomeAvailableAgainWhenYouReEnableWsl",
                        )
                      : t(
                          "settings.connections.theWslBackendWillStopThreadsAndProjectsOpenedAgainstWslStaySafeInsideTheDistroButTheyLlBeUnavailableInT3CodeUntilYouReEnableWsl",
                        )
                    : pendingWslChange?.kind === "distro"
                      ? t(
                          "settings.connections.t3CodeWillRestartTheWslBackendOnTheNewDistroSessionsStillRunningOnTheCurrentDistroWillBeInterrupted",
                        )
                      : pendingWslChange?.kind === "enable"
                        ? t(
                            "settings.connections.runTheWslBackendAlongsideTheWindowsOneOrStopTheWindowsBackendAndUseOnlyWslYouCanChangeThisLaterFromSettings",
                          )
                        : pendingWslChange?.nextValue
                          ? t(
                              "settings.connections.t3CodeWillRestartAndStartOnlyTheWslBackendYourWindowsSideProjectsWonTBeAccessibleUntilYouTurnThisOffAgain",
                            )
                          : t(
                              "settings.connections.t3CodeWillRestartAndBringTheWindowsBackendBackUpAlongsideWsl",
                            )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  disabled={isUpdatingWslBackend}
                  render={<Button variant="outline" disabled={isUpdatingWslBackend} />}
                >
                  {t("action.cancel")}
                </AlertDialogClose>
                {pendingWslChange?.kind === "enable" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleConfirmEnableWsl("wsl-only")}
                      disabled={isUpdatingWslBackend || !canManageLocalBackend}
                    >
                      {isUpdatingWslBackend ? (
                        <>
                          <Spinner size="sm" />

                          {t("settings.connections.applying")}
                        </>
                      ) : (
                        t("settings.connections.useOnlyWsl")
                      )}
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => handleConfirmEnableWsl("both")}
                      disabled={isUpdatingWslBackend || !canManageLocalBackend}
                    >
                      {isUpdatingWslBackend ? (
                        <>
                          <Spinner size="sm" />

                          {t("settings.connections.applying")}
                        </>
                      ) : (
                        t("settings.connections.runBothBackends")
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant={
                      pendingWslChange?.kind === "disable" ||
                      (pendingWslChange?.kind === "wsl-only" && pendingWslChange.nextValue)
                        ? "destructive"
                        : "default"
                    }
                    onClick={handleConfirmWslChange}
                    disabled={isUpdatingWslBackend || !canManageLocalBackend}
                  >
                    {isUpdatingWslBackend ? (
                      <>
                        <Spinner size="sm" />

                        {t("settings.connections.applying")}
                      </>
                    ) : pendingWslChange?.kind === "disable" ? (
                      pendingWslChange.wasWslOnly ? (
                        t("settings.connections.switchToWindows")
                      ) : (
                        t("settings.connections.disableWsl")
                      )
                    ) : pendingWslChange?.kind === "distro" ? (
                      t("settings.connections.switchDistro")
                    ) : pendingWslChange?.nextValue ? (
                      t("settings.connections.restartAndEnable")
                    ) : (
                      t("settings.connections.restartAndDisable")
                    )}
                  </Button>
                )}
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <AlertDialog
            open={disableTailscaleServeDialogOpen && canManageLocalBackend}
            onOpenChange={(open) => {
              if (isUpdatingTailscaleServe) return;
              setDisableTailscaleServeDialogOpen(open);
            }}
          >
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("settings.connections.disableTailscaleHttps")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("settings.connections.t3CodeWillRestartTheLocalBackendWithoutTailscaleServe")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  disabled={isUpdatingTailscaleServe}
                  render={<Button variant="outline" disabled={isUpdatingTailscaleServe} />}
                >
                  {t("action.cancel")}
                </AlertDialogClose>
                <Button
                  variant="destructive"
                  onClick={() => void handleConfirmTailscaleServeDisable()}
                  disabled={isUpdatingTailscaleServe || !canManageLocalBackend}
                >
                  {isUpdatingTailscaleServe ? (
                    <>
                      <Spinner size="sm" />

                      {t("ui.serverUpdate.restarting")}
                    </>
                  ) : (
                    t("settings.connections.restartAndDisable")
                  )}
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <Dialog
            open={pendingTailscaleServeEndpoint !== null}
            onOpenChange={(open) => {
              if (isUpdatingTailscaleServe) return;
              if (!open) setPendingTailscaleServeEndpoint(null);
            }}
          >
            <DialogPopup className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("settings.connections.setUpTailscaleHttps")}</DialogTitle>
                <DialogDescription>
                  {t(
                    "settings.connections.t3CodeWillRestartTheLocalBackendWithTailscaleServeEnabledAndAskTailscaleToProxyHttpsTrafficToThisBackend",
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogPanel>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">
                    {t("settings.connections.httpsPort")}
                  </span>
                  <Input
                    className="mt-2"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65_535}
                    step={1}
                    value={tailscaleServePortInput}
                    onChange={(event) => setTailscaleServePortInput(event.target.value)}
                    disabled={isUpdatingTailscaleServe}
                  />
                </label>
                {!isTailscaleServePortValid ? (
                  <p className="mt-2 text-xs text-destructive">
                    {t("settings.connections.enterAPortFrom1To65535")}
                  </p>
                ) : null}
                <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("settings.connections.httpsEndpoint")}
                  </p>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <p className="mt-1 truncate text-sm text-foreground">
                          {pendingTailscaleServeBaseUrl ??
                            t("settings.connections.pendingMagicdnsEndpoint")}
                        </p>
                      }
                    />
                    {pendingTailscaleServeBaseUrl ? (
                      <TooltipPopup side="top">{pendingTailscaleServeBaseUrl}</TooltipPopup>
                    ) : null}
                  </Tooltip>
                </div>
              </DialogPanel>
              <DialogFooter>
                <DialogClose
                  disabled={isUpdatingTailscaleServe}
                  render={<Button variant="outline" disabled={isUpdatingTailscaleServe} />}
                >
                  {t("action.cancel")}
                </DialogClose>
                <Button
                  onClick={() => void handleConfirmTailscaleServeSetup()}
                  disabled={isUpdatingTailscaleServe || !isTailscaleServePortValid}
                >
                  {isUpdatingTailscaleServe ? (
                    <>
                      <Spinner size="sm" />

                      {t("ui.serverUpdate.restarting")}
                    </>
                  ) : (
                    t("settings.connections.enable")
                  )}
                </Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </>
      ) : (
        <SettingsSection {...searchableSetting("connections-environment")}>
          <SettingsRow
            title={t("v2.settings.noEnvironmentSelected")}
            description={t("v2.settings.connectAnEnvironmentToViewItsSettingsAndAccess")}
          />
          <LocalEnvironmentSetting />
          {canReadRelay || canManageRelay ? (
            <CloudLinkRow canReadRelay={canReadRelay} canManageRelay={canManageRelay} />
          ) : null}
        </SettingsSection>
      )}
    </>
  );

  return (
    <SettingsPageContainer>
      {primarySettings}
      <SettingsSection
        {...searchableSetting("remote-environments")}
        title={t("settings.label.environments")}
        headerAction={
          <div className="flex items-center gap-1">
            {savedServerUpdateTargets.length > 0 ? (
              <ServerUpdatesAction targets={savedServerUpdateTargets} variant="ghost-muted" />
            ) : null}
            <Dialog
              open={addBackendDialogOpen}
              onOpenChange={(open) => {
                setAddBackendDialogOpen(open);
                if (open) {
                  setRouteTarget(null);
                } else {
                  setSavedBackendError(null);
                }
              }}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DialogTrigger
                      render={
                        <Button
                          size="xs"
                          variant="ghost-muted"
                          aria-label={t("settings.connections.addEnvironment")}
                        >
                          <PlusIcon className="size-3" />
                          <span>{t("settings.connections.addEnvironment")}</span>
                        </Button>
                      }
                    />
                  }
                />
                <TooltipPopup side="top">{t("settings.connections.addEnvironment")}</TooltipPopup>
              </Tooltip>
              <DialogPopup className="max-h-[80dvh] sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>
                    {routeTarget
                      ? i18n.t("v2.settings.addARouteToValue", { arg0: routeTarget.label })
                      : t("settings.connections.addEnvironmentText")}
                  </DialogTitle>
                  <DialogDescription>
                    {routeTarget
                      ? t(
                          "v2.settings.pairThisMachineAgainOverAnotherAddressSuchAsItsTailscaleName",
                        )
                      : t("settings.connections.pairAnotherEnvironmentToThisClient")}
                  </DialogDescription>
                </DialogHeader>
                <DialogPanel>
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {renderConnectionModeCard({
                        mode: "remote",
                        title: t("settings.connections.remoteLink"),
                        description: t("settings.connections.enterABackendHostAndPairingCode"),
                        icon: <ChevronsLeftRightEllipsisIcon aria-hidden className="size-4" />,
                      })}
                      {desktopBridge
                        ? renderConnectionModeCard({
                            mode: "ssh",
                            title: "SSH",
                            description: t(
                              "settings.connections.useLocalSshConfigAgentAndTunnelsForTheBackend",
                            ),
                            icon: <TerminalIcon aria-hidden className="size-4" />,
                          })
                        : null}
                    </div>
                    <AnimatedHeight>
                      {savedBackendMode === "ssh" ? renderSshFields() : renderRemoteModeBody()}
                    </AnimatedHeight>
                  </div>
                </DialogPanel>
              </DialogPopup>
            </Dialog>
          </div>
        }
      >
        {listedEnvironments.map((environment) => (
          <SavedBackendListRow
            key={environment.environmentId}
            environment={environment}
            removingEnvironmentId={removingSavedEnvironmentId}
            onSetEnabled={handleSetSavedBackendEnabled}
            onRemove={handleRemoveSavedBackend}
            onAddRoute={(target) => {
              setRouteTarget(target);
              setSavedBackendError(null);
              setAddBackendDialogOpen(true);
            }}
          />
        ))}
        <CloudRemoteEnvironmentRows
          primaryEnvironmentId={primaryEnvironmentId}
          savedEnvironments={savedEnvironments}
        />
      </SettingsSection>
      {hasCloudPublicConfig() ? (
        <RemoveT3ConnectEnvironmentDialog
          environmentLabel={pendingT3ConnectRemoval?.label ?? null}
          onCancel={() => setPendingT3ConnectRemoval(null)}
          onConfirm={() => {
            if (!pendingT3ConnectRemoval) return;
            setPendingT3ConnectRemoval(null);
            void removeSavedBackend(pendingT3ConnectRemoval);
          }}
        />
      ) : null}
      <LoadBalancingSettings environments={loadBalancingEnvironments} />
      <GitHubRoutingSettings environments={loadBalancingEnvironments} />
    </SettingsPageContainer>
  );
}
