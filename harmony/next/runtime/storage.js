import asset from "@ohos.security.asset";
import preferences from "@ohos.data.preferences";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  ConnectionCatalogDocument,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  registerConnectionInCatalog,
  removeConnectionFromCatalog,
  setConnectionEnabledInCatalog,
  setRoutesInCatalog,
  replaceCatalogValue,
  removeCatalogValue,
  putRemoteDpopTokenInCatalog,
  Persistence,
  StoredOrchestrationShellSnapshot,
  makeStoredShellSnapshotEncoder,
} from "@t3tools/client-runtime/platform";
import {
  CredentialStore,
  ProfileStore,
  ConnectionTransientError,
  PullRequestRoutingPermissions,
  makePullRequestRoutingPermissions,
} from "@t3tools/client-runtime/connection";
import { TokenStore } from "@t3tools/client-runtime/authorization";

const encode = (text) => new TextEncoder().encode(text);
const decode = (bytes) => new TextDecoder().decode(bytes);
const alias = (key) => new Map([[asset.Tag.ALIAS, encode(key)]]);
async function readAsset(key) {
  try {
    const rows = await asset.query(
      new Map([...alias(key), [asset.Tag.RETURN_TYPE, asset.ReturnType.ALL]]),
    );
    return rows[0].get(asset.Tag.SECRET);
  } catch (error) {
    if (error.code === asset.ErrorCode.NOT_FOUND) return null;
    throw error;
  }
}
const writeAsset = (key, bytes) =>
  asset.add(
    new Map([
      ...alias(key),
      [asset.Tag.SECRET, bytes],
      [asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED],
      [asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE],
    ]),
  );
const catalogKey = "t3.connection-catalog.v1";

// Asset secrets are limited to 1 KiB. Publish the manifest only after all chunks are durable.
async function readCatalog() {
  const root = await readAsset(catalogKey);
  if (root === null) return null;
  const manifest = JSON.parse(decode(root));
  const chunks = [];
  for (let i = 0; i < manifest.count; i++) {
    const chunk = await readAsset(`${catalogKey}.${manifest.generation}.${i}`);
    if (chunk === null) throw new Error("Connection catalog chunk is missing");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return decode(bytes);
}
async function writeCatalog(text, committed) {
  const previous = await readAsset(catalogKey);
  const bytes = encode(text);
  const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const count = Math.ceil(bytes.length / 1024);
  const written = [];
  try {
    for (let i = 0; i < count; i++) {
      const key = `${catalogKey}.${generation}.${i}`;
      await writeAsset(key, bytes.slice(i * 1024, (i + 1) * 1024));
      written.push(key);
    }
    await writeAsset(catalogKey, encode(JSON.stringify({ generation, count })));
    committed();
  } catch (error) {
    for (const key of written) await asset.remove(alias(key));
    throw error;
  }
  if (previous !== null) {
    const old = JSON.parse(decode(previous));
    for (let i = 0; i < old.count; i++)
      await asset.remove(alias(`${catalogKey}.${old.generation}.${i}`));
  }
}
const catalogError = (cause) =>
  new ConnectionTransientError({
    reason: "remote-unavailable",
    detail: `Encrypted connection catalog failed (${cause.name ?? "Error"}, ${cause.code ?? "no code"}).`,
  });
const persistenceError = (operation) => () =>
  new Persistence.ConnectionPersistenceError({
    operation,
    message: `Could not ${operation} in HarmonyOS storage.`,
  });

export function storageLayer(context) {
  return Layer.effectContext(
    Effect.gen(function* () {
      const lock = yield* Semaphore.make(1);
      const codec = Schema.fromJsonString(ConnectionCatalogDocument);
      const raw = yield* Effect.tryPromise({ try: readCatalog, catch: catalogError });
      let document =
        raw === null
          ? EMPTY_CONNECTION_CATALOG_DOCUMENT
          : yield* Schema.decodeEffect(codec)(raw).pipe(Effect.mapError(catalogError));
      const read = Effect.sync(() => document);
      const update = (transform) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const next = transform(document);
            const serialized = yield* Schema.encodeEffect(codec)(next).pipe(
              Effect.mapError(catalogError),
            );
            yield* Effect.tryPromise({
              try: () =>
                writeCatalog(serialized, () => {
                  document = next;
                }),
              catch: catalogError,
            });
          }),
        );
      const permissions = yield* makePullRequestRoutingPermissions({
        read: read.pipe(Effect.map((doc) => doc.githubRoutingPermissions ?? [])),
        write: (githubRoutingPermissions) =>
          update((doc) => ({ ...doc, githubRoutingPermissions })),
      });
      const operation = (name, effect) => effect.pipe(Effect.mapError(persistenceError(name)));
      const prefs = yield* Effect.tryPromise({
        try: () => preferences.getPreferences(context, { name: "t3-client-cache" }),
        catch: persistenceError("load-shell"),
      });
      const cacheRead = (key) =>
        Effect.tryPromise({ try: () => prefs.get(key, ""), catch: persistenceError("load-shell") });
      const cacheWrite = (key, value) =>
        Effect.tryPromise({
          try: async () => {
            await prefs.put(key, value);
            await prefs.flush();
          },
          catch: persistenceError("save-shell"),
        });
      const shellCodec = Schema.fromJsonString(StoredOrchestrationShellSnapshot);
      const encodeShell = makeStoredShellSnapshotEncoder();
      return Context.make(Persistence.ConnectionTargetStore, {
        list: read.pipe(Effect.map((doc) => doc.targets)),
        listDisabled: read.pipe(Effect.map((doc) => doc.disabledEnvironmentIds)),
      }).pipe(
        Context.add(Persistence.ConnectionRegistrationStore, {
          register: (registration, routes) =>
            operation(
              "register-connection",
              update((doc) => registerConnectionInCatalog(doc, registration, routes)),
            ),
          setRoutes: (id, routes) =>
            operation(
              "set-connection-routes",
              update((doc) => setRoutesInCatalog(doc, id, routes)),
            ),
          remove: (id) =>
            operation(
              "remove-connection",
              update((doc) => removeConnectionFromCatalog(doc, id)),
            ),
          setEnabled: (id, enabled) =>
            operation(
              "set-connection-enabled",
              update((doc) => setConnectionEnabledInCatalog(doc, id, enabled)),
            ),
        }),
        Context.add(ProfileStore.ConnectionProfileStore, {
          get: (id) =>
            read.pipe(
              Effect.map((doc) =>
                Option.fromUndefinedOr(doc.profiles.find((p) => p.connectionId === id)),
              ),
            ),
          put: (profile) =>
            update((doc) => ({
              ...doc,
              profiles: replaceCatalogValue(doc.profiles, (p) => p.connectionId, profile),
            })),
          remove: (id) =>
            update((doc) => ({
              ...doc,
              profiles: removeCatalogValue(doc.profiles, (p) => p.connectionId, id),
            })),
        }),
        Context.add(CredentialStore.ConnectionCredentialStore, {
          get: (id) =>
            read.pipe(
              Effect.map((doc) =>
                Option.fromUndefinedOr(
                  doc.credentials.find((p) => p.connectionId === id)?.credential,
                ),
              ),
            ),
          put: (connectionId, credential) =>
            update((doc) => ({
              ...doc,
              credentials: replaceCatalogValue(doc.credentials, (p) => p.connectionId, {
                connectionId,
                credential,
              }),
            })),
          remove: (id) =>
            update((doc) => ({
              ...doc,
              credentials: removeCatalogValue(doc.credentials, (p) => p.connectionId, id),
            })),
        }),
        Context.add(TokenStore.RemoteDpopAccessTokenStore, {
          get: (id) =>
            read.pipe(
              Effect.map((doc) =>
                Option.fromUndefinedOr(doc.remoteDpopTokens.find((p) => p.environmentId === id)),
              ),
            ),
          put: (token) => update((doc) => putRemoteDpopTokenInCatalog(doc, token)),
          remove: (id) =>
            update((doc) => ({
              ...doc,
              remoteDpopTokens: removeCatalogValue(
                doc.remoteDpopTokens,
                (p) => p.environmentId,
                id,
              ),
            })),
        }),
        Context.add(PullRequestRoutingPermissions, permissions),
        Context.add(Persistence.EnvironmentCacheStore, {
          loadShell: (id) =>
            cacheRead(`shell:${id}`).pipe(
              Effect.flatMap((value) =>
                value === ""
                  ? Effect.succeedNone
                  : Schema.decodeEffect(shellCodec)(value).pipe(
                      Effect.map((stored) =>
                        Option.some({
                          ...stored.snapshot,
                          ...(stored.origin ? { origin: stored.origin } : {}),
                        }),
                      ),
                      Effect.mapError(persistenceError("load-shell")),
                    ),
              ),
            ),
          saveShell: (id, snapshot, origin) =>
            encodeShell({
              schemaVersion: 3,
              environmentId: id,
              snapshot,
              ...(origin ? { origin } : {}),
            }).pipe(
              Effect.flatMap((value) => cacheWrite(`shell:${id}`, value)),
              Effect.mapError(persistenceError("save-shell")),
            ),
          loadServerConfig: (id) =>
            cacheRead(`config:${id}`).pipe(
              Effect.map((value) =>
                value === "" ? Option.none() : Option.some(JSON.parse(value)),
              ),
            ),
          saveServerConfig: (id, config) => cacheWrite(`config:${id}`, JSON.stringify(config)),
          clear: (id) =>
            Effect.tryPromise({
              try: async () => {
                await prefs.delete(`shell:${id}`);
                await prefs.delete(`config:${id}`);
                await prefs.flush();
              },
              catch: persistenceError("clear-environment"),
            }),
        }),
      );
    }),
  );
}
