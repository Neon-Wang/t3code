/**
 * The per-edit diff a file-changing tool call carries to clients.
 *
 * Adapters disagree about what they can tell us: Codex computes a real unified
 * diff per file, the ACP providers (Cursor, Grok, omp, Antigravity) hand over
 * whole before/after files, and Claude and OpenCode only report the
 * search-and-replace fragment the model asked for. Those are three different
 * fidelities, so the wire shape is a tagged union rather than one representation
 * that would force the server to fake the parts a provider never sent.
 *
 * @module toolFileEdit
 */

/** A provider-computed unified diff. Line numbers are real. */
export interface ToolFileEditPatch {
  readonly kind: "patch";
  readonly path: string;
  readonly unifiedDiff: string;
}

/**
 * The region that changed, as before/after text. `startLine` is present when the
 * provider gave us whole files, so the span's position in the new file is known;
 * it is absent for a search-and-replace fragment, where the model never told us
 * where in the file the match was.
 */
export interface ToolFileEditSpan {
  readonly kind: "span";
  readonly path: string;
  readonly oldText: string;
  readonly newText: string;
  readonly startLine?: number;
}

/** New content with no before side: a create, or a whole-file write. */
export interface ToolFileEditRewrite {
  readonly kind: "rewrite";
  readonly path: string;
  readonly newText: string;
}

export type ToolFileEdit = ToolFileEditPatch | ToolFileEditSpan | ToolFileEditRewrite;

export interface ChangedSpan {
  readonly oldText: string;
  readonly newText: string;
  /** 1-based line in the new text where the span starts. */
  readonly startLine: number;
}

/**
 * Reads the inline edits off an activity payload.
 *
 * The field rides inside `payload.data`, which is `Schema.Unknown` on the wire,
 * so nothing decodes it for us and the sender may be a newer server. Entries
 * whose shape is not recognized are skipped rather than rendered.
 */
export function readToolFileEdits(value: unknown): ReadonlyArray<ToolFileEdit> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const edits: Array<ToolFileEdit> = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (path.length === 0) {
      continue;
    }
    if (record.kind === "patch" && typeof record.unifiedDiff === "string") {
      edits.push({ kind: "patch", path, unifiedDiff: record.unifiedDiff });
      continue;
    }
    if (
      record.kind === "span" &&
      typeof record.oldText === "string" &&
      typeof record.newText === "string"
    ) {
      const startLine =
        typeof record.startLine === "number" &&
        Number.isInteger(record.startLine) &&
        record.startLine > 0
          ? record.startLine
          : undefined;
      edits.push({
        kind: "span",
        path,
        oldText: record.oldText,
        newText: record.newText,
        ...(startLine === undefined ? {} : { startLine }),
      });
      continue;
    }
    if (record.kind === "rewrite" && typeof record.newText === "string") {
      edits.push({ kind: "rewrite", path, newText: record.newText });
    }
  }
  return edits.length > 0 ? edits : undefined;
}

/**
 * Narrows two versions of a file to the lines that differ.
 *
 * A whole-file before/after pair is far too large to put on the thread stream,
 * and the interesting part of an agent edit is almost always a handful of
 * contiguous lines. Trimming the common prefix and suffix keeps the real line
 * numbers (unlike a fragment) without needing a diff algorithm. Several
 * disjoint edits collapse into one span covering all of them, which is correct
 * but not minimal; a whole-file rewrite trims to nothing and gets rejected by
 * the caller's byte cap instead.
 */
export function computeChangedSpan(oldText: string, newText: string): ChangedSpan | undefined {
  if (oldText === newText) {
    return undefined;
  }
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const shorter = Math.min(oldLines.length, newLines.length);

  let prefix = 0;
  while (prefix < shorter && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  const remaining = shorter - prefix;
  while (
    suffix < remaining &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    oldText: oldLines.slice(prefix, oldLines.length - suffix).join("\n"),
    newText: newLines.slice(prefix, newLines.length - suffix).join("\n"),
    startLine: prefix + 1,
  };
}
