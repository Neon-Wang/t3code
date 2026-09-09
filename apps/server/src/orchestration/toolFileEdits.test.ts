import { describe, expect, it } from "vite-plus/test";

import { projectToolFileEdits } from "./toolFileEdits.ts";

/**
 * One case per adapter dialect. These are the payload shapes each adapter
 * actually persists, so a regression here silently removes the inline diff for
 * that provider without failing anywhere a reader would notice.
 */
describe("projectToolFileEdits", () => {
  it("reads a Claude edit as a search-and-replace span with no line anchor", () => {
    expect(
      projectToolFileEdits({
        toolName: "Edit",
        input: {
          replace_all: false,
          file_path: "/Users/dev/project/src/app.ts",
          old_string: "const a = 1;",
          new_string: "const a = 2;",
        },
        result: { type: "tool_result", content: "The file has been updated successfully." },
      }),
    ).toEqual([
      {
        kind: "span",
        path: "/Users/dev/project/src/app.ts",
        oldText: "const a = 1;",
        newText: "const a = 2;",
      },
    ]);
  });

  it("reads a Claude write as a rewrite rather than faking an all-additions diff", () => {
    expect(
      projectToolFileEdits({
        toolName: "Write",
        input: { file_path: "src/new.ts", content: "export const x = 1;\n" },
      }),
    ).toEqual([{ kind: "rewrite", path: "src/new.ts", newText: "export const x = 1;\n" }]);
  });

  it("keeps every span of a Claude multi-edit on the same file", () => {
    expect(
      projectToolFileEdits({
        toolName: "MultiEdit",
        input: {
          file_path: "src/app.ts",
          edits: [
            { old_string: "a", new_string: "A" },
            { old_string: "b", new_string: "B" },
          ],
        },
      }),
    ).toEqual([
      { kind: "span", path: "src/app.ts", oldText: "a", newText: "A" },
      { kind: "span", path: "src/app.ts", oldText: "b", newText: "B" },
    ]);
  });

  it("passes a Codex per-file unified diff through untouched", () => {
    expect(
      projectToolFileEdits({
        item: {
          type: "fileChange",
          changes: [
            { path: "src/app.ts", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b\n" },
          ],
        },
      }),
    ).toEqual([{ kind: "patch", path: "src/app.ts", unifiedDiff: "@@ -1 +1 @@\n-a\n+b\n" }]);
  });

  it("reads an OpenCode edit input", () => {
    expect(
      projectToolFileEdits({
        tool: "edit",
        state: { input: { filePath: "src/app.ts", oldString: "a", newString: "b" } },
        input: { filePath: "src/app.ts", oldString: "a", newString: "b" },
      }),
    ).toEqual([{ kind: "span", path: "src/app.ts", oldText: "a", newText: "b" }]);
  });

  // Cursor, Grok, Antigravity and omp all report through the shared ACP runtime
  // model, which is the only dialect that hands over whole before/after files —
  // so it is the only one that yields a real line number.
  it("narrows an ACP whole-file diff to the changed lines and anchors it", () => {
    expect(
      projectToolFileEdits({
        toolCallId: "call-1",
        kind: "edit",
        content: [
          {
            type: "diff",
            path: "src/app.ts",
            oldText: "one\ntwo\nthree\n",
            newText: "one\nTWO\nthree\n",
          },
        ],
        locations: [{ path: "src/app.ts", line: 2 }],
      }),
    ).toEqual([{ kind: "span", path: "src/app.ts", oldText: "two", newText: "TWO", startLine: 2 }]);
  });

  it("prefers an omp ACP diff over the same edit restated under rawInput", () => {
    const edits = projectToolFileEdits({
      toolCallId: "omp-1",
      kind: "edit",
      content: [
        {
          type: "diff",
          path: "scripts/build.py",
          oldText: "print(1)\nkeep()\n",
          newText: "print(2)\nkeep()\n",
        },
      ],
      rawInput: { file_path: "scripts/build.py", old_string: "print(1)", new_string: "print(2)" },
    });
    expect(edits).toEqual([
      {
        kind: "span",
        path: "scripts/build.py",
        oldText: "print(1)",
        newText: "print(2)",
        startLine: 1,
      },
    ]);
  });

  it("falls back to an omp rawInput edit when the agent sent no diff content", () => {
    expect(
      projectToolFileEdits({
        toolCallId: "omp-2",
        kind: "edit",
        rawInput: { file_path: "scripts/build.py", old_string: "x", new_string: "y" },
      }),
    ).toEqual([{ kind: "span", path: "scripts/build.py", oldText: "x", newText: "y" }]);
  });

  it("drops an Antigravity diff the provider already tail-truncated", () => {
    expect(
      projectToolFileEdits({
        toolCallId: "ag-1",
        kind: "edit",
        content: [
          {
            type: "diff",
            path: "src/app.ts",
            oldText: "[Earlier output truncated]\n\nold tail",
            newText: "[Earlier output truncated]\n\nnew tail",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("drops a path that escapes its workspace", () => {
    expect(
      projectToolFileEdits({
        toolName: "Edit",
        input: { file_path: "../../../etc/passwd", old_string: "a", new_string: "b" },
      }),
    ).toEqual([]);
  });

  it("drops an edit larger than the per-edit budget instead of clipping it", () => {
    const huge = "x".repeat(3_000);
    expect(
      projectToolFileEdits({
        toolName: "Write",
        input: { file_path: "src/generated.ts", content: huge },
      }),
    ).toEqual([]);
  });

  it("stops at the per-activity file budget", () => {
    const edits = projectToolFileEdits({
      item: {
        type: "fileChange",
        changes: Array.from({ length: 10 }, (_, index) => ({
          path: `src/f${index}.ts`,
          kind: { type: "update" },
          diff: "@@ -1 +1 @@\n-a\n+b\n",
        })),
      },
    });
    expect(edits.length).toBe(4);
  });

  it("reports nothing for a shell command", () => {
    expect(
      projectToolFileEdits({ toolName: "Bash", input: { command: "sed -i '' s/a/b/ src/app.ts" } }),
    ).toEqual([]);
  });
});
