import { describe, expect, it } from "vite-plus/test";

import { MAX_INLINE_DIFF_LINES, renderableToolFileEdits } from "./toolCallDiffRendering";

describe("renderableToolFileEdits", () => {
  it("renders a provider patch", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: [
        {
          kind: "patch",
          path: "src/app.ts",
          unifiedDiff:
            "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n",
        },
      ],
      changedFiles: ["src/app.ts"],
    });
    expect(rendering.edits.map((edit) => edit.path)).toEqual(["src/app.ts"]);
    expect(rendering.edits[0]?.additions).toBe(1);
    expect(rendering.edits[0]?.deletions).toBe(1);
    expect(rendering.openOnlyPaths).toEqual([]);
  });

  it("renders a span and keeps its line anchor", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: [
        { kind: "span", path: "src/app.ts", oldText: "two", newText: "TWO", startLine: 2 },
      ],
      changedFiles: ["src/app.ts"],
    });
    expect(rendering.edits[0]?.startLine).toBe(2);
    expect(rendering.edits[0]?.kind).toBe("span");
  });

  it("renders a rewrite as additions", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: [{ kind: "rewrite", path: "src/new.ts", newText: "a\nb\nc\n" }],
      changedFiles: ["src/new.ts"],
    });
    expect(rendering.edits[0]?.kind).toBe("rewrite");
    expect(rendering.edits[0]?.deletions).toBe(0);
    expect(rendering.edits[0]?.additions).toBeGreaterThan(0);
  });

  it("keeps both spans of a multi-edit on one file under distinct keys", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: [
        { kind: "span", path: "src/app.ts", oldText: "a", newText: "A" },
        { kind: "span", path: "src/app.ts", oldText: "b", newText: "B" },
      ],
      changedFiles: ["src/app.ts"],
    });
    expect(rendering.edits.length).toBe(2);
    expect(new Set(rendering.edits.map((edit) => edit.key)).size).toBe(2);
    expect(rendering.openOnlyPaths).toEqual([]);
  });

  it("links to a file whose diff is too tall to inline", () => {
    const lines = Array.from({ length: MAX_INLINE_DIFF_LINES + 5 }, (_, i) => `line ${i}`).join(
      "\n",
    );
    const rendering = renderableToolFileEdits({
      fileEdits: [{ kind: "rewrite", path: "src/big.ts", newText: lines }],
      changedFiles: ["src/big.ts"],
    });
    expect(rendering.edits).toEqual([]);
    expect(rendering.openOnlyPaths).toEqual(["src/big.ts"]);
  });

  // An older server sends no edits at all. Every changed file must still be
  // reachable, which is what keeps this safe to run against a mixed fleet.
  it("links every changed file when the server sent no edits", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: undefined,
      changedFiles: ["src/a.ts", "src/b.ts"],
    });
    expect(rendering.edits).toEqual([]);
    expect(rendering.openOnlyPaths).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("links files the edits did not cover", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: [{ kind: "span", path: "src/a.ts", oldText: "x", newText: "y" }],
      changedFiles: ["src/a.ts", "src/b.ts"],
    });
    expect(rendering.edits.map((edit) => edit.path)).toEqual(["src/a.ts"]);
    expect(rendering.openOnlyPaths).toEqual(["src/b.ts"]);
  });

  it("links a file whose patch cannot be parsed", () => {
    const rendering = renderableToolFileEdits({
      fileEdits: [{ kind: "patch", path: "src/a.ts", unifiedDiff: "not a patch at all" }],
      changedFiles: ["src/a.ts"],
    });
    expect(rendering.edits).toEqual([]);
    expect(rendering.openOnlyPaths).toEqual(["src/a.ts"]);
  });
});
