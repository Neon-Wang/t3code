// @effect-diagnostics globalFetch:off globalDate:off - This standalone Worker uses the Workers request runtime; Effect supplies schemas only.
import type { ExportedHandler } from "@cloudflare/workers-types";
import * as Schema from "effect/Schema";

const Target = Schema.Struct({
  provider: Schema.Literals(["fcm", "oppo"]),
  token: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
});
const Send = Schema.Struct({
  targets: Schema.Array(Target).check(Schema.isMaxLength(100)),
  message: Schema.Struct({
    title: Schema.String,
    body: Schema.String,
    environmentId: Schema.NonEmptyString,
    threadId: Schema.NonEmptyString,
    collapseKey: Schema.NonEmptyString,
    urgent: Schema.Boolean,
  }),
});
const ServiceAccount = Schema.Struct({
  project_id: Schema.NonEmptyString,
  client_email: Schema.NonEmptyString,
  private_key: Schema.NonEmptyString,
});
const AccessToken = Schema.Struct({
  access_token: Schema.NonEmptyString,
  expires_in: Schema.Number,
});
const FcmError = Schema.Struct({
  error: Schema.Struct({
    status: Schema.optional(Schema.String),
    details: Schema.optional(
      Schema.Array(
        Schema.Struct({
          "@type": Schema.optional(Schema.String),
          errorCode: Schema.optional(Schema.String),
        }),
      ),
    ),
  }),
});
const OppoResponse = Schema.Struct({
  code: Schema.Number,
  data: Schema.optional(Schema.Struct({ auth_token: Schema.optional(Schema.String) })),
});
const decodeSend = Schema.decodeUnknownSync(Send);
const decodeAccount = Schema.decodeSync(Schema.fromJsonString(ServiceAccount));
const decodeAccessToken = Schema.decodeUnknownSync(AccessToken);
const decodeFcmError = Schema.decodeUnknownSync(FcmError);
const decodeOppo = Schema.decodeUnknownSync(OppoResponse);

type Secrets = {
  RELAY_SECRET: string;
  FCM_SERVICE_ACCOUNT?: string;
  OPPO_APP_KEY?: string;
  OPPO_MASTER_SECRET?: string;
};
type Message = typeof Send.Type.message;
type PushTarget = typeof Target.Type;

// OPPO's message definition uses snake_case; its unicast example uses camelCase.
const OPPO_FIELDS = {
  messageId: "app_message_id",
  clickType: "click_action_type",
  clickUrl: "click_action_url",
  notificationId: "notify_id",
} as const;
const encoder = new TextEncoder();
let fcmCache: { account: string; token: string; expiresAt: number } | undefined;

function truncate(text: string, limit: number) {
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit - 1).join("")}…` : text;
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function authorized(request: Request, secret: string) {
  if (!secret) return false;
  const supplied = request.headers.get("Authorization") ?? "";
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${secret}`)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  return crypto.subtle.timingSafeEqual(expected, actual);
}

async function fcmToken(accountJson: string, account: typeof ServiceAccount.Type) {
  if (fcmCache?.account === accountJson && fcmCache.expiresAt > Date.now()) return fcmCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----|\s/g, "")), (c) =>
      c.charCodeAt(0),
    ),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${claims}`),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("FCM authorization failed");
  const result = decodeAccessToken(await response.json());
  fcmCache = {
    account: accountJson,
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in - 60) * 1000,
  };
  return result.access_token;
}

async function sendFcm(target: PushTarget, message: Message, env: Secrets) {
  if (!env.FCM_SERVICE_ACCOUNT) throw new Error("FCM is not configured");
  const account = decodeAccount(env.FCM_SERVICE_ACCOUNT);
  const accessToken = await fcmToken(env.FCM_SERVICE_ACCOUNT, account);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: target.token,
          notification: { title: message.title, body: truncate(message.body, 500) },
          data: { environmentId: message.environmentId, threadId: message.threadId },
          android: { priority: "high", collapse_key: message.collapseKey },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.ok) return { ok: true, invalidToken: false, code: "OK" };
  if (response.status === 401) fcmCache = undefined;
  const { error } = decodeFcmError(await response.json());
  const code =
    error.details?.find(
      (detail) => detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError",
    )?.errorCode ??
    error.status ??
    `HTTP_${response.status}`;
  return { ok: false, invalidToken: code === "UNREGISTERED" || code === "NOT_FOUND", code };
}

async function sendOppo(target: PushTarget, message: Message, env: Secrets) {
  if (!env.OPPO_APP_KEY || !env.OPPO_MASTER_SECRET) throw new Error("OPPO is not configured");
  const timestamp = String(Date.now());
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${env.OPPO_APP_KEY}${timestamp}${env.OPPO_MASTER_SECRET}`),
  );
  const sign = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const auth = await fetch("https://api.push.oppomobile.com/server/v1/auth", {
    method: "POST",
    body: new URLSearchParams({ app_key: env.OPPO_APP_KEY, timestamp, sign }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!auth.ok) throw new Error("OPPO authorization failed");
  const authorized = decodeOppo(await auth.json());
  if (authorized.code !== 0 || !authorized.data?.auth_token) {
    return { ok: false, invalidToken: false, code: `AUTH_${authorized.code}` };
  }
  // notify_id is an integer, unlike app_message_id; retain the question identity across escalation.
  const questionId = message.collapseKey.replace(/:(new|urgent)$/, "");
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(questionId));
  const notifyId = new DataView(hash).getUint32(0) & 0x7fffffff;
  const response = await fetch(
    "https://api.push.oppomobile.com/server/v1/message/notification/unicast",
    {
      method: "POST",
      body: new URLSearchParams({
        auth_token: authorized.data.auth_token,
        message: JSON.stringify({
          target_type: 2,
          target_value: target.token,
          notification: {
            style: 1,
            title: truncate(message.title, 50),
            content: truncate(message.body, 200),
            [OPPO_FIELDS.messageId]: message.collapseKey,
            [OPPO_FIELDS.clickType]: 5,
            [OPPO_FIELDS.clickUrl]: target.url,
            [OPPO_FIELDS.notificationId]: notifyId,
          },
        }),
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return { ok: false, invalidToken: false, code: `HTTP_${response.status}` };
  const result = decodeOppo(await response.json());
  return { ok: result.code === 0, invalidToken: false, code: String(result.code) };
}

export default {
  async fetch(request: Request, env: Secrets) {
    if (new URL(request.url).pathname !== "/send" || request.method !== "POST")
      return new Response(null, { status: 404 });
    if (!(await authorized(request, env.RELAY_SECRET))) return new Response(null, { status: 401 });
    let input: typeof Send.Type;
    try {
      input = decodeSend(await request.json());
    } catch {
      return Response.json({ error: "Invalid push request" }, { status: 400 });
    }
    const results = [];
    for (const [index, target] of input.targets.entries()) {
      try {
        const result = await (target.provider === "fcm"
          ? sendFcm(target, input.message, env)
          : sendOppo(target, input.message, env));
        results.push({ index, ...result });
      } catch {
        // Provider errors may contain credentials or device tokens; return only a fixed code.
        results.push({ index, ok: false, invalidToken: false, code: "PROVIDER_ERROR" });
      }
    }
    return Response.json({ results });
  },
} satisfies ExportedHandler<Secrets>;
