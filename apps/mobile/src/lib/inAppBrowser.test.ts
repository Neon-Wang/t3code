import { describe, expect, it, vi } from "vite-plus/test";
import { browserDownloadName, openInAppBrowser, registerInAppBrowser } from "./inAppBrowser";

describe("in-app browser", () => {
  it("keeps signed links intact and refuses executable/custom schemes", () => {
    const present = vi.fn();
    const unregister = registerInAppBrowser(present);
    try {
      const url = "http://100.93.86.54:9000/download?ticket=a%2Fb#section";
      openInAppBrowser(url);
      expect(present).toHaveBeenCalledWith({ url });
      for (const unsupported of [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "intent://example",
        "t3code://settings",
      ]) {
        expect(() => openInAppBrowser(unsupported)).toThrow("Unsupported");
      }
      expect(present).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
  it("does not silently fall back to an external browser without a host", () => {
    expect(() => openInAppBrowser("https://example.com")).toThrow("not ready");
  });
  it.each([
    ["attachment; filename=legacy.zip; filename*=UTF-8''%E4%B8%AD%E6%96%87.zip", "中文.zip"],
    ['attachment; filename="report final.pdf"', "report final.pdf"],
    ["attachment; filename*=UTF-8''%XX; filename=fallback.apk", "fallback.apk"],
    [null, "file.zip"],
  ])("uses response filenames for %s", (header, expected) => {
    expect(browserDownloadName("https://example.com/file.zip?ticket=secret", header)).toBe(
      expected,
    );
  });
  it("uses a safe fallback for extensionless/root URLs", () => {
    expect(browserDownloadName("https://example.com/", null)).toBe("download");
  });
});
