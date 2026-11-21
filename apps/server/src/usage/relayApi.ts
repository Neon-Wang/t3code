import {
  ForwardCompatibleArray,
  UsageLimitSourceAccount,
  UsageLimitSourceError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";

interface Relay {
  readonly url: string;
  readonly readToken: string;
}

const RelayAccount = Schema.Struct({
  ...UsageLimitSourceAccount.fields,
  disabled: Schema.optional(Schema.Boolean),
});
const decodeAccounts = Schema.decodeUnknownEffect(
  Schema.Struct({ accounts: ForwardCompatibleArray(RelayAccount) }),
);
const decodeAccount = Schema.decodeUnknownEffect(RelayAccount);
const unexpectedResponse = () =>
  new UsageLimitSourceError({ detail: "The relay returned an unexpected response." });

function describeFailure(error: unknown): string {
  if (HttpClientError.isHttpClientError(error) && error.reason._tag === "StatusCodeError") {
    const status = error.reason.response.status;
    if (status === 401) return "The relay rejected the read token.";
    if (status === 429) return "The relay is rate limiting requests.";
    return `The relay returned HTTP ${status}.`;
  }
  return "Could not reach the relay.";
}

export const makeRelayApi = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const request = Effect.fn("RelayApi.request")(
    function* (relay: Relay, path: string, method: "GET" | "POST") {
      const url = yield* Effect.try({
        try: () => {
          const base = new URL(relay.url);
          base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
          return new URL(`v1/accounts${path}`, base).toString();
        },
        catch: () => new UsageLimitSourceError({ detail: "The relay URL is not valid." }),
      });
      const response = yield* client
        .execute(
          HttpClientRequest.make(method)(url).pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${relay.readToken}`),
          ),
        )
        .pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.mapError((error) => new UsageLimitSourceError({ detail: describeFailure(error) })),
        );
      return yield* response.json.pipe(Effect.mapError(unexpectedResponse));
    },
    Effect.timeoutOrElse({
      duration: "15 seconds",
      orElse: () =>
        Effect.fail(new UsageLimitSourceError({ detail: "Could not reach the relay." })),
    }),
  );

  const readAccounts = Effect.fn("RelayApi.readAccounts")(function* (relay: Relay) {
    const response = yield* request(relay, "", "GET");
    const { accounts } = yield* decodeAccounts(response).pipe(Effect.mapError(unexpectedResponse));
    return accounts.flatMap(({ disabled, ...account }) => (disabled ? [] : [account]));
  });

  const refreshAccount = Effect.fn("RelayApi.refreshAccount")(function* (
    relay: Relay,
    accountId: string,
  ) {
    const response = yield* request(relay, `/${encodeURIComponent(accountId)}/refresh`, "POST");
    const { disabled, ...account } = yield* decodeAccount(response).pipe(
      Effect.mapError(unexpectedResponse),
    );
    return disabled ? undefined : account;
  });

  return { readAccounts, refreshAccount };
});
