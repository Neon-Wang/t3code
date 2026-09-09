import { describe, expect, it } from "vite-plus/test";

import type { TurnDiffSummary } from "../../types";
import { buildFileBaselineDiff, resolveBaselineRef } from "./fileBaselineDiff";

function checkpoint(turnCount: number, status = "ready"): TurnDiffSummary {
  return {
    turnId: `turn-${turnCount}`,
    checkpointTurnCount: turnCount,
    checkpointRef: `refs/t3/checkpoints/thread/turn/${turnCount}`,
    status,
    files: [],
    assistantMessageId: null,
    completedAt: "2026-08-01T10:00:00.000Z",
  } as unknown as TurnDiffSummary;
}

describe("resolveBaselineRef", () => {
  const checkpoints = [checkpoint(0), checkpoint(1), checkpoint(2)];

  it("compares this turn against the newest checkpoint", () => {
    expect(resolveBaselineRef({ scope: "turn", checkpoints })?.baseRef).toBe(
      "refs/t3/checkpoints/thread/turn/2",
    );
  });

  it("compares the whole thread against its first checkpoint", () => {
    expect(resolveBaselineRef({ scope: "thread", checkpoints })?.baseRef).toBe(
      "refs/t3/checkpoints/thread/turn/0",
    );
  });

  it("compares the working tree against HEAD", () => {
    expect(resolveBaselineRef({ scope: "worktree", checkpoints })).toEqual({ baseRef: null });
  });

  it("resolves nothing when decorations are off", () => {
    expect(resolveBaselineRef({ scope: "off", checkpoints })).toBeNull();
  });

  // Falling back to a different baseline would decorate against something the
  // user did not choose, which is worse than showing nothing.
  it("resolves nothing when the chosen checkpoint is missing", () => {
    expect(resolveBaselineRef({ scope: "turn", checkpoints: [] })).toBeNull();
    expect(
      resolveBaselineRef({ scope: "turn", checkpoints: [checkpoint(1, "missing")] }),
    ).toBeNull();
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
