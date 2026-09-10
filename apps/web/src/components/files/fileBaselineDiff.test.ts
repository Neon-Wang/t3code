import { describe, expect, it } from "vite-plus/test";

import { checkpointRefForThreadTurn, type ThreadId, type TurnId } from "@t3tools/contracts";

import type { TurnDiffSummary } from "../../types";
import { buildFileBaselineDiff, resolveBaselineRef } from "./fileBaselineDiff";

const THREAD_ID = "3f33a0ab-ce69-44e5-b719-661b511d1bfc" as ThreadId;
const ref = (turnCount: number) => checkpointRefForThreadTurn(THREAD_ID, turnCount);

// A checkpoint is captured when its turn finishes, so `turn/0` is never one of
// these — it is the pre-thread state, written before the first turn runs.
function checkpoint(turnCount: number, status = "ready"): TurnDiffSummary {
  return {
    turnId: `turn-${turnCount}`,
    checkpointTurnCount: turnCount,
    checkpointRef: ref(turnCount),
    status,
    files: [],
    assistantMessageId: null,
    completedAt: "2026-08-01T10:00:00.000Z",
  } as unknown as TurnDiffSummary;
}

describe("resolveBaselineRef", () => {
  const checkpoints = [checkpoint(1), checkpoint(2)];
  const base = { threadId: THREAD_ID, checkpoints };

  // The finished turn's own checkpoint holds its result, so comparing against
  // it would decorate nothing at all.
  it("compares a finished turn against the checkpoint before it", () => {
    expect(
      resolveBaselineRef({ ...base, scope: "turn", latestTurnId: "turn-2" as TurnId })?.baseRef,
    ).toBe(ref(1));
  });

  it("compares the first finished turn against the state the thread started from", () => {
    expect(
      resolveBaselineRef({
        threadId: THREAD_ID,
        checkpoints: [checkpoint(1)],
        scope: "turn",
        latestTurnId: "turn-1" as TurnId,
      })?.baseRef,
    ).toBe(ref(0));
  });

  // A running turn has no checkpoint yet, so the newest one is what it started
  // from — this is the live-audit case.
  it("compares a running turn against the newest checkpoint", () => {
    expect(
      resolveBaselineRef({ ...base, scope: "turn", latestTurnId: "turn-3" as TurnId })?.baseRef,
    ).toBe(ref(2));
  });

  it("compares the first running turn against the state the thread started from", () => {
    expect(
      resolveBaselineRef({
        threadId: THREAD_ID,
        checkpoints: [],
        scope: "turn",
        latestTurnId: "turn-1" as TurnId,
      })?.baseRef,
    ).toBe(ref(0));
  });

  it("compares the whole thread against the state it started from", () => {
    expect(
      resolveBaselineRef({ ...base, scope: "thread", latestTurnId: "turn-2" as TurnId })?.baseRef,
    ).toBe(ref(0));
  });

  it("compares the working tree against HEAD", () => {
    expect(
      resolveBaselineRef({ ...base, scope: "worktree", latestTurnId: "turn-2" as TurnId }),
    ).toEqual({ baseRef: null });
  });

  it("resolves nothing when decorations are off", () => {
    expect(
      resolveBaselineRef({ ...base, scope: "off", latestTurnId: "turn-2" as TurnId }),
    ).toBeNull();
  });

  // `turn/0` is written when the first turn starts, so before that there is no
  // baseline and decorating would render the whole file as new.
  it("resolves nothing before the thread has run a turn", () => {
    for (const scope of ["turn", "thread"] as const) {
      expect(
        resolveBaselineRef({ threadId: THREAD_ID, checkpoints: [], scope, latestTurnId: null }),
      ).toBeNull();
    }
  });

  // An unfinished checkpoint cannot be diffed against, so it must not be read
  // as the newest one.
  it("ignores checkpoints that are not ready", () => {
    expect(
      resolveBaselineRef({
        threadId: THREAD_ID,
        checkpoints: [checkpoint(1), checkpoint(2, "missing")],
        scope: "turn",
        latestTurnId: "turn-2" as TurnId,
      })?.baseRef,
    ).toBe(ref(1));
  });
});

describe("buildFileBaselineDiff", () => {
  const baselineContents = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") + "\n";

  it("covers the whole file so the editor shows every line", () => {
    const currentContents = baselineContents.replace("line 20", "line 20 changed");
    const diff = buildFileBaselineDiff({
      path: "src/app.ts",
      baselineContents,
      currentContents,
    });
    expect(diff).not.toBeNull();
    expect(diff?.hunks.length).toBe(1);
    // Every line of the file is rendered, not just the changed one plus context.
    expect(diff?.hunks[0]?.additionCount).toBe(40);
    // `additionLines` on the hunk is a count; the file's own array holds the text.
    expect(diff?.additionLines.some((line) => line.includes("line 20 changed"))).toBe(true);
  });

  it("returns nothing when the file matches its baseline", () => {
    expect(
      buildFileBaselineDiff({
        path: "src/app.ts",
        baselineContents,
        currentContents: baselineContents,
      }),
    ).toBeNull();
  });
});
