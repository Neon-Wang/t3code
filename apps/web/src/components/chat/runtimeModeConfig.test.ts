import { describe, expect, it } from "vite-plus/test";
import { createI18n } from "@t3tools/shared/i18n";
import { getRuntimeModeConfig } from "./runtimeModeConfig";

describe("runtime mode presentation", () => {
  it("resolves labels per caller locale while preserving mode identities and icons", () => {
    const english = getRuntimeModeConfig(createI18n({ locale: "en" }).t);
    const chinese = getRuntimeModeConfig(createI18n({ locale: "zh-CN" }).t);
    expect(chinese["approval-required"].label).toBe("需审批");
    expect(english["approval-required"].label).toBe("Supervised");
    expect(chinese["full-access"].description).toBe("允许执行命令和编辑，无需询问。");
    expect(chinese["full-access"].icon).toBe(english["full-access"].icon);
    expect(getRuntimeModeConfig(createI18n({ locale: "en" }).t)["approval-required"].label).toBe(
      "Supervised",
    );
  });
});
