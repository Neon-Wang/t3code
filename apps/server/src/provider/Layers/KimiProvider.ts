import {
  ProviderDriverKind,
  type KimiSettings,
  type ModelCapabilities,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { createModelCapabilities } from "@t3tools/shared/model";
import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const PROVIDER = ProviderDriverKind.make("kimi");
const KIMI_PRESENTATION = {
  displayName: "Kimi Code",
  showInteractionModeToggle: false,
} as const;

const DEFAULT_KIMI_MODEL_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const DEFAULT_KIMI_MODELS: ServerProvider["models"] = [
  {
    slug: "kimi-for-coding",
    name: "Kimi-k2.6",
    isCustom: false,
    capabilities: DEFAULT_KIMI_MODEL_CAPABILITIES,
  },
];

function emptyKimiModelsFromSettings(kimiSettings: KimiSettings): ServerProvider["models"] {
  return providerModelsFromSettings(
    DEFAULT_KIMI_MODELS,
    PROVIDER,
    kimiSettings.customModels,
    DEFAULT_KIMI_MODEL_CAPABILITIES,
  );
}

export const makePendingKimiProvider = (
  kimiSettings: KimiSettings,
): Effect.Effect<ServerProviderDraft> =>
  Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = emptyKimiModelsFromSettings(kimiSettings);

    if (!kimiSettings.enabled) {
      return buildServerProvider({
        presentation: KIMI_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        skills: [],
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Kimi Code is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: KIMI_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Kimi Code provider status has not been checked in this session yet.",
      },
    });
  });

export const checkKimiProviderStatus = Effect.fn("checkKimiProviderStatus")(function* (
  kimiSettings: KimiSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const models = emptyKimiModelsFromSettings(kimiSettings);

  if (!kimiSettings.enabled) {
    return buildServerProvider({
      presentation: KIMI_PRESENTATION,
      enabled: false,
      checkedAt,
      models,
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Kimi Code is disabled in T3 Code settings.",
      },
    });
  }

  const result = yield* Effect.exit(
    spawnAndCollect(
      kimiSettings.binaryPath,
      ChildProcess.make(kimiSettings.binaryPath, ["--version"], {
        env: environment,
      }),
    ).pipe(Effect.timeout("4 seconds")),
  );

  if (result._tag === "Failure") {
    const cause = result.cause;
    const squashed = Cause.squash(cause);
    const message =
      squashed instanceof Error &&
      (isCommandMissingCause(squashed) || squashed.message.toLowerCase().includes("enoent"))
        ? "Kimi Code CLI (`kimi`) is not installed or not on PATH."
        : `Failed to check Kimi Code version: ${squashed instanceof Error ? squashed.message : String(squashed)}`;

    return buildServerProvider({
      presentation: KIMI_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message,
      },
    });
  }

  const version = parseGenericCliVersion(result.value.stdout) ?? null;

  return buildServerProvider({
    presentation: KIMI_PRESENTATION,
    enabled: true,
    checkedAt,
    models,
    skills: [],
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "unknown" },
      message: version
        ? `Kimi Code ${version} is available.`
        : "Kimi Code is available (version unknown).",
    },
  });
});
