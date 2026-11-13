import { ServerSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { i18n } from "@t3tools/shared/i18n";

import { secretProviderUses } from "./SecretsSettings.logic";

beforeAll(() => i18n.setLocale("en"));
afterAll(() => i18n.setLocale("zh-CN"));

const personal = (reference: string) => ({ provider: "personal", reference });
const work = { provider: "work", reference: "op://Work/token" };

const settings = Schema.decodeSync(ServerSettings)({
  providerInstances: {
    antigravity_work: {
      driver: "antigravity",
      displayName: "Antigravity Work",
      environment: [
        { name: "API_TOKEN", value: "", secret: personal("op://a/env") },
        { name: "OTHER_TOKEN", value: "", secret: work },
      ],
    },
    codex_plain: {
      driver: "codex",
      environment: [{ name: "CODEX_TOKEN", value: "", secret: personal("op://c/env") }],
    },
  },
  sourceControlHosts: {
    github: { tokens: { "github.com": personal("op://gh"), "ghe.acme.test": work } },
  },
  usageLimitSources: {
    hub: { kind: "cliproxy", url: "https://hub.test", managementKey: personal("op://hub") },
  },
  easDeviceHosts: [
    { kind: "eas", id: "eas", label: "EAS Simulator", accessToken: personal("op://expo") },
  ],
  simlockDeviceHosts: [
    {
      kind: "simlock",
      id: "pool",
      label: "Simlock Pool",
      gatewayUrl: "https://simlock.test",
      agentToken: personal("op://simlock"),
    },
  ],
  cloudSpeechCredentials: { openai: personal("op://voice"), xai: "" },
});

it.each([
  [
    "personal",
    [
      "Antigravity Work · API_TOKEN",
      "Codex · CODEX_TOKEN",
      "GitHub · github.com",
      "https://hub.test · Management Key",
      "EAS Simulator · Access Token",
      "Simlock Pool · Agent Token",
      "Voice · OpenAI",
    ],
  ],
  ["work", ["Antigravity Work · OTHER_TOKEN", "GitHub · ghe.acme.test"]],
  ["unused", []],
])("lists what reads from secret provider %s", (providerId, uses) => {
  expect(secretProviderUses(settings, providerId).map((use) => use.label)).toEqual(uses);
});
