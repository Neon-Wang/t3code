import { describe, expect, it } from "vite-plus/test";

import { toolFileEditPatch } from "./toolFileEditPatch";

describe("toolFileEditPatch", () => {
  it("adds the file header Codex hunks omit", () => {
    const patch = toolFileEditPatch({
      kind: "patch",
      path: "src/app.ts",
      unifiedDiff: "@@ -1 +1 @@\n-a\n+b\n",
    });
    expect(patch.startsWith("diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts")).toBe(true);
    expect(patch).toContain("@@ -1 +1 @@");
  });

  it("leaves a full patch alone", () => {
    const diff = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n";
    expect(toolFileEditPatch({ kind: "patch", path: "x", unifiedDiff: diff })).toBe(diff.trim());
  });

  it("builds a patch from a span", () => {
    const patch = toolFileEditPatch({
      kind: "span",
      path: "src/app.ts",
      oldText: "const a = 1;",
      newText: "const a = 2;",
    });
    expect(patch).toContain("diff --git a/src/app.ts b/src/app.ts");
    expect(patch).toContain("-const a = 1;");
    expect(patch).toContain("+const a = 2;");
  });

  it("builds an additions-only patch from a rewrite", () => {
    const patch = toolFileEditPatch({ kind: "rewrite", path: "src/new.ts", newText: "a\nb\n" });
    expect(patch).toContain("+a");
    expect(patch).toContain("+b");
    // No deletion lines — only the `---` header may start with a dash.
    const deletionLines = patch
      .split("\n")
      .filter((line) => line.startsWith("-") && !line.startsWith("---"));
    expect(deletionLines).toEqual([]);
  });

  it("returns nothing when there is no change to show", () => {
    expect(toolFileEditPatch({ kind: "patch", path: "x", unifiedDiff: "   " })).toBe("");
    expect(toolFileEditPatch({ kind: "span", path: "x", oldText: "a", newText: "a" })).toBe("");
  });
});
