/**
 * Integration test for KimiProvider status probing.
 *
 * This test exercises the real `kimi` binary on PATH to verify that
 * `checkKimiProviderStatus` correctly detects an installed Kimi Code CLI.
 */
import { describe, expect, it } from "@effect/vitest";
import { KimiSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { checkKimiProviderStatus } from "./KimiProvider.ts";

const enabledKimiSettings: KimiSettings = {
  enabled: true,
  binaryPath: "kimi",
  model: "",
  customModels: [],
};

const disabledKimiSettings: KimiSettings = {
  enabled: false,
  binaryPath: "kimi",
  model: "",
  customModels: [],
};

describe("KimiProviderLive", () => {
  it.live("detects installed Kimi Code CLI and reports ready", () =>
    Effect.gen(function* () {
      const draft = yield* checkKimiProviderStatus(enabledKimiSettings);
      expect(draft.enabled).toBe(true);
      expect(draft.installed).toBe(true);
      expect(draft.status).toBe("ready");
      expect(draft.version).not.toBeNull();
      expect(draft.message).toMatch(/Kimi Code .* is available/);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("returns disabled snapshot when kimi is disabled in settings", () =>
    Effect.gen(function* () {
      const draft = yield* checkKimiProviderStatus(disabledKimiSettings);
      expect(draft.enabled).toBe(false);
      expect(draft.installed).toBe(false);
      expect(draft.status).toBe("disabled");
      expect(draft.message).toBe("Kimi Code is disabled in T3 Code settings.");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("reports error when binary path points to a missing executable", () =>
    Effect.gen(function* () {
      const draft = yield* checkKimiProviderStatus({
        ...enabledKimiSettings,
        binaryPath: "kimi_binary_that_does_not_exist",
      });
      expect(draft.enabled).toBe(true);
      expect(draft.installed).toBe(false);
      expect(draft.status).toBe("error");
      expect(draft.message).toMatch(/not installed|not on PATH/i);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("is idempotent — repeated status checks yield the same result", () =>
    Effect.gen(function* () {
      const draft1 = yield* checkKimiProviderStatus(enabledKimiSettings);
      const draft2 = yield* checkKimiProviderStatus(enabledKimiSettings);
      expect(draft1.status).toBe(draft2.status);
      expect(draft1.installed).toBe(draft2.installed);
      expect(draft1.version).toBe(draft2.version);
      expect(draft1.message).toBe(draft2.message);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
