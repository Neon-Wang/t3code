import { act, useMemo } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@t3tools/shared/i18n";

import { useI18n } from "./useI18n";

let renderer: ReactTestRenderer | undefined;

function LocalizedAction() {
  const { t } = useI18n();
  // React Compiler caches translated labels with the same dependency.
  const label = useMemo(() => t("action.save"), [t]);
  return <button>{label}</button>;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  i18n.setLocale("en");
});

afterEach(() => {
  act(() => renderer?.unmount());
  i18n.setLocale("zh-CN");
  vi.unstubAllGlobals();
});

it("updates memoized labels in both directions without remounting", () => {
  act(() => {
    renderer = create(<LocalizedAction />);
  });
  expect(renderer!.root.findByType("button").children).toEqual(["Save"]);
  act(() => i18n.setLocale("zh-CN"));
  expect(renderer!.root.findByType("button").children).toEqual(["保存"]);
  act(() => i18n.setLocale("en"));
  expect(renderer!.root.findByType("button").children).toEqual(["Save"]);
});
