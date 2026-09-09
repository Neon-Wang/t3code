import { describe, expect, it } from "vite-plus/test";

import { collectToolPaths, deriveToolActivityPresentation } from "./toolActivity.ts";

describe("toolActivity", () => {
  it("normalizes command tools to a stable ran-command label", () => {
    expect(
      deriveToolActivityPresentation({
        itemType: "command_execution",
        title: "Terminal",
        detail: "Terminal",
        data: {
          command: "bun run lint",
        },
        fallbackSummary: "Terminal",
      }),
    ).toEqual({
      summary: "Ran command",
      detail: "bun run lint",
    });
  });

  it("uses structured file paths for read-file tools when available", () => {
    expect(
      deriveToolActivityPresentation({
        itemType: "dynamic_tool_call",
        title: "Read File",
        detail: "Read File",
        data: {
          kind: "read",
          locations: [{ path: "/tmp/app.ts" }],
        },
        fallbackSummary: "Read File",
      }),
    ).toEqual({
      summary: "Read file",
      detail: "/tmp/app.ts",
    });
  });

  it("drops duplicated generic read-file detail when no path is available", () => {
    expect(
      deriveToolActivityPresentation({
        itemType: "dynamic_tool_call",
        title: "Read File",
        detail: "Read File",
        data: {
          kind: "read",
          rawInput: {},
        },
        fallbackSummary: "Read File",
      }),
    ).toEqual({
      summary: "Read file",
    });
  });
});

describe("collectToolPaths", () => {
  // One case per adapter dialect. These payload shapes are what each adapter
  // actually persists, so a regression here silently empties the changed-file
  // list for that provider rather than failing anywhere visible.
  it("finds Claude's snake_case tool input path", () => {
    expect(
      collectToolPaths({
        toolName: "Edit",
        input: {
          file_path: "/Users/dev/project/src/app.ts",
          old_string: "a",
          new_string: "b",
          replace_all: false,
        },
      }),
    ).toEqual(["/Users/dev/project/src/app.ts"]);
  });

  it("finds Claude's notebook path", () => {
    expect(
      collectToolPaths({ toolName: "NotebookEdit", input: { notebook_path: "notes/run.ipynb" } }),
    ).toEqual(["notes/run.ipynb"]);
  });

  it("finds Codex per-file change paths including a rename target", () => {
    expect(
      collectToolPaths({
        item: {
          type: "fileChange",
          changes: [
            { path: "src/a.ts", kind: { type: "update" }, diff: "@@" },
            { path: "src/old.ts", kind: { type: "update", move_path: "src/new.ts" }, diff: "@@" },
          ],
        },
      }),
    ).toEqual(["src/a.ts", "src/old.ts", "src/new.ts"]);
  });

  it("finds OpenCode's hoisted file-change input path", () => {
    expect(
      collectToolPaths({
        tool: "edit",
        state: { input: { filePath: "packages/x/index.ts" } },
        input: { filePath: "packages/x/index.ts" },
      }),
    ).toEqual(["packages/x/index.ts"]);
  });

  // Cursor, Grok, Antigravity and omp all report through the shared ACP runtime
  // model, so `locations` and `content` cover every one of them.
  it("finds ACP locations and diff content paths", () => {
    expect(
      collectToolPaths({
        toolCallId: "call-1",
        kind: "edit",
        locations: [{ path: "apps/web/src/App.tsx", line: 42 }],
        content: [{ type: "diff", path: "apps/web/src/App.tsx", oldText: "a", newText: "b" }],
        rawInput: { path: "apps/web/src/App.tsx" },
      }),
    ).toEqual(["apps/web/src/App.tsx"]);
  });

  it("finds an omp edit path reported only through rawInput", () => {
    expect(
      collectToolPaths({
        toolCallId: "omp-1",
        kind: "edit",
        rawInput: { file_path: "scripts/build.py", old_string: "x", new_string: "y" },
      }),
    ).toEqual(["scripts/build.py"]);
  });

  it("keeps extensionless paths that the presentation heuristic would drop", () => {
    expect(collectToolPaths({ input: { file_path: "Makefile" } })).toEqual(["Makefile"]);
    expect(
      collectToolPaths({ input: { file_path: "Makefile" } }, { requirePathLike: true }),
    ).toEqual([]);
  });

  it("reports nothing for a shell command that mutates files", () => {
    expect(
      collectToolPaths({ toolName: "Bash", input: { command: "sed -i '' s/a/b/ src/a.ts" } }),
    ).toEqual([]);
  });

  it("deduplicates and honours the limit", () => {
    const paths = collectToolPaths(
      { files: Array.from({ length: 20 }, (_, index) => ({ path: `src/f${index}.ts` })) },
      { limit: 3 },
    );
    expect(paths).toEqual(["src/f0.ts", "src/f1.ts", "src/f2.ts"]);
  });
});
