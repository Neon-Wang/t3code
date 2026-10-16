import { i18n } from "@t3tools/shared/i18n";
import { beforeEach as beforeEachLocale } from "vite-plus/test";

beforeEachLocale(() => i18n.setLocale("en"));

import { describe, expect, it } from "vite-plus/test";
import { resolveRenameCommit } from "./ChatHeader";

describe("resolveRenameCommit", () => {
  it("commits a trimmed changed title", () => {
    expect(resolveRenameCommit({ title: "  New title ", originalTitle: "Old" })).toEqual({
      action: "commit",
      title: "New title",
    });
  });

  it("rejects empty and whitespace-only titles", () => {
    expect(resolveRenameCommit({ title: "   ", originalTitle: "Old" })).toEqual({
      action: "reject-empty",
    });
  });

  it("no-ops when the trimmed title is unchanged", () => {
    expect(resolveRenameCommit({ title: " Old ", originalTitle: "Old" })).toEqual({
      action: "noop",
    });
  });
});
