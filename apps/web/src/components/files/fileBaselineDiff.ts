import { parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import type { TurnDiffSummary } from "../../types";

/**
 * Which version of a file the editor decorates against.
 *
 * All three read through one existing RPC with a different base ref, so the
 * whole control works against servers that predate it.
 */
export const FILE_DIFF_SCOPES = ["off", "turn", "thread", "worktree"] as const;
export type FileDiffScope = (typeof FILE_DIFF_SCOPES)[number];

export const DEFAULT_FILE_DIFF_SCOPE: FileDiffScope = "off";

export function isFileDiffScope(value: unknown): value is FileDiffScope {
  return typeof value === "string" && (FILE_DIFF_SCOPES as ReadonlyArray<string>).includes(value);
}

/**
 * Enough context that the diff covers the file. The rendered result is then the
 * whole file with its changed lines marked, which is the point — a diff clipped
 * to a few lines of context is a diff view, not an editor.
 */
const WHOLE_FILE_CONTEXT = 1_000_000;

export interface BaselineRefResolution {
  /** `null` means HEAD, which is what the working-tree comparison uses. */
  readonly baseRef: string | null;
}

/**
 * The ref a scope compares against, or `null` when there is nothing to compare.
 *
 * Checkpoints are captured before a turn runs, so the newest one is the state
 * this turn started from and the oldest is the state the thread started from.
 * A scope whose checkpoint is missing resolves to nothing rather than silently
 * falling back to a different baseline than the one the user picked.
 */
export function resolveBaselineRef(input: {
  readonly scope: FileDiffScope;
  readonly checkpoints: ReadonlyArray<TurnDiffSummary>;
}): BaselineRefResolution | null {
  if (input.scope === "off") {
    return null;
  }
  if (input.scope === "worktree") {
    return { baseRef: null };
  }
  const ready = input.checkpoints
    .filter((checkpoint) => checkpoint.status === "ready")
    .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount);
  const checkpoint = input.scope === "turn" ? ready.at(-1) : ready.at(0);
  return checkpoint ? { baseRef: checkpoint.checkpointRef } : null;
}

/**
 * Builds the diff the editor renders: the current file, with the lines that
 * differ from the baseline marked.
 */
export function buildFileBaselineDiff(input: {
  readonly path: string;
  readonly baselineContents: string;
  readonly currentContents: string;
}): FileDiffMetadata | null {
  if (input.baselineContents === input.currentContents) {
    return null;
  }
  try {
    return parseDiffFromFile(
      { name: input.path, contents: input.baselineContents },
      { name: input.path, contents: input.currentContents },
      { context: WHOLE_FILE_CONTEXT },
    );
  } catch {
    return null;
  }
}
