import { i18n } from "@t3tools/shared/i18n";
import { beforeEach as beforeEachLocale, afterEach as afterEachLocale } from "vite-plus/test";

const initialLocale = i18n.locale;
beforeEachLocale(() => i18n.setLocale("en"));
afterEachLocale(() => i18n.setLocale(initialLocale));

import type { ServerConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveEnvironmentIconPickerLock } from "./EnvironmentIconPicker";

const config = (environmentIcon: boolean | undefined) =>
  ({
    environment: { capabilities: environmentIcon === undefined ? {} : { environmentIcon } },
  }) as unknown as ServerConfig;

describe("resolveEnvironmentIconPickerLock", () => {
  it("locks until the environment is connected", () => {
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: null, operateAccess: "granted" }),
    ).toMatch(/Connect/);
  });

  it("locks on servers that predate the setting, before looking at permissions", () => {
    expect(
      resolveEnvironmentIconPickerLock({
        serverConfig: config(undefined),
        operateAccess: "denied",
      }),
    ).toMatch(/too old/);
  });

  it("locks when the session cannot operate the environment", () => {
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config(true), operateAccess: "denied" }),
    ).toMatch(/cannot change/);
  });

  it("waits for a settings grant before allowing changes", () => {
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config(true), operateAccess: "pending" }),
    ).toMatch(/cannot change/);
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config(true), operateAccess: "granted" }),
    ).toBeNull();
  });
});
