import { parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import { checkpointRefForThreadTurn, type ThreadId, type TurnId } from "@t3tools/contracts";

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
 * A turn's checkpoint is captured when it finishes, so it holds the result of
 * that turn rather than what it started from. Showing what a turn changed means
 * comparing against the *previous* turn's checkpoint, and showing what a thread
 * changed means comparing against `turn/0` — a ref no turn ever reports, since
 * it is captured before the first turn runs. Both are derived by name from the
 * same helper the server writes them with.
 */
export function resolveBaselineRef(input: {
  readonly scope: FileDiffScope;
  readonly threadId: ThreadId;
  readonly checkpoints: ReadonlyArray<TurnDiffSummary>;
  /** The newest turn, checkpointed or not. `null` before a thread has run one. */
  readonly latestTurnId: TurnId | null;
}): BaselineRefResolution | null {
  if (input.scope === "off") {
    return null;
  }
  if (input.scope === "worktree") {
    return { baseRef: null };
  }
  const newestCheckpoint = input.checkpoints
    .filter((checkpoint) => checkpoint.status === "ready")
    .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
    .at(-1);
  if (newestCheckpoint === undefined && input.latestTurnId === null) {
    // Nothing has run, so `turn/0` does not exist yet and comparing against it
    // would render the whole file as new.
    return null;
  }
  if (input.scope === "thread") {
    return { baseRef: checkpointRefForThreadTurn(input.threadId, 0) };
  }
  const completedTurns = newestCheckpoint?.checkpointTurnCount ?? 0;
  // When the newest turn already owns the newest checkpoint it has finished, so
  // its own baseline is the checkpoint before it. Otherwise that turn is still
  // running and the newest checkpoint is exactly what it started from.
  const latestTurnIsCheckpointed = newestCheckpoint?.turnId === input.latestTurnId;
  return {
    baseRef: checkpointRefForThreadTurn(
      input.threadId,
      Math.max(0, latestTurnIsCheckpointed ? completedTurns - 1 : completedTurns),
    ),
  };
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
