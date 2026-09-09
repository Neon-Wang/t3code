import { parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { ToolFileEdit } from "@t3tools/shared/toolFileEdit";

import { buildFileDiffRenderKey, getDiffLineStat, getRenderablePatch } from "./diffRendering";

/**
 * Rendered lines a single tool row may inline before it becomes a link instead.
 *
 * The transcript is virtualized and reuses rows by identity, so an unbounded
 * row height is what produces scroll jumps. 40 covers the large majority of
 * agent edits without a nested scroll container — Pierre measures its own
 * scroll parent, so clipping the surface is not an option. Anything larger is
 * still reachable: the row offers to open the file, where the whole change
 * renders against a chosen baseline.
 */
export const MAX_INLINE_DIFF_LINES = 40;

export interface RenderableToolFileEdit {
  readonly key: string;
  readonly path: string;
  /**
   * `rewrite` has no before side, so it renders as all additions. Callers must
   * label it as written rather than changed.
   */
  readonly kind: ToolFileEdit["kind"];
  readonly fileDiff: FileDiffMetadata;
  readonly additions: number;
  readonly deletions: number;
  /** Set when the provider gave whole files, so the span's position is known. */
  readonly startLine?: number;
}

export interface ToolFileEditRendering {
  readonly edits: ReadonlyArray<RenderableToolFileEdit>;
  /**
   * Files this tool call changed with no inline diff to show: the server had
   * nothing renderable, the edit exceeded a budget, or the provider truncated
   * its own payload. The row links to them instead of rendering half a diff.
   */
  readonly openOnlyPaths: ReadonlyArray<string>;
}

const EMPTY: ToolFileEditRendering = { edits: [], openOnlyPaths: [] };

function toFileDiffs(edit: ToolFileEdit): ReadonlyArray<FileDiffMetadata> {
  try {
    switch (edit.kind) {
      case "patch": {
        const renderable = getRenderablePatch(edit.unifiedDiff, "tool-call-diff");
        return renderable?.kind === "files" ? renderable.files : [];
      }
      case "span":
        return [
          parseDiffFromFile(
            { name: edit.path, contents: edit.oldText },
            { name: edit.path, contents: edit.newText },
          ),
        ];
      case "rewrite":
        return [parseDiffFromFile(null, { name: edit.path, contents: edit.newText })];
    }
  } catch {
    // A provider can send a patch we cannot parse. The row falls back to a link.
    return [];
  }
}

/**
 * Turns the server's per-edit diffs into what a tool row renders.
 *
 * Every path the tool call touched ends up in exactly one of the two buckets, so
 * a row never silently omits a file it changed.
 */
export function renderableToolFileEdits(input: {
  readonly fileEdits: ReadonlyArray<ToolFileEdit> | undefined;
  readonly changedFiles: ReadonlyArray<string> | undefined;
  readonly maxInlineLines?: number;
}): ToolFileEditRendering {
  const changedFiles = input.changedFiles ?? [];
  if (!input.fileEdits || input.fileEdits.length === 0) {
    return changedFiles.length > 0 ? { edits: [], openOnlyPaths: changedFiles } : EMPTY;
  }

  const maxInlineLines = input.maxInlineLines ?? MAX_INLINE_DIFF_LINES;
  const edits: Array<RenderableToolFileEdit> = [];
  const rendered = new Set<string>();
  const overBudget: Array<string> = [];

  input.fileEdits.forEach((edit, index) => {
    const fileDiffs = toFileDiffs(edit);
    if (fileDiffs.length === 0) {
      overBudget.push(edit.path);
      return;
    }
    const stat = getDiffLineStat(fileDiffs);
    if (stat.additions + stat.deletions > maxInlineLines) {
      overBudget.push(edit.path);
      return;
    }
    for (const fileDiff of fileDiffs) {
      edits.push({
        key: `${index}:${buildFileDiffRenderKey(fileDiff)}`,
        path: edit.path,
        kind: edit.kind,
        fileDiff,
        additions: stat.additions,
        deletions: stat.deletions,
        ...(edit.kind === "span" && edit.startLine !== undefined
          ? { startLine: edit.startLine }
          : {}),
      });
    }
    rendered.add(edit.path);
  });

  const openOnlyPaths = [...new Set([...overBudget, ...changedFiles])].filter(
    (path) => !rendered.has(path),
  );
  return { edits, openOnlyPaths };
}
