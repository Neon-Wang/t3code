import {
  ORCHESTRATION_PROTOCOL_VERSION,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { makeWindow } from "@t3tools/shared/usageFormat";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { RpcClient, RpcSerialization } from "effect/rpc";
import * as Socket from "effect/socket/Socket";
import { expect, it } from "@effect/vitest";

// A one-use RPC URL for a running development server with real parent and child usage.
const url = process.env.T3CODE_LIVE_USAGE_WS_URL;
it.live.skipIf(!url)(
  "reconciles a completed window and a scoped parent query on a live server",
  () => {
    const { sinceDay, timeZone } = makeWindow(30);
    const { sinceDay: yesterday } = makeWindow(2);
    const input = { sinceDay, timeZone, untilDay: yesterday, awaitRefresh: true };
    const socketUrl = new URL(url!);
    socketUrl.searchParams.set(
      ORCHESTRATION_PROTOCOL_QUERY_PARAM,
      String(ORCHESTRATION_PROTOCOL_VERSION),
    );
    const protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
      Layer.provide(
        Socket.layerWebSocket(socketUrl.toString()).pipe(
          Layer.provide(Socket.layerWebSocketConstructorGlobal),
        ),
      ),
      Layer.provide(RpcSerialization.layerJson),
    );
    return Effect.gen(function* () {
      const client = yield* RpcClient.make(WsRpcGroup);
      const all = yield* client[WS_METHODS.serverGetUsageSummary]({
        ...input,
        threadBreakdown: {},
      });
      const rows = all.threadCosts!;
      expect(rows.length).toBeGreaterThan(0);
      const tokens = all.buckets.reduce(
        (n, { totals: t }) =>
          n + t.cachedInputTokens + t.uncachedInputTokens + t.outputTokens + t.cacheCreationTokens,
        0,
      );
      expect(rows.reduce((n, r) => n + r.tokens, 0)).toBe(tokens);
      expect(rows.reduce((n, r) => n + r.costUsd, 0)).toBeCloseTo(
        all.buckets.reduce((n, b) => n + b.costUsd, 0),
        6,
      );
      const parent = rows.find((r) => r.lineage.length > 1)?.lineage[0]?.id;
      expect(parent).toBeDefined();
      const detail = yield* client[WS_METHODS.serverGetUsageSummary]({
        ...input,
        threadBreakdown: { threadId: parent! },
      });
      expect(detail.threadCosts).toEqual(
        rows.filter((r) => r.lineage.some((t) => t.id === parent)),
      );
    }).pipe(Effect.provide(protocol));
  },
);
