import {
  createEnvironmentProjectAtoms,
  createProjectEnvironmentAtoms,
} from "@t3tools/client-runtime/state/projects";
import "./platform.js";
export { markdownBlocks } from "./markdown.js";
import pasteboard from "@ohos.pasteboard";
import {
  encodeComposerContextFragment,
  encodeComposerContextClipboardHtml,
} from "@t3tools/shared/composerContextClipboard";
export { customSnoozeDefaults, customSnoozeValid } from "./lists.js";
import { createLists } from "./lists.js";
import { createThreadDetails } from "./threads.js";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
} from "@t3tools/client-runtime/state/threads";
import { translate, refreshLocale, localeAtom } from "./locale.js";
export { translate, refreshLocale };
import { HarmonySocket, requestHttp, randomBytes, sha256 } from "./platform.js";
import { storageLayer } from "./storage.js";
import connection from "@ohos.net.connection";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HttpClientError from "effect/http/HttpClientError";
import * as Socket from "effect/socket/Socket";
import { Atom, AtomRegistry } from "effect/reactivity";
import { RelayMobileClientId } from "@t3tools/contracts/relay";
import { ORCHESTRATION_V2_WS_METHODS } from "@t3tools/contracts";
import {
  Connection,
  ConnectionOnboarding,
  Connectivity,
  Wakeups,
  ConnectionBlockedError,
} from "@t3tools/client-runtime/connection";
import { ClientCapabilities, PlatformConnectionSource } from "@t3tools/client-runtime/platform";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import { createEnvironmentPresentationAtoms } from "@t3tools/client-runtime/state/presentation";
import { environmentStatusText } from "../../../apps/mobile/src/features/connection/environmentStatusText.ts";
import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import {
  createEnvironmentShellAtoms,
  ShellSnapshotLoader,
} from "@t3tools/client-runtime/state/shell";
import {
  createEnvironmentRpcCommand,
  createRuntimeCommand,
} from "@t3tools/client-runtime/state/runtime";
import { mobileApplicationActiveWakeup } from "../../../apps/mobile/src/connection/app-state-wakeups.ts";

const listeners = new Set();
const wakeListeners = new Set();
let backgroundedAt = null;
let client;
let initialization;
let lastSnapshot = JSON.stringify({
  status: "未连接",
  connected: false,
  rows: [],
  environments: [],
});
const unsupported = () =>
  Effect.fail(
    new ConnectionBlockedError({
      reason: "unsupported",
      detail: "This connection type is not available on HarmonyOS yet.",
    }),
  );
const httpClient = HttpClient.make((request, url, signal) =>
  Effect.tryPromise({
    try: () => requestHttp(url.toString(), request, signal),
    catch: (cause) =>
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, cause }),
      }),
  }).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response))),
);

const networkStatus = Effect.promise(async () =>
  (await connection.hasDefaultNet()) ? "online" : "offline",
);
const networkChanges = Stream.callback((queue) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const monitor = connection.createNetConnection();
      monitor.on("netAvailable", () => {
        Queue.offerUnsafe(queue, "online");
        for (const listener of wakeListeners) listener("network-changed");
      });
      monitor.on("netUnavailable", () => Queue.offerUnsafe(queue, "offline"));
      monitor.on("netLost", () => {
        Effect.runPromise(networkStatus).then(
          (status) => Queue.offerUnsafe(queue, status),
          (error) => console.error(`Network state failed: ${error.code}`),
        );
      });
      await monitor.register();
      return monitor;
    }),
    (monitor) => Effect.promise(() => monitor.unregister()),
  ),
);
const wakeups = Stream.callback((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const listener = (reason) => Queue.offerUnsafe(queue, reason);
      wakeListeners.add(listener);
      return listener;
    }),
    (listener) => Effect.sync(() => wakeListeners.delete(listener)),
  ),
);

function platformLayer(context) {
  const native = Layer.mergeAll(
    storageLayer(context),
    Layer.succeed(HttpClient.HttpClient, httpClient),
    Layer.succeed(Socket.WebSocketConstructor, (address) => new HarmonySocket(address)),
    Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make(randomBytes)),
    Layer.succeed(Digest.Digest, {
      digest: (_algorithm, data) => Effect.promise(() => sha256(data)),
      digestHex: (_algorithm, data) =>
        Effect.promise(() => sha256(data)).pipe(
          Effect.map((bytes) =>
            Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
          ),
        ),
    }),
    Connectivity.layer({ status: networkStatus, changes: networkChanges }),
    Wakeups.layer({ changes: wakeups }),
    Layer.succeed(PlatformConnectionSource.PlatformConnectionSource, {
      registrations: Stream.empty,
    }),
    Layer.succeed(ClientCapabilities.CloudSession, {
      identity: Effect.succeedNone,
      clerkToken: unsupported(),
    }),
    Layer.succeed(ClientCapabilities.RelayDeviceIdentity, { deviceId: Effect.succeedNone }),
    Layer.succeed(ClientCapabilities.PrimaryEnvironmentAuth, { bearerToken: Effect.succeedNone }),
    Layer.succeed(ClientCapabilities.ClientPresentation, {
      metadata: {
        surface: "mobile",
        os: "other",
        deviceType: "mobile",
        label: "T3 Code HarmonyOS",
      },
    }),
    Layer.succeed(ClientCapabilities.SshEnvironmentGateway, {
      provision: unsupported,
      prepare: unsupported,
      disconnect: unsupported,
    }),
    // The shared authorization layer resolves this capability even for Bearer routes.
    // No keys are created until T3 Connect is implemented.
    Layer.succeed(ManagedRelay.ManagedRelayDpopSigner, {
      thumbprint: Effect.die(new Error("T3 Connect is not available on HarmonyOS yet.")),
      createProof: () => Effect.die(new Error("T3 Connect is not available on HarmonyOS yet.")),
    }),
  );
  return ManagedRelay.layer({
    relayUrl: "http://relay.invalid",
    clientId: RelayMobileClientId,
  }).pipe(Layer.provideMerge(native));
}

export function getSnapshot() {
  return lastSnapshot;
}
export function subscribe(listener) {
  listeners.add(listener);
  listener(lastSnapshot);
  return () => listeners.delete(listener);
}
function publish(snapshot) {
  lastSnapshot = JSON.stringify(snapshot);
  for (const listener of listeners) listener(lastSnapshot);
}

export function initialize(context) {
  if (initialization) return initialization;
  initialization = (async () => {
    const base = platformLayer(context);
    const layer = Layer.mergeAll(
      ShellSnapshotLoader.layer,
      BoundedThreadSnapshotLoader.layer,
      ThreadHistoryController.layer,
    ).pipe(
      Layer.provideMerge(Connection.layerWithOptions({ providerCatalogsOnDemand: true })),
      Layer.provideMerge(base),
    );
    const runtime = Atom.runtime(layer);
    const registry = AtomRegistry.make();
    const catalog = createEnvironmentCatalogAtoms(runtime);
    const shell = createEnvironmentShellAtoms(runtime);
    const session = createEnvironmentSessionAtoms(runtime);
    const server = createServerEnvironmentAtoms(runtime, {
      initialConfigValueAtom: session.initialConfigValueAtom,
      providerCatalogsOnDemand: true,
    });
    const presentations = createEnvironmentPresentationAtoms({
      catalogValueAtom: catalog.catalogValueAtom,
      stateAtom: catalog.stateAtom,
      serverConfigValueAtom: server.configValueAtom,
    });
    const lists = await createLists({
      runtime,
      registry,
      catalog,
      shell,
      session,
      server,
      presentations,
      context,
    });
    const projects = createEnvironmentProjectAtoms({
      catalogValueAtom: catalog.catalogValueAtom,
      snapshotAtom: lists.commands.snapshotAtom,
      serverConfigValueAtom: server.configValueAtom,
    });
    const projectCommands = createProjectEnvironmentAtoms(runtime, {
      projectAtom: projects.projectAtom,
    });
    const pairing = createRuntimeCommand(runtime, {
      label: "harmony:pair",
      execute: (input) =>
        ConnectionOnboarding.ConnectionOnboarding.pipe(
          Effect.flatMap((onboarding) => onboarding.registerPairing(input)),
        ),
    });
    const dispatch = createEnvironmentRpcCommand(runtime, {
      label: "harmony:dispatch",
      tag: ORCHESTRATION_V2_WS_METHODS.dispatchCommand,
    });
    const view = Atom.make((get) => {
      const entries = get(catalog.catalogValueAtom).entries;

      const environments = [];
      for (const [id, entry] of entries) {
        const presentation = get(presentations.presentationAtom(id));
        const current = entry.enabled ? get(shell.stateValueAtom(id)) : null;
        const connectionState = presentation.connection;
        environments.push({
          id,
          label: entry.target.label,
          address: Option.getOrNull(entry.profile)?.httpBaseUrl ?? "",
          enabled: entry.enabled,
          state: connectionState,
          shellStatus: current?.status ?? "empty",
          status: environmentStatusText(connectionState),
        });
      }
      const connected = environments.some((env) => env.shellStatus === "live");
      return {
        locale: get(localeAtom),
        status: translate(
          connected ? "mobile.connectionTone.connected" : "mobile.connectionTone.offline",
        ),
        connected,
        ...get(lists.view),
        environments,
      };
    });
    client = {
      runtime,
      registry,
      catalog,
      shell,
      session,
      server,
      presentations,
      lists,
      details: createThreadDetails({
        runtime,
        registry,
        lists,
        catalog,
        session,
        server,
        context,
        projectCommands,
      }),
      pairing,
      dispatch,
      unsubscribe: registry.subscribe(view, publish, { immediate: true }),
    };
    const result = await Effect.runPromise(AtomRegistry.getResult(registry, runtime));
    return result;
  })().catch((error) => {
    console.error(
      `T3P1 init ${String(error)
        .replace(/(?:https?|wss?):\/\/\S+/g, "[URL]")
        .replace(/eyJ[\w.-]+/g, "[REDACTED]")}`,
    );
    throw error;
  });
  return initialization;
}
async function run(command, input) {
  const result = await command.run(client.registry, input);
  if (result._tag === "Failure") throw new Error("操作失败，请检查连接状态和权限。");
  return result.value;
}
export async function connect(pairingUrl, context) {
  await initialize(context);
  return run(client.pairing, { pairingUrl });
}
export async function setEnvironmentEnabled(id, enabled) {
  return run(client.catalog.setEnabled, { environmentId: id, enabled });
}
export async function removeEnvironment(id) {
  return run(client.catalog.remove, id);
}
export async function disconnect() {
  const entries = client.registry.get(client.catalog.catalogValueAtom).entries;
  for (const [id] of entries) await setEnvironmentEnabled(id, false);
}
export function dispatchCommand(environmentId, command) {
  return run(client.dispatch, { environmentId, input: command });
}
export function setForeground(active) {
  client?.lists.foreground(active);
  if (!active) {
    backgroundedAt = Date.now();
    return;
  }
  const reason = mobileApplicationActiveWakeup(backgroundedAt, Date.now());
  backgroundedAt = null;
  for (const listener of wakeListeners) listener(reason);
}
export function dispose() {
  if (client) {
    client.unsubscribe();
    client.details.dispose();
    client.lists.dispose();
    client.registry.dispose();
  }
  client = undefined;
  initialization = undefined;
}

export function subscribeThread(environmentId, threadId, listener) {
  return client.details.subscribe({ environmentId, threadId }, listener);
}
export function threadFeedAction(environmentId, threadId, action, id) {
  return client.details.action({ environmentId, threadId }, action, id);
}

export function setThreadFilter(searchQuery, projectKey) {
  client.lists.update({ searchQuery, projectKey });
}
export function toggleThreadGroup(group) {
  return client.lists.toggle(group);
}
export function showMoreThreads() {
  client.lists.more();
}
export function retryThreadPages() {
  client.lists.retry();
}
export async function threadAction(environmentId, threadId, action, value = "") {
  if (action === "copy-thread-id") {
    await pasteboard.getSystemPasteboard().setData(pasteboard.createPlainTextData(threadId));
    return;
  }
  if (action === "copy-thread") {
    const target = client.lists.copyTarget(environmentId, threadId);
    const encoded = encodeComposerContextFragment(target.fragment);
    const data = pasteboard.createHtmlData(
      encodeComposerContextClipboardHtml(target.value, encoded),
    );
    data.addTextRecord(target.value);
    await pasteboard.getSystemPasteboard().setData(data);
    return;
  }
  if (action === "move-up" || action === "move-down") {
    for (const command of client.lists.move(
      environmentId,
      threadId,
      action === "move-up" ? "up" : "down",
    ))
      await run(...command);
    return;
  }
  const regenerating = action === "regenerate-title";
  if (regenerating) client.lists.setRegenerating(environmentId, threadId, true);
  try {
    const command = client.lists.command(environmentId, threadId, action, value);
    if (command) return await run(...command);
  } finally {
    if (regenerating) client.lists.setRegenerating(environmentId, threadId, false);
  }
}

export function answerQuestion(environmentId, id, text) {
  return run(client.server.answerAskHuman, { environmentId, input: { id, text } });
}
export function closeQuestion(environmentId, id) {
  return run(client.server.closeAskHuman, {
    environmentId,
    input: { id, reason: translate("inbox.close") },
  });
}

export function setComposerText(environmentId, threadId, text) {
  client.details.setText({ environmentId, threadId }, text);
}
