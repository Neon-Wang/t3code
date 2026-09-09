import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { latestAgentFileEdit, shouldFollowAgentFileEdit } from "./agentFileFollow";

const WORKSPACE_ROOT = "/Users/dev/project";

function activity(input: {
  id: string;
  kind?: string;
  itemType?: string;
  data?: Record<string, unknown>;
}): OrchestrationThreadActivity {
  return {
    id: input.id,
    tone: "tool",
    kind: input.kind ?? "tool.completed",
    summary: "Tool",
    payload: { itemType: input.itemType ?? "file_change", data: input.data ?? {} },
    turnId: null,
    createdAt: "2026-08-01T10:00:00.000Z",
  } as unknown as OrchestrationThreadActivity;
}

describe("latestAgentFileEdit", () => {
  it("takes the newest completed edit and its line", () => {
    const edit = latestAgentFileEdit(
      [
        activity({ id: "a", data: { files: [{ path: "src/old.ts" }] } }),
        activity({
          id: "b",
          data: {
            files: [{ path: "/Users/dev/project/src/app.ts" }],
            edits: [
              {
                kind: "span",
                path: "/Users/dev/project/src/app.ts",
                oldText: "x",
                newText: "y",
                startLine: 12,
              },
            ],
          },
        }),
      ],
      WORKSPACE_ROOT,
    );
    expect(edit).toEqual({ activityId: "b", relativePath: "src/app.ts", line: 12 });
  });

  it("falls back to the reported path when the server sent no edits", () => {
    expect(
      latestAgentFileEdit(
        [activity({ id: "a", data: { files: [{ path: "src/app.ts" }] } })],
        WORKSPACE_ROOT,
      ),
    ).toEqual({ activityId: "a", relativePath: "src/app.ts" });
  });

  it("ignores in-flight tool calls", () => {
    expect(
      latestAgentFileEdit(
        [activity({ id: "a", kind: "tool.updated", data: { files: [{ path: "src/app.ts" }] } })],
        WORKSPACE_ROOT,
      ),
    ).toBeNull();
  });

  it("ignores tool calls that are not file changes", () => {
    expect(
      latestAgentFileEdit(
        [activity({ id: "a", itemType: "command_execution", data: { command: "ls" } })],
        WORKSPACE_ROOT,
      ),
    ).toBeNull();
  });

  // `projects.readFile` serves absolute host paths on purpose, so a path the
  // agent reported must never become an automatic read.
  it("refuses a path outside the workspace", () => {
    expect(
      latestAgentFileEdit(
        [activity({ id: "a", data: { files: [{ path: "/etc/passwd" }] } })],
        WORKSPACE_ROOT,
      ),
    ).toBeNull();
    expect(
      latestAgentFileEdit(
        [activity({ id: "a", data: { files: [{ path: "../secrets.env" }] } })],
        WORKSPACE_ROOT,
      ),
    ).toBeNull();
  });
});

describe("shouldFollowAgentFileEdit", () => {
  const edit = { activityId: "edit-1", relativePath: "src/app.ts" } as const;
  const base = {
    enabled: true,
    edit,
    lastFollowedActivityId: null,
    compactLayout: false,
    documentVisible: true,
    openFileDirty: false,
  };

  it("follows a new edit", () => {
    expect(shouldFollowAgentFileEdit(base)).toBe(true);
  });

  it("follows each edit once", () => {
    expect(shouldFollowAgentFileEdit({ ...base, lastFollowedActivityId: "edit-1" })).toBe(false);
  });

  it("does nothing when off, hidden, compact, or over unsaved work", () => {
    expect(shouldFollowAgentFileEdit({ ...base, enabled: false })).toBe(false);
    expect(shouldFollowAgentFileEdit({ ...base, documentVisible: false })).toBe(false);
    expect(shouldFollowAgentFileEdit({ ...base, compactLayout: true })).toBe(false);
    expect(shouldFollowAgentFileEdit({ ...base, openFileDirty: true })).toBe(false);
  });

  it("does nothing without an edit", () => {
    expect(shouldFollowAgentFileEdit({ ...base, edit: null })).toBe(false);
  });
});
