export const runtimeCapabilities = JSON.stringify(
  Object.fromEntries(
    [
      "WebSocket",
      "fetch",
      "crypto",
      "TextEncoder",
      "TextDecoder",
      "URL",
      "URLSearchParams",
      "AbortController",
      "AbortSignal",
      "FormData",
      "Blob",
      "File",
      "Headers",
      "Request",
      "Response",
      "ReadableStream",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "queueMicrotask",
      "performance",
      "Symbol",
      "WeakRef",
      "FinalizationRegistry",
      "structuredClone",
      "Buffer",
    ].map((name) => [name, typeof globalThis[name]]),
  ),
);
console.info(`T3P0 capabilities ${runtimeCapabilities}`);

import util from "@ohos.util";
import url from "@ohos.url";

globalThis.TextEncoder = class {
  encode(value = "") {
    return new util.TextEncoder().encodeInto(value);
  }
};
globalThis.TextDecoder = class {
  constructor(encoding = "utf-8", options) {
    this.decoder = util.TextDecoder.create(encoding, options);
  }
  decode(value, options) {
    return this.decoder.decodeWithStream(
      value instanceof ArrayBuffer ? new Uint8Array(value) : (value ?? new Uint8Array()),
      options,
    );
  }
};
globalThis.URL = url.URL;
globalThis.URLSearchParams = url.URLSearchParams;
globalThis.queueMicrotask = (callback) => {
  Promise.resolve().then(callback);
};

import http from "@ohos.net.http";
import webSocket from "@ohos.net.webSocket";
import cryptoFramework from "@ohos.security.cryptoFramework";
import preferences from "@ohos.data.preferences";

// Web IDL USVString conversion replaces lone surrogates before storing form fields.
const formString = (value) => {
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
  return Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return character.length === 1 && code >= 0xd800 && code <= 0xdfff ? "\ufffd" : character;
  }).join("");
};

const formValue = (value, filename) => {
  if (typeof globalThis.Blob === "function" && value instanceof globalThis.Blob) {
    const isFile = typeof globalThis.File === "function" && value instanceof globalThis.File;
    if (isFile && filename === undefined) return value;
    const name = filename === undefined ? "blob" : formString(filename);
    if (typeof globalThis.File === "function") {
      return new globalThis.File([value], name, {
        type: value.type,
        ...(isFile ? { lastModified: value.lastModified } : {}),
      });
    }
    const file = value.slice(0, value.size, value.type);
    Object.defineProperty(file, "name", { value: name, enumerable: true });
    return file;
  }
  if (filename !== undefined) throw new TypeError("FormData filename requires a Blob value");
  return formString(value);
};

globalThis.FormData = class FormData {
  #fields = [];
  constructor(form) {
    if (form !== undefined) throw new TypeError("FormData requires an HTMLFormElement");
  }
  append(name, value, filename) {
    if (arguments.length < 2) throw new TypeError("FormData.append requires 2 arguments");
    this.#fields.push([formString(name), formValue(value, filename)]);
  }
  set(name, value, filename) {
    if (arguments.length < 2) throw new TypeError("FormData.set requires 2 arguments");
    const key = formString(name);
    const entry = [key, formValue(value, filename)];
    const first = this.#fields.findIndex(([field]) => field === key);
    if (first < 0) {
      this.#fields.push(entry);
    } else {
      this.#fields[first] = entry;
      this.#fields = this.#fields.filter(([field], index) => field !== key || index === first);
    }
  }
  get(name) {
    if (arguments.length < 1) throw new TypeError("FormData.get requires 1 argument");
    const key = formString(name);
    return this.#fields.find(([field]) => field === key)?.[1] ?? null;
  }
  getAll(name) {
    if (arguments.length < 1) throw new TypeError("FormData.getAll requires 1 argument");
    const key = formString(name);
    return this.#fields.filter(([field]) => field === key).map(([, value]) => value);
  }
  has(name) {
    if (arguments.length < 1) throw new TypeError("FormData.has requires 1 argument");
    const key = formString(name);
    return this.#fields.some(([field]) => field === key);
  }
  delete(name) {
    if (arguments.length < 1) throw new TypeError("FormData.delete requires 1 argument");
    const key = formString(name);
    this.#fields = this.#fields.filter(([field]) => field !== key);
  }
  *entries() {
    for (let index = 0; index < this.#fields.length; index++) yield [...this.#fields[index]];
  }
  *keys() {
    for (const [name] of this.entries()) yield name;
  }
  *values() {
    for (const [, value] of this.entries()) yield value;
  }
  forEach(callback, thisArg) {
    if (typeof callback !== "function") throw new TypeError("FormData.forEach requires a callback");
    for (const [name, value] of this.entries()) callback.call(thisArg, value, name, this);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  get [Symbol.toStringTag]() {
    return "FormData";
  }
};

class AbortSignalAdapter {
  aborted = false;
  reason = undefined;
  listeners = new Map();
  addEventListener(type, listener, options) {
    if (type === "abort") this.listeners.set(listener, options?.once === true);
  }
  removeEventListener(type, listener) {
    if (type === "abort") this.listeners.delete(listener);
  }
  throwIfAborted() {
    if (this.aborted) throw this.reason;
  }
}
globalThis.AbortSignal = AbortSignalAdapter;
globalThis.AbortController = class {
  signal = new AbortSignalAdapter();
  abort(reason = new Error("Aborted")) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason;
    for (const [listener, once] of this.signal.listeners) {
      if (once) this.signal.listeners.delete(listener);
      listener({ type: "abort", target: this.signal });
    }
  }
};

export class HarmonySocket {
  readyState = 0;
  listeners = new Map();
  constructor(address) {
    this.socket = webSocket.createWebSocket();
    this.socket.on("open", () => {
      this.readyState = 1;
      this.emit("open", {});
    });
    this.socket.on("message", (_error, data) => {
      this.emit("message", { data });
    });
    this.socket.on("close", (_error, result) => {
      this.readyState = 3;
      this.emit("close", result);
    });
    this.socket.on("error", (error) => {
      this.emit("error", { error });
    });
    this.socket.connect(address).catch((error) => {
      this.emit("error", { error });
    });
  }
  emit(type, event) {
    for (const [listener, once] of this.listeners.get(type) ?? []) {
      if (once) this.listeners.get(type).delete(listener);
      listener(event);
    }
  }
  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Map());
    this.listeners.get(type).set(listener, options?.once === true);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  send(data) {
    const body =
      typeof data === "string"
        ? data
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.socket.send(body).catch((error) => {
      this.emit("error", { error });
    });
  }
  close(code = 1000, reason = "") {
    this.readyState = 2;
    this.socket.close({ code, reason }).catch((error) => {
      this.emit("error", { error });
    });
  }
}

export async function requestHttp(address, request, signal) {
  const client = http.createHttp();
  const abort = () => {
    client.destroy();
  };
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (request.body._tag === "FormData") {
      throw new Error("multipart upload is not supported yet on HarmonyOS");
    }
    if (request.body._tag !== "Empty" && request.body._tag !== "Uint8Array") {
      throw new Error(`Unsupported P0 HTTP body: ${request.body._tag}`);
    }
    const result = await client.request(address, {
      method: request.method,
      header: request.headers,
      ...(request.body._tag === "Uint8Array"
        ? {
            extraData: request.body.body.buffer.slice(
              request.body.body.byteOffset,
              request.body.body.byteOffset + request.body.body.byteLength,
            ),
          }
        : {}),
      expectDataType: http.HttpDataType.STRING,
      usingCache: false,
      connectTimeout: 10000,
      readTimeout: 10000,
    });
    return {
      url: address,
      status: result.responseCode,
      headers: result.header,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(result.result).buffer),
    };
  } finally {
    signal.removeEventListener("abort", abort);
    client.destroy();
  }
}

export const randomBytes = (size) => cryptoFramework.createRandom().generateRandomSync(size).data;
export async function sha256(data) {
  const digest = cryptoFramework.createMd("SHA256");
  await digest.update({ data });
  return (await digest.digest()).data;
}

const toBytes = (number) => {
  const hex = number.toString(16).padStart(64, "0");
  return Uint8Array.from(hex.match(/../g), (value) => Number.parseInt(value, 16));
};
const base64 = new util.Base64Helper();
const base64url = (data) =>
  base64.encodeToStringSync(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function loadProofKey(context) {
  const store = await preferences.getPreferences(context, { name: "t3-p0-dpop" });
  const generator = cryptoFramework.createAsyKeyGenerator("ECC256");
  const savedPublic = await store.get("public", "");
  const savedPrivate = await store.get("private", "");
  const pair =
    savedPublic && savedPrivate
      ? await generator.convertKey(
          { data: base64.decodeSync(savedPublic) },
          { data: base64.decodeSync(savedPrivate) },
        )
      : await generator.generateKeyPair();
  if (!savedPublic || !savedPrivate) {
    await store.put("public", base64.encodeToStringSync(pair.pubKey.getEncoded().data));
    await store.put("private", base64.encodeToStringSync(pair.priKey.getEncoded().data));
    await store.flush();
  }
  return {
    publicJwk: {
      kty: "EC",
      crv: "P-256",
      x: base64url(toBytes(pair.pubKey.getAsyKeySpec(cryptoFramework.AsyKeySpecItem.ECC_PK_X_BN))),
      y: base64url(toBytes(pair.pubKey.getAsyKeySpec(cryptoFramework.AsyKeySpecItem.ECC_PK_Y_BN))),
    },
    sign: async (data) => {
      const signer = cryptoFramework.createSign("ECC256|SHA256");
      await signer.init(pair.priKey);
      const signature = (await signer.sign({ data })).data;
      // ECC signatures are DER encoded; JOSE requires two unsigned 32-byte integers.
      const rLength = signature[3];
      const sLength = signature[5 + rLength];
      const raw = new Uint8Array(64);
      const r = signature.slice(4, 4 + rLength);
      const s = signature.slice(6 + rLength, 6 + rLength + sLength);
      raw.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
      raw.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length));
      return raw;
    },
  };
}
