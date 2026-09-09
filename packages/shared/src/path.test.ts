import { describe, expect, it } from "vite-plus/test";
import {
  isExplicitRelativePath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
  normalizeProjectPathForComparison,
  normalizeProjectPathForDispatch,
  resolveWorkspaceRelativePath,
} from "./path.ts";

describe("path helpers", () => {
  it("detects windows drive paths", () => {
    expect(isWindowsDrivePath("C:\\repo")).toBe(true);
    expect(isWindowsDrivePath("D:/repo")).toBe(true);
    expect(isWindowsDrivePath("/repo")).toBe(false);
  });

  it("detects UNC paths", () => {
    expect(isUncPath("\\\\server\\share\\repo")).toBe(true);
    expect(isUncPath("C:\\repo")).toBe(false);
  });

  it("detects windows absolute paths", () => {
    expect(isWindowsAbsolutePath("C:\\repo")).toBe(true);
    expect(isWindowsAbsolutePath("\\\\server\\share\\repo")).toBe(true);
    expect(isWindowsAbsolutePath("./repo")).toBe(false);
  });

  it("detects explicit relative paths", () => {
    expect(isExplicitRelativePath(".")).toBe(true);
    expect(isExplicitRelativePath("..")).toBe(true);
    expect(isExplicitRelativePath("./repo")).toBe(true);
    expect(isExplicitRelativePath("..\\repo")).toBe(true);
    expect(isExplicitRelativePath("~/repo")).toBe(false);
  });

  it("normalizes a bare Windows drive root the same as one with a trailing separator", () => {
    // `C:`, `C:\` and `C:/` all refer to the drive root and must compare equal.
    expect(normalizeProjectPathForDispatch("C:")).toBe("C:\\");
    expect(normalizeProjectPathForComparison("C:")).toBe("c:\\");
    expect(normalizeProjectPathForComparison("C:")).toBe(normalizeProjectPathForComparison("C:\\"));
    expect(normalizeProjectPathForComparison("C:")).toBe(normalizeProjectPathForComparison("C:/"));
    // Non-root drive paths keep their trailing separator trimmed as before.
    expect(normalizeProjectPathForDispatch("C:\\repo\\")).toBe("C:\\repo");
  });
});

describe("resolveWorkspaceRelativePath", () => {
  const workspaceRoot = "/Users/dev/project";

  it("keeps a workspace-relative path", () => {
    expect(resolveWorkspaceRelativePath({ path: "src/app.ts", workspaceRoot })).toBe("src/app.ts");
  });

  // Claude reports the absolute path the model used, which is the shape
  // `resolveDiffPathForWorkspace` refuses.
  it("relativizes an absolute path inside the workspace", () => {
    expect(
      resolveWorkspaceRelativePath({ path: "/Users/dev/project/src/app.ts", workspaceRoot }),
    ).toBe("src/app.ts");
  });

  it("refuses an absolute path outside the workspace", () => {
    expect(
      resolveWorkspaceRelativePath({ path: "/Users/dev/other/x.ts", workspaceRoot }),
    ).toBeNull();
    expect(resolveWorkspaceRelativePath({ path: "/etc/passwd", workspaceRoot })).toBeNull();
  });

  it("refuses a traversal segment", () => {
    expect(resolveWorkspaceRelativePath({ path: "../secrets.env", workspaceRoot })).toBeNull();
    expect(
      resolveWorkspaceRelativePath({ path: "/Users/dev/project/../other/x", workspaceRoot }),
    ).toBeNull();
  });

  it("refuses the workspace root itself", () => {
    expect(resolveWorkspaceRelativePath({ path: workspaceRoot, workspaceRoot })).toBeNull();
  });

  it("refuses an absolute path when the workspace root is unknown", () => {
    expect(
      resolveWorkspaceRelativePath({
        path: "/Users/dev/project/src/app.ts",
        workspaceRoot: undefined,
      }),
    ).toBeNull();
  });

  it("compares Windows roots case-insensitively", () => {
    expect(
      resolveWorkspaceRelativePath({
        path: "C:\\Users\\Dev\\Project\\src\\app.ts",
        workspaceRoot: "c:\\users\\dev\\project",
      }),
    ).toBe("src/app.ts");
  });
});
