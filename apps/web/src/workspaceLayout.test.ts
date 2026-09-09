import { describe, expect, it } from "vite-plus/test";

import { resolveWorkspaceLayout } from "./workspaceLayout";

describe("resolveWorkspaceLayout", () => {
  it("uses the setting when there is room for two columns", () => {
    expect(resolveWorkspaceLayout({ setting: "editor", compactLayout: false })).toBe("editor");
    expect(resolveWorkspaceLayout({ setting: "chat", compactLayout: false })).toBe("chat");
  });

  it("falls back to chat where the panel is already a modal sheet", () => {
    expect(resolveWorkspaceLayout({ setting: "editor", compactLayout: true })).toBe("chat");
  });
});
