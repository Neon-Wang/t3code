import {
  InboxError,
  InboxRegisterPushDeviceInput,
  type InboxItem,
  type InboxPushDevice,
} from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { requireSettingsSecret } from "../secrets/settingsSecretValue.ts";
import * as Settings from "../serverSettings.ts";

const Devices = Schema.Array(InboxRegisterPushDeviceInput);
const decodeDevices = Schema.decodeUnknownEffect(Schema.fromJsonString(Devices));
const encodeDevices = Schema.encodeEffect(Schema.fromJsonString(Devices));
const decodeRelay = Schema.decodeUnknownEffect(
  Schema.Struct({
    results: Schema.Array(
      Schema.Struct({
        index: Schema.Number,
        ok: Schema.Boolean,
        invalidToken: Schema.Boolean,
        code: Schema.String,
      }),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
  }),
);

type PendingPush = { item: InboxItem; kind: "new" | "urgent" };

export const makeInboxPush = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const settings = yield* Settings.ServerSettingsService;
  const secrets = yield* SecretResolver.SecretResolver;
  const identity = yield* ServerEnvironment.ServerEnvironmentIdentity;
  const client = yield* HttpClient.HttpClient;
  const lock = yield* Semaphore.make(1);
  const file = path.join(config.stateDir, "inbox-push-devices.json");
  const deviceError = () => new InboxError({ code: "push_device_failed" });
  const read = Effect.fn("InboxPush.readDevices")(function* () {
    if (!(yield* fs.exists(file))) return [];
    return yield* fs.readFileString(file).pipe(Effect.flatMap(decodeDevices));
  }, Effect.mapError(deviceError));
  const write = Effect.fn("InboxPush.writeDevices")(function* (devices: typeof Devices.Type) {
    const text = yield* encodeDevices(devices);
    yield* fs.writeFileString(`${file}.tmp`, text, { mode: 0o600 });
    yield* fs.rename(`${file}.tmp`, file);
  }, Effect.mapError(deviceError));
  const modify = Effect.fn("InboxPush.modifyDevices")(function* (
    update: (devices: typeof Devices.Type) => typeof Devices.Type,
  ) {
    const devices = yield* read();
    yield* write(update(devices));
  }, lock.withPermits(1));
  const register = Effect.fn("InboxPush.register")(function* (input: InboxRegisterPushDeviceInput) {
    yield* modify((devices) => [
      ...devices.filter((device) => device.deviceId !== input.deviceId),
      input,
    ]);
  });
  const unregister = Effect.fn("InboxPush.unregister")(function* (deviceId: string) {
    yield* modify((devices) => devices.filter((device) => device.deviceId !== deviceId));
  });
  const list = read().pipe(
    Effect.map((devices): ReadonlyArray<InboxPushDevice> =>
      devices.map(({ token: _, ...device }) => device),
    ),
  );
  const pending = yield* Queue.unbounded<PendingPush>();
  const seen = new Map<string, boolean>();
  let initialized = false;
  const observe = Effect.fn("InboxPush.observe")(function* (items: ReadonlyArray<InboxItem>) {
    for (const item of items) {
      const urgent = seen.get(item.id);
      seen.set(item.id, item.urgent || urgent === true);
      if (!initialized || (urgent !== undefined && (urgent || !item.urgent))) continue;
      yield* Queue.offer(pending, { item, kind: urgent === undefined ? "new" : "urgent" });
    }
    initialized = true;
  });
  const send = Effect.fn("InboxPush.send")(
    function* ({ item, kind }: PendingPush) {
      const { inboxPush } = yield* settings.getSettings;
      if (!inboxPush.enabled || !inboxPush.relayUrl || !item.threadId) return;
      const secret = yield* requireSettingsSecret(secrets, inboxPush.relaySecret);
      if (typeof secret !== "string" || !secret) {
        yield* Effect.logWarning("Inbox push has no relay secret.");
        return;
      }
      const devices = yield* read();
      const environmentId = yield* identity.getEnvironmentId;
      const threadId = item.threadId;
      const url = `${inboxPush.relayUrl.replace(/\/$/, "")}/send`;
      yield* Effect.forEach(
        devices,
        (device) =>
          Effect.gen(function* () {
            const request = yield* HttpClientRequest.post(url).pipe(
              HttpClientRequest.bearerToken(secret),
              HttpClientRequest.bodyJson({
                targets: [
                  {
                    provider: device.provider,
                    token: device.token,
                    url: `${device.scheme}://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`,
                  },
                ],
                message: {
                  title: `${item.urgent ? "紧急" : "待办"} · ${item.agent}`,
                  body: item.question,
                  environmentId,
                  threadId,
                  collapseKey: `${item.id}:${kind}`,
                  urgent: item.urgent,
                },
              }),
            );
            const response = yield* client.execute(request);
            if (response.status !== 200) {
              yield* Effect.logWarning("Inbox push relay rejected the request.", {
                status: response.status,
              });
              return;
            }
            const { results } = yield* response.json.pipe(Effect.flatMap(decodeRelay));
            const result = results[0]!;
            if (result.index !== 0) return yield* deviceError();
            if (
              device.provider === "fcm" &&
              result.invalidToken &&
              (result.code === "UNREGISTERED" || result.code === "NOT_FOUND")
            ) {
              yield* modify((current) =>
                current.filter(
                  (entry) =>
                    entry.deviceId !== device.deviceId ||
                    entry.token !== device.token ||
                    entry.provider !== device.provider,
                ),
              );
            }
            if (!result.ok)
              yield* Effect.logWarning("Inbox push delivery failed.", {
                provider: device.provider,
                code: result.code,
              });
          }).pipe(
            Effect.timeout("30 seconds"),
            Effect.catch(() => Effect.logWarning("Inbox push delivery failed.")),
          ),
        { concurrency: 4, discard: true },
      );
    },
    Effect.catch(() => Effect.logWarning("Inbox push failed.")),
  );
  yield* Effect.forever(Queue.take(pending).pipe(Effect.flatMap(send))).pipe(Effect.forkScoped);
  return { register, unregister, list, observe };
});
