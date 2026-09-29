import { createI18n, i18n } from "@t3tools/shared/i18n";
import { beforeAll, afterAll, describe, expect, it } from "vite-plus/test";
import {
  filterProjectIconNames,
  firstEmoji,
  projectIconColorClassName,
  getProjectEmojis,
  getProjectIconColors,
} from "./projectIconOptions";

describe("projectIconOptions", () => {
  it("translates display labels while keeping persisted emoji and color values", () => {
    const english = createI18n({ locale: "en" }).t;
    const chinese = createI18n({ locale: "zh-CN" }).t;
    expect(getProjectEmojis(english)[0]).toEqual({ emoji: "💻", label: "Computer" });
    expect(getProjectEmojis(chinese)[0]).toEqual({ emoji: "💻", label: "电脑" });
    const [englishColor] = getProjectIconColors(english);
    const [chineseColor] = getProjectIconColors(chinese);
    expect(englishColor?.label).toBe("Gray");
    expect(chineseColor).toEqual({ ...englishColor, label: "灰色" });
  });

  it("searches across the full Lucide set", () => {
    expect(filterProjectIconNames("alarm clock")).toContain("alarm-clock");
    expect(filterProjectIconNames("alarm  \tclock")).toContain("alarm-clock");
  });

  it("extracts one complete emoji grapheme", () => {
    expect(firstEmoji("  👩🏽‍💻 hello")).toBe("👩🏽‍💻");
    expect(firstEmoji("🇺🇸 project")).toBe("🇺🇸");
    expect(firstEmoji("1️⃣ project")).toBe("1️⃣");
    expect(firstEmoji("plain text")).toBeNull();
  });

  it("maps persisted colors to theme-aware classes", () => {
    expect(projectIconColorClassName("violet")).toBe("text-violet-600 dark:text-violet-400");
  });
});

const originalLocale = i18n.locale;
beforeAll(() => i18n.setLocale("en"));
afterAll(() => i18n.setLocale(originalLocale));
