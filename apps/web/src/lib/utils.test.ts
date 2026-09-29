import { i18n } from "@t3tools/shared/i18n";
import { beforeAll, afterAll, describe, assert, it } from "vite-plus/test";
import { getLocalFileManagerName, isWindowsPlatform } from "./utils";

describe("getLocalFileManagerName", () => {
  it.each([
    ["MacIntel", "Finder"],
    ["Win32", "File Explorer"],
    ["Linux", "Files"],
  ])("uses the %s file manager name", (platform, expected) => {
    assert.strictEqual(getLocalFileManagerName(platform), expected);
  });
});

describe("isWindowsPlatform", () => {
  it("matches Windows platform identifiers", () => {
    assert.isTrue(isWindowsPlatform("Win32"));
    assert.isTrue(isWindowsPlatform("Windows"));
    assert.isTrue(isWindowsPlatform("windows_nt"));
  });

  it("does not match darwin", () => {
    assert.isFalse(isWindowsPlatform("darwin"));
  });
});

const originalLocale = i18n.locale;
beforeAll(() => i18n.setLocale("en"));
afterAll(() => i18n.setLocale(originalLocale));
