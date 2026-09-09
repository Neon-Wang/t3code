/**
 * Projects a file-changing tool call's provider payload into the bounded
 * per-edit diffs clients render inline in the transcript.
 *
 * This lives beside `ActivityPayloadProjection`, which already owns the other
 * read-side dialect knowledge (`projectAcpContent`, `projectCommandData`), and
 * is applied at the same single egress chokepoint. Doing it here rather than in
 * six adapters keeps one allowlist: an adapter-emitted field would be destroyed
 * for `item.updated` rows, which are projected before they are persisted.
 *
 * The output is deliberately small. Live thread events are charged to
 * `LiveStreamBudget` as uncompressed JSON, and overflow fails the whole
 * subscription rather than dropping a frame, so every branch here is capped.
 *
 * @module orchestration/toolFileEdits
 */
import { computeChangedSpan, type ToolFileEdit } from "@t3tools/shared/toolFileEdit";

/** Per file. Two of these still fit comfortably inside one coalesced frame. */
const MAX_EDIT_CHARS = 2_000;
/** Per activity, across every file it touched. */
const MAX_TOTAL_CHARS = 4_000;
const MAX_EDITS = 4;

/** `AntigravityProtocol` keeps only the tail of an oversized string. */
const PROVIDER_TRUNCATION_MARKER = "[Earlier output truncated]";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Provider-reported paths are attacker-influenced — a repository file can carry
 * a prompt injection — and only the Antigravity adapter contains them today. A
 * traversal segment means we cannot say what the path refers to, so the edit is
 * dropped rather than rendered.
 */
function isRenderablePath(path: string): boolean {
  return !path
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segment === "..");
}

function isProviderTruncated(...values: ReadonlyArray<string | null>): boolean {
  return values.some((value) => value !== null && value.includes(PROVIDER_TRUNCATION_MARKER));
}

function firstPath(record: Record<string, unknown> | null): string | null {
  if (!record) {
    return null;
  }
  return (
    asTrimmedString(record.file_path) ??
    asTrimmedString(record.filePath) ??
    asTrimmedString(record.path) ??
    asTrimmedString(record.notebook_path)
  );
}

function oldTextOf(record: Record<string, unknown>): string | null {
  return asText(record.old_string) ?? asText(record.oldString) ?? asText(record.oldText);
}

function newTextOf(record: Record<string, unknown>): string | null {
  return asText(record.new_string) ?? asText(record.newString) ?? asText(record.newText);
}

function spanOrRewrite(
  path: string,
  oldText: string | null,
  newText: string | null,
  options?: { readonly wholeFile?: boolean },
): ToolFileEdit | null {
  if (newText === null) {
    return null;
  }
  if (oldText === null || oldText.length === 0) {
    return { kind: "rewrite", path, newText };
  }
  if (!options?.wholeFile) {
    // A search-and-replace fragment: the model never said where the match was,
    // so there is no line number to anchor to.
    return { kind: "span", path, oldText, newText };
  }
  const span = computeChangedSpan(oldText, newText);
  if (!span) {
    return null;
  }
  return {
    kind: "span",
    path,
    oldText: span.oldText,
    newText: span.newText,
    startLine: span.startLine,
  };
}

/** Codex is the only provider that hands over a real per-file unified diff. */
function fromCodexChanges(data: Record<string, unknown>): Array<ToolFileEdit> {
  const changes = asRecord(data.item)?.changes;
  if (!Array.isArray(changes)) {
    return [];
  }
  const edits: Array<ToolFileEdit> = [];
  for (const entry of changes) {
    const change = asRecord(entry);
    const path = change ? asTrimmedString(change.path) : null;
    const unifiedDiff = change ? asText(change.diff) : null;
    if (!path || !unifiedDiff) {
      continue;
    }
    edits.push({ kind: "patch", path, unifiedDiff });
  }
  return edits;
}

/** Cursor, Grok, omp and Antigravity all report through ACP `content` entries. */
function fromAcpDiffContent(data: Record<string, unknown>): Array<ToolFileEdit> {
  if (!Array.isArray(data.content)) {
    return [];
  }
  const edits: Array<ToolFileEdit> = [];
  for (const entry of data.content) {
    const record = asRecord(entry);
    if (!record || record.type !== "diff") {
      continue;
    }
    const path = asTrimmedString(record.path);
    if (!path) {
      continue;
    }
    const oldText = asText(record.oldText);
    const newText = asText(record.newText);
    if (isProviderTruncated(oldText, newText)) {
      // The provider kept only the tail of its own payload, so any diff built
      // from it would be wrong in a way the reader cannot see.
      continue;
    }
    const edit = spanOrRewrite(path, oldText, newText, { wholeFile: true });
    if (edit) {
      edits.push(edit);
    }
  }
  return edits;
}

/**
 * Claude and OpenCode report the search-and-replace the model asked for; omp and
 * the other ACP providers repeat it under `rawInput`.
 */
function fromToolInput(data: Record<string, unknown>): Array<ToolFileEdit> {
  const input = asRecord(data.input) ?? asRecord(data.rawInput);
  if (!input) {
    return [];
  }
  const path = firstPath(input);
  if (!path) {
    return [];
  }

  if (Array.isArray(input.edits)) {
    const edits: Array<ToolFileEdit> = [];
    for (const entry of input.edits) {
      const record = asRecord(entry);
      if (!record) {
        continue;
      }
      const edit = spanOrRewrite(path, oldTextOf(record), newTextOf(record));
      if (edit) {
        edits.push(edit);
      }
    }
    return edits;
  }

  const newText = newTextOf(input) ?? asText(input.content);
  const edit = spanOrRewrite(path, oldTextOf(input), newText);
  return edit ? [edit] : [];
}

function editChars(edit: ToolFileEdit): number {
  switch (edit.kind) {
    case "patch":
      return edit.unifiedDiff.length;
    case "span":
      return edit.oldText.length + edit.newText.length;
    case "rewrite":
      return edit.newText.length;
  }
}

/**
 * Returns the per-file edits a client can render for this tool call, or an empty
 * array when the payload carries nothing renderable. Callers add the result to
 * the projected payload only when it is non-empty: the existing `files` list
 * already tells clients which files a tool call touched.
 */
export function projectToolFileEdits(data: Record<string, unknown>): Array<ToolFileEdit> {
  // Codex patches and ACP diff content carry real line numbers, so they win over
  // the same edit restated as a search-and-replace under `input` / `rawInput`.
  // Deduplication is by source, not by entry: one MultiEdit call legitimately
  // produces several spans for the same path.
  const anchored = [...fromCodexChanges(data), ...fromAcpDiffContent(data)];
  const anchoredPaths = new Set(anchored.map((edit) => edit.path));
  const candidates = [
    ...anchored,
    ...fromToolInput(data).filter((edit) => !anchoredPaths.has(edit.path)),
  ];

  const edits: Array<ToolFileEdit> = [];
  let totalChars = 0;
  for (const candidate of candidates) {
    if (edits.length >= MAX_EDITS || totalChars >= MAX_TOTAL_CHARS) {
      break;
    }
    if (!isRenderablePath(candidate.path)) {
      continue;
    }
    const chars = editChars(candidate);
    // Over-budget edits are dropped rather than clipped: the projected `files`
    // list still names the path, which is the client's cue to open the file
    // instead of rendering half a diff.
    if (chars > MAX_EDIT_CHARS || totalChars + chars > MAX_TOTAL_CHARS) {
      continue;
    }
    totalChars += chars;
    edits.push(candidate);
  }
  return edits;
}
