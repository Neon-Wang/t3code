import "./platform.js";
import { HarmonySocket, requestHttp, randomBytes, sha256, loadProofKey } from "./platform.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Fiber from "effect/Fiber";
import * as Deferred from "effect/Deferred";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HttpClientError from "effect/http/HttpClientError";
import * as Socket from "effect/socket/Socket";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import { ORCHESTRATION_V2_WS_METHODS } from "@t3tools/contracts";
import { resolveRemotePairingTarget } from "@t3tools/shared/remote";
// oxlint-disable-next-line t3code/no-rpc-permission-bypass -- Isolated P0 bridge calls only the read-only subscribeShell method; no commands are exposed.
import { makeWsRpcProtocolClient } from "../../../packages/client-runtime/src/rpc/protocol.ts";
import {
  exchangeRemoteDpopAccessToken,
  resolveRemoteDpopWebSocketConnectionUrl,
} from "../../../packages/client-runtime/src/authorization/remote.ts";
import {
  createProof,
  DpopProofError,
} from "../../../packages/client-runtime/src/relay/dpopProof.ts";
import { AnalyticsDevice } from "../../../packages/client-runtime/src/platform/capabilities.ts";
import {
  applyShellStreamEvent,
  mergeShellSnapshotProjects,
  reuseUnchangedThreadShells,
} from "../../../packages/client-runtime/src/state/shellReducer.ts";

const httpClient = HttpClient.make((request, url, signal) =>
  Effect.tryPromise({
    try: () => requestHttp(url.toString(), request, signal),
    catch: (cause) =>
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({ request, cause }),
      }),
  }).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response))),
);
const digest = {
  digest: (_algorithm, data) => Effect.promise(() => sha256(data)),
  digestHex: (_algorithm, data) =>
    Effect.promise(() => sha256(data)).pipe(
      Effect.map((bytes) =>
        Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      ),
    ),
};
const services = Layer.mergeAll(
  Layer.succeed(HttpClient.HttpClient, httpClient),
  Layer.succeed(Digest.Digest, digest),
  Layer.succeed(SecureRandom.SecureRandom, SecureRandom.make(randomBytes)),
  Layer.succeed(AnalyticsDevice, { id: Effect.succeed(Option.none()) }),
);
let fiber;
let shell = null;
let status = "未连接";
let connected = false;
const listeners = new Set();

export function getSnapshot() {
  const projects = new Map(shell?.projects.map((project) => [project.id, project.title]) ?? []);
  return JSON.stringify({
    status,
    connected,
    rows:
      shell?.threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        project: projects.get(thread.projectId) ?? "",
      })) ?? [],
  });
}
function publish() {
  const snapshot = getSnapshot();
  for (const listener of listeners) listener(snapshot);
}
export function subscribe(listener) {
  listeners.add(listener);
  listener(getSnapshot());
  return () => {
    listeners.delete(listener);
  };
}
export async function disconnect() {
  if (fiber) await Effect.runPromise(Fiber.interrupt(fiber));
  fiber = undefined;
  connected = false;
  shell = null;
  status = "未连接";
  publish();
}
export async function connect(pairingUrl, context) {
  await disconnect();
  const started = Date.now();
  const firstSnapshot = Deferred.makeUnsafe();
  status = "正在配对";
  publish();
  const operation = Effect.gen(function* () {
    const target = resolveRemotePairingTarget({ pairingUrl });
    console.info("T3P0 pairing URL resolved");
    const nativeKey = yield* Effect.tryPromise(() => loadProofKey(context));
    console.info("T3P0 key loaded");
    const key = {
      publicJwk: nativeKey.publicJwk,
      sign: (data) =>
        Effect.tryPromise({
          try: () => nativeKey.sign(data),
          catch: (cause) => new DpopProofError({ message: "HarmonyOS signing failed", cause }),
        }),
    };
    const proof = (input) => createProof({ ...input, key });
    const tokenProof = yield* proof({
      method: "POST",
      url: new URL("/oauth/token", target.httpBaseUrl).toString(),
    });
    console.info("T3P0 proof created");
    const token = yield* exchangeRemoteDpopAccessToken({
      httpBaseUrl: target.httpBaseUrl,
      credential: target.credential,
      dpopProof: tokenProof,
      clientMetadata: {
        surface: "mobile",
        os: "other",
        deviceType: "mobile",
        label: "HarmonyOS P0",
      },
    });
    console.info("T3P0 DPoP token exchange succeeded");
    const socketUrl = new URL(
      yield* resolveRemoteDpopWebSocketConnectionUrl({
        wsBaseUrl: target.wsBaseUrl,
        httpBaseUrl: target.httpBaseUrl,
        accessToken: token.access_token,
        createProof: proof,
      }),
    );
    socketUrl.searchParams.set("orchestrationProtocol", "2");
    const protocol = RpcClient.layerProtocolSocket({
      pingTimeout: "15 seconds",
      retryTransientErrors: false,
      retryPolicy: Schedule.recurs(0),
    }).pipe(
      Layer.provide(
        Layer.mergeAll(
          Socket.layerWebSocket(socketUrl.toString()).pipe(
            Layer.provide(
              Layer.succeed(Socket.WebSocketConstructor, (address) => new HarmonySocket(address)),
            ),
          ),
          RpcSerialization.layerJson,
        ),
      ),
    );
    status = "正在订阅";
    publish();
    yield* Effect.gen(function* () {
      const client = yield* makeWsRpcProtocolClient;
      yield* client[ORCHESTRATION_V2_WS_METHODS.subscribeShell]({
        requestCompletionMarker: true,
      }).pipe(
        Stream.runForEach((item) =>
          Effect.gen(function* () {
            if (item.kind === "snapshot") {
              shell = reuseUnchangedThreadShells(
                shell,
                mergeShellSnapshotProjects(shell, item.snapshot),
              );
            } else if ("sequence" in item && shell !== null) {
              shell = applyShellStreamEvent(shell, item);
            }
            if (shell !== null) {
              connected = true;
              status = `已连接：${shell.threads.length} 个会话`;
              publish();
              if (!(yield* Deferred.isDone(firstSnapshot))) {
                console.info(
                  `T3P0 first snapshot count=${shell.threads.length} connectMs=${Date.now() - started} at=${Date.now()}`,
                );
                yield* Deferred.succeed(firstSnapshot, undefined);
              }
            }
          }),
        ),
      );
    }).pipe(Effect.provide(protocol));
  }).pipe(
    Effect.scoped,
    Effect.provide(services),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        connected = false;
        status = "连接失败";
        console.error(
          `T3P0 failure ${JSON.stringify(
            cause.reasons.map((reason) => {
              const error = reason.error ?? reason.defect;
              return {
                kind: reason._tag,
                tag: error?._tag,
                name: error?.name,
                message: String(error?.message ?? "")
                  .replace(/(?:https?|wss?):\/\/\S+/g, "[URL]")
                  .replace(/eyJ[\w.-]+/g, "[REDACTED]"),
              };
            }),
          )}`,
        );
        publish();
        yield* Deferred.failCause(firstSnapshot, cause);
      }),
    ),
  );
  fiber = Effect.runFork(operation);
  await Effect.runPromise(Deferred.await(firstSnapshot));
}
