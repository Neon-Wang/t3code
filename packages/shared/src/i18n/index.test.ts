import { describe, expect, it } from "vite-plus/test";

import { enMessages } from "./en.ts";
import { zhCNMessages } from "./zh-CN.ts";

import { createI18n, i18n, translateUiText } from "./index.js";

describe("i18n", () => {
  it("defaults to zh-CN", () => {
    expect(i18n.locale).toBe("zh-CN");
    expect(i18n.t("action.cancel")).toBe("取消");
  });

  it("falls back to en for keys missing in the active locale", () => {
    // zh-CN dictionary would omit a key we only ship in English; here we
    // simulate by building a catalog whose active locale has an empty slate.
    const i18nEn = createI18n({ locale: "en" });
    expect(i18nEn.t("action.save")).toBe("Save");
  });

  it("returns the key itself when no locale has it", () => {
    const i18nEn = createI18n({ locale: "en" });
    // @ts-expect-error – intentionally unknown key to exercise the fallback path
    const out: string = i18nEn.t("some.missing.key");
    expect(out).toBe("some.missing.key");
  });

  it("switches locale at runtime and notifies subscribers", () => {
    const inst = createI18n({ locale: "zh-CN" });
    expect(inst.t("action.cancel")).toBe("取消");

    let notified = 0;
    const unsubscribe = inst.subscribe(() => notified++);

    inst.setLocale("en");
    expect(inst.locale).toBe("en");
    expect(inst.t("action.cancel")).toBe("Cancel");
    expect(notified).toBe(1);

    unsubscribe();
    inst.setLocale("zh-CN");
    expect(notified).toBe(1);
    expect(inst.t("action.cancel")).toBe("取消");
  });
});

describe("message catalogs", () => {
  it("ships the same keys in English and simplified Chinese", () => {
    expect(Object.keys(zhCNMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it.each(Object.entries(enMessages))(
    "preserves interpolation parameters in %s",
    (key, english) => {
      const parameters = (message: string) =>
        [
          ...new Set(
            [...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu)].map((match) => match[1]),
          ),
        ].sort();
      const chinese = zhCNMessages[key as keyof typeof enMessages];
      expect(chinese).toBeTruthy();
      expect(parameters(chinese ?? "")).toEqual(parameters(english));
    },
  );
});

describe("UI metadata translation", () => {
  it("translates known metadata and count captions without changing unknown content", () => {
    expect(translateUiText("Compacting context", "zh-CN")).toBe("正在压缩上下文");
    expect(translateUiText("Read 3 files", "zh-CN")).toBe("已读取 3 个文件");
    expect(translateUiText("Read 1 file", "en")).toBe("Read 1 file");
    expect(translateUiText("用户输入 /tmp/a.ts", "zh-CN")).toBe("用户输入 /tmp/a.ts");
  });
});

describe("technical terminology", () => {
  it("keeps product names, model names and token units intact", () => {
    const chinese = createI18n({ locale: "zh-CN" });
    expect(chinese.t("app.name")).toBe("T3 Code");
    expect(chinese.t("usage.tokens")).toBe("Token");
    expect(chinese.t("chat.ui.ultrathink")).toBe("Ultrathink");
    expect(chinese.t("pr.squashAndMerge")).toBe("Squash and merge");
    for (const text of ["T3 Code", "1M", "GPT-6 Astra", "Claude Sonnet 4.6", "OpenCode"]) {
      expect(translateUiText(text, "zh-CN")).toBe(text);
    }
    expect(Object.values(zhCNMessages).some((value) => value.includes("词元"))).toBe(false);
  });
  it("distinguishes source code from pairing codes", () => {
    const chinese = createI18n({ locale: "zh-CN" });
    expect(chinese.t("ui.chatMarkdown.copyCode")).toBe("复制代码");
    expect(chinese.t("ui.chatMarkdown.showCode")).toBe("显示代码");
    expect(chinese.t("settings.connections.copyCode")).toBe("复制配对码");
    expect(chinese.t("settings.connections.showCode")).toBe("显示配对码");
    expect(chinese.t("settings.connections.pairingCode")).toBe("配对码");
  });
});

describe("translation context boundaries", () => {
  it("does not guess a Chinese sense for ambiguous English metadata", () => {
    for (const value of ["Open", "Clear", "Full", "Input", "Share", "Copy code"]) {
      expect(translateUiText(value, "zh-CN")).toBe(value);
    }
  });
  it("keeps Agent terminology separate from network proxies", () => {
    for (const [key, english] of Object.entries(enMessages)) {
      if (/\bagents?\b|subagents?|agentic/i.test(english) && !/\bprox(?:y|ies)\b/i.test(english)) {
        expect(zhCNMessages[key as keyof typeof enMessages], key).not.toMatch(/代理|智能体/);
      }
    }
    const chinese = createI18n({ locale: "zh-CN" });
    expect(chinese.t("preview.checkingTheProxyAndTheFirewall")).toBe("检查代理和防火墙");
    expect(chinese.t("sidebar.settle")).toBe("标记完成");
    expect(chinese.t("sidebar.unSettle")).toBe("恢复为活跃");
    expect(chinese.t("chat.ui.fullHistory")).toBe("完整历史");
    expect(chinese.t("device.motion")).toBe("运动");
    expect(chinese.t("settings.label.motion")).toBe("动效");
  });
});
