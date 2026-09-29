import { i18n } from "@t3tools/shared/i18n";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("~/components/ui/button", () => ({ Button: "button" }));

import { PreviewUnreachable } from "./PreviewUnreachable";

let renderer: ReactTestRenderer | undefined;
const originalLocale = i18n.locale;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  i18n.setLocale("en");
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  i18n.setLocale(originalLocale);
  vi.unstubAllGlobals();
});

it("updates an open error page and its controls when the language changes", async () => {
  const reload = vi.fn();
  await act(() => {
    renderer = create(
      <PreviewUnreachable
        url="https://example.test/private-path"
        code={-105}
        description="ERR_NAME_NOT_RESOLVED"
        onReload={reload}
      />,
    );
  });
  const button = (text: string) =>
    renderer!.root.findAllByType("button").find((node) => node.children.includes(text))!;
  await act(() => button("Details").props.onClick());
  expect(renderer!.root.findAllByType("li").map((node) => node.children.join(""))).toContain(
    "Checking your connection",
  );

  await act(() => i18n.setLocale("zh-CN"));
  expect(renderer!.root.findByType("h1").children.join("")).toBe("无法访问此网站");
  expect(renderer!.root.findAllByType("li").map((node) => node.children.join(""))).toContain(
    "检查网络连接",
  );
  expect(renderer!.root.findAllByType("span").map((node) => node.children.join(""))).toContain(
    "example.test",
  );
  expect(
    renderer!.root
      .findAllByType("div")
      .some((node) => node.children.includes("ERR_NAME_NOT_RESOLVED")),
  ).toBe(true);
  await act(() => button("重新加载").props.onClick());
  expect(reload).toHaveBeenCalledOnce();
});
