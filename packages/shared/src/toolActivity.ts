import type { ToolLifecycleItemType } from "@t3tools/contracts";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCommandValue(value: unknown): string | undefined {
  const direct = asTrimmedString(value);
  if (direct) {
    return direct;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const entry of value) {
    const part = asTrimmedString(entry);
    if (part !== undefined) {
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function stripTrailingExitCode(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const match = /^(?<output>[\s\S]*?)(?:\s*<exited with exit code \d+>)\s*$/iu.exec(trimmed);
  const output = match?.groups?.output?.trim() ?? trimmed;
  return output.length > 0 ? output : undefined;
}

function extractCommandFromTitle(title: string | undefined): string | undefined {
  if (!title) {
    return undefined;
  }
  const backtickMatch = /`([^`]+)`/u.exec(title);
  return backtickMatch?.[1]?.trim() || undefined;
}

function extractToolCommand(data: Record<string, unknown> | undefined, title: string | undefined) {
  const item = asRecord(data?.item);
  const itemInput = asRecord(item?.input);
  const itemResult = asRecord(item?.result);
  const rawInput = asRecord(data?.rawInput);
  const candidates = [
    normalizeCommandValue(item?.command),
    normalizeCommandValue(itemInput?.command),
    normalizeCommandValue(itemResult?.command),
    normalizeCommandValue(data?.command),
    normalizeCommandValue(rawInput?.command),
  ];
  const direct = candidates.find((candidate) => candidate !== undefined);
  if (direct) {
    return direct;
  }
  const executable = asTrimmedString(rawInput?.executable);
  const args = normalizeCommandValue(rawInput?.args);
  if (executable && args) {
    return `${executable} ${args}`;
  }
  if (executable) {
    return executable;
  }
  return extractCommandFromTitle(title);
}

function maybePathLike(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".") ||
    /\.(?:[a-z0-9]{1,12})$/iu.test(value)
  ) {
    return value;
  }
  return undefined;
}

/**
 * Keys a provider may use for a file path. Adapters disagree: the Claude SDK
 * passes its tool input verbatim (`file_path`, `notebook_path`), ACP providers
 * use `path`, Codex reports renames as `kind.move_path`, and OpenCode uses
 * `filePath`.
 */
const TOOL_PATH_KEYS = [
  "path",
  "filePath",
  "relativePath",
  "filename",
  "newPath",
  "oldPath",
  "file_path",
  "notebook_path",
  "move_path",
] as const;

/**
 * Containers worth descending into. `locations`, `rawInput` and `content` are
 * where the ACP providers (Cursor, Grok, Antigravity, omp) put their paths, and
 * `kind` is where Codex hides a rename's `move_path`.
 */
const TOOL_PATH_CONTAINERS = [
  "item",
  "result",
  "input",
  "data",
  "changes",
  "files",
  "edits",
  "patch",
  "patches",
  "operations",
  "locations",
  "rawInput",
  "content",
  "state",
  "kind",
] as const;

const TOOL_PATH_MAX_DEPTH = 4;
const TOOL_PATH_DEFAULT_LIMIT = 12;

export interface CollectToolPathsOptions {
  /** Stop after this many distinct paths. Defaults to 12. */
  readonly limit?: number;
  /**
   * Keep only values that look like a path. Presentation needs this so a tool
   * title such as `terminal` never reads as a filename; the activity payload
   * projection must not enable it, because `Makefile`, `Dockerfile` and
   * `LICENSE` are real paths with neither a separator nor an extension.
   */
  readonly requirePathLike?: boolean;
}

/**
 * Walks a provider-supplied tool payload for the files it touched.
 *
 * Every surface that shows "which files did this tool call change" reads this:
 * the server's activity payload projection (which produces the `files` field
 * clients render), plus the web and mobile work-log derivations. They have to
 * agree, so there is one walker rather than one per runtime.
 */
export function collectToolPaths(value: unknown, options?: CollectToolPathsOptions): Array<string> {
  const limit = options?.limit ?? TOOL_PATH_DEFAULT_LIMIT;
  const requirePathLike = options?.requirePathLike ?? false;
  const paths: Array<string> = [];
  const seen = new Set<string>();

  const walk = (input: unknown, depth: number): void => {
    if (depth > TOOL_PATH_MAX_DEPTH || paths.length >= limit) {
      return;
    }
    if (Array.isArray(input)) {
      for (const entry of input) {
        walk(entry, depth + 1);
        if (paths.length >= limit) {
          return;
        }
      }
      return;
    }
    const record = asRecord(input);
    if (!record) {
      return;
    }
    for (const key of TOOL_PATH_KEYS) {
      const raw = asTrimmedString(record[key]);
      const candidate = requirePathLike ? maybePathLike(raw) : raw;
      if (!candidate || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      paths.push(candidate);
      if (paths.length >= limit) {
        return;
      }
    }
    for (const nestedKey of TOOL_PATH_CONTAINERS) {
      if (!(nestedKey in record)) {
        continue;
      }
      walk(record[nestedKey], depth + 1);
      if (paths.length >= limit) {
        return;
      }
    }
  };

  walk(value, 0);
  return paths;
}

function extractPrimaryPath(data: Record<string, unknown> | undefined): string | undefined {
  return collectToolPaths(data, { limit: 8, requirePathLike: true })[0];
}

function normalizeEquivalentValue(value: string | undefined): string | undefined {
  const trimmed = asTrimmedString(value);
  if (!trimmed) {
    return undefined;
  }
  return trimmed
    .replace(/\s+/gu, " ")
    .replace(/\s+(?:complete|completed|started)\s*$/iu, "")
    .trim();
}

function isEquivalent(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeEquivalentValue(left)?.toLowerCase();
  const normalizedRight = normalizeEquivalentValue(right)?.toLowerCase();
  return normalizedLeft !== undefined && normalizedLeft === normalizedRight;
}

function classifyToolAction(input: {
  readonly itemType?: ToolLifecycleItemType | null | undefined;
  readonly title?: string | undefined;
  readonly data?: Record<string, unknown> | undefined;
}): "command" | "read" | "file_change" | "search" | "other" {
  const itemType = input.itemType ?? undefined;
  const kind = asTrimmedString(input.data?.kind)?.toLowerCase();
  const title = asTrimmedString(input.title)?.toLowerCase();
  if (itemType === "command_execution" || kind === "execute" || title === "terminal") {
    return "command";
  }
  if (kind === "read" || title === "read file") {
    return "read";
  }
  if (
    itemType === "file_change" ||
    kind === "edit" ||
    kind === "move" ||
    kind === "delete" ||
    kind === "write"
  ) {
    return "file_change";
  }
  if (itemType === "web_search" || kind === "search" || title === "find" || title === "grep") {
    return "search";
  }
  return "other";
}

export interface ToolActivityPresentationInput {
  readonly itemType?: ToolLifecycleItemType | null | undefined;
  readonly title?: string | null | undefined;
  readonly detail?: string | null | undefined;
  readonly data?: unknown;
  readonly fallbackSummary?: string | null | undefined;
}

export interface ToolActivityPresentation {
  readonly summary: string;
  readonly detail?: string | undefined;
}

export function deriveToolActivityPresentation(
  input: ToolActivityPresentationInput,
): ToolActivityPresentation {
  const title = asTrimmedString(input.title);
  const detail = stripTrailingExitCode(asTrimmedString(input.detail));
  const fallbackSummary = asTrimmedString(input.fallbackSummary) ?? "Tool";
  const data = asRecord(input.data);
  const command = extractToolCommand(data, title);
  const primaryPath = extractPrimaryPath(data);
  const action = classifyToolAction({
    itemType: input.itemType,
    title,
    data,
  });

  if (action === "command") {
    return {
      summary: "Ran command",
      ...(command ? { detail: command } : {}),
    };
  }

  if (action === "read") {
    if (primaryPath) {
      return {
        summary: "Read file",
        detail: primaryPath,
      };
    }
    return {
      summary: "Read file",
    };
  }

  if (action === "file_change") {
    return {
      summary: "Changed files",
      ...(primaryPath ? { detail: primaryPath } : {}),
    };
  }

  if (action === "search") {
    const query =
      asTrimmedString(asRecord(data?.rawInput)?.query) ??
      asTrimmedString(asRecord(data?.rawInput)?.pattern) ??
      asTrimmedString(asRecord(data?.rawInput)?.searchTerm);
    return {
      summary: "Searched files",
      ...(query ? { detail: query } : {}),
    };
  }

  if (detail && !isEquivalent(detail, title) && !isEquivalent(detail, fallbackSummary)) {
    return {
      summary: title ?? fallbackSummary,
      detail,
    };
  }

  return {
    summary: title ?? fallbackSummary,
  };
}
