export function isWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:([/\\]|$)/.test(value);
}

export function isUncPath(value: string): boolean {
  return value.startsWith("\\\\");
}

export function isWindowsAbsolutePath(value: string): boolean {
  return isUncPath(value) || isWindowsDrivePath(value);
}

export function isExplicitRelativePath(value: string): boolean {
  return (
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\")
  );
}

function isRootPath(value: string): boolean {
  // The drive separator is required: a bare `C:` is not the drive root (it
  // means "current directory on C:"), and treating it as already-canonical
  // would leave it as `C:` while `C:\` and `C:/` normalize to the drive root,
  // so the same location would fail project identity/dedup comparisons.
  return value === "/" || value === "\\" || /^[a-zA-Z]:[/\\]$/.test(value);
}

function trimTrailingPathSeparators(value: string): string {
  if (value.length === 0 || isRootPath(value)) {
    return value;
  }
  const trimmed = value.startsWith("/")
    ? value.replace(/\/+$/g, "")
    : value.replace(/[\\/]+$/g, "");
  if (trimmed.length === 0) {
    return value;
  }
  return /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
}

export function normalizeProjectPathForDispatch(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

export function normalizeProjectPathForComparison(value: string): string {
  const normalized = normalizeProjectPathForDispatch(value);
  if (isWindowsDrivePath(normalized) || isUncPath(normalized)) {
    return normalized.replaceAll("/", "\\").toLowerCase();
  }
  return normalized;
}

function toPathSegments(value: string): Array<string> {
  return normalizeProjectPathForDispatch(value)
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

/**
 * Maps a path an agent reported onto a workspace-relative one, or `null` when it
 * does not belong to the workspace.
 *
 * Providers disagree about what they report: Claude and OpenCode send the
 * absolute path the model used, while Codex and the ACP providers usually send
 * a path relative to the session's working directory. Both have to resolve to
 * the same key before a client can open the file.
 *
 * This is not `resolveDiffPathForWorkspace`, which maps a *git* path — always
 * repository-relative — and therefore rejects every absolute path. Use this one
 * for provider-reported paths and that one for paths parsed out of a diff.
 */
export function resolveWorkspaceRelativePath(input: {
  readonly path: string;
  readonly workspaceRoot: string | undefined;
}): string | null {
  const segments = toPathSegments(input.path);
  // A traversal segment means the path cannot be resolved to a single workspace
  // location, so it is refused rather than guessed at.
  if (segments.length === 0 || segments.includes("..")) {
    return null;
  }

  const trimmed = input.path.trim();
  const isAbsolute = trimmed.startsWith("/") || isWindowsAbsolutePath(trimmed);
  if (!isAbsolute) {
    return segments.join("/");
  }

  if (!input.workspaceRoot) {
    return null;
  }
  const rootSegments = toPathSegments(input.workspaceRoot);
  if (rootSegments.length === 0 || segments.length <= rootSegments.length) {
    return null;
  }
  const caseInsensitive = isWindowsAbsolutePath(input.workspaceRoot.trim());
  const insideWorkspace = rootSegments.every((rootSegment, index) => {
    const candidate = segments[index];
    if (candidate === undefined) {
      return false;
    }
    return caseInsensitive
      ? candidate.toLowerCase() === rootSegment.toLowerCase()
      : candidate === rootSegment;
  });
  return insideWorkspace ? segments.slice(rootSegments.length).join("/") : null;
}
