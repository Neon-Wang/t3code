import { i18n } from "@t3tools/shared/i18n";
import type { ServerConfig } from "@t3tools/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

// Assertions read the English catalog; the app default is zh-CN.
beforeAll(() => i18n.setLocale("en"));
afterAll(() => i18n.setLocale("zh-CN"));

import { resolveEnvironmentIconPickerLock } from "./EnvironmentIconPicker";

const config = { environment: { capabilities: {} } } as unknown as ServerConfig;

describe("resolveEnvironmentIconPickerLock", () => {
  it("waits for a settings grant before allowing changes", () => {
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config, operateAccess: "pending" }),
    ).toMatch(/cannot change/);
    expect(
      resolveEnvironmentIconPickerLock({ serverConfig: config, operateAccess: "granted" }),
    ).toBeNull();
  });
});
