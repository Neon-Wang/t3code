import { describe, expect, it } from "vite-plus/test";

import { computeChangedSpan, readToolFileEdits } from "./toolFileEdit.ts";

describe("computeChangedSpan", () => {
  it("returns nothing when the file did not change", () => {
    expect(computeChangedSpan("a\nb\n", "a\nb\n")).toBeUndefined();
  });

  it("narrows a single-line edit to that line and reports its position", () => {
    const span = computeChangedSpan("one\ntwo\nthree\nfour\n", "one\nTWO\nthree\nfour\n");
    expect(span).toEqual({ oldText: "two", newText: "TWO", startLine: 2 });
  });

  it("keeps a multi-line replacement as one span", () => {
    const span = computeChangedSpan("a\nb\nc\nd\n", "a\nX\nY\nZ\nd\n");
    expect(span).toEqual({ oldText: "b\nc", newText: "X\nY\nZ", startLine: 2 });
  });

  it("reports an append as an empty old side starting after the last shared line", () => {
    const span = computeChangedSpan("a\nb\n", "a\nb\nc\n");
    expect(span?.oldText).toBe("");
    expect(span?.newText).toBe("c");
    expect(span?.startLine).toBe(3);
  });

  it("reports a deletion as an empty new side", () => {
    const span = computeChangedSpan("a\nb\nc\n", "a\nc\n");
    expect(span).toEqual({ oldText: "b", newText: "", startLine: 2 });
  });

  // Several disjoint edits collapse into one covering span. That is correct but
  // not minimal, and it is why the caller caps by size rather than trusting the
  // span to stay small.
  it("covers disjoint edits with a single span", () => {
    const span = computeChangedSpan("a\nb\nc\nd\ne\n", "a\nB\nc\nD\ne\n");
    expect(span).toEqual({ oldText: "b\nc\nd", newText: "B\nc\nD", startLine: 2 });
  });

  it("degenerates to every differing line when nothing else is shared", () => {
    // The trailing newline makes the final (empty) line shared context, so the
    // span is the file's content without it rather than the raw text.
    const span = computeChangedSpan("a\nb\n", "x\ny\n");
    expect(span).toEqual({ oldText: "a\nb", newText: "x\ny", startLine: 1 });
  });
});

describe("readToolFileEdits", () => {
  it("reads each known variant", () => {
    expect(
      readToolFileEdits([
        { kind: "patch", path: "a.ts", unifiedDiff: "@@" },
        { kind: "span", path: "b.ts", oldText: "x", newText: "y", startLine: 7 },
        { kind: "rewrite", path: "c.ts", newText: "z" },
      ]),
    ).toEqual([
      { kind: "patch", path: "a.ts", unifiedDiff: "@@" },
      { kind: "span", path: "b.ts", oldText: "x", newText: "y", startLine: 7 },
      { kind: "rewrite", path: "c.ts", newText: "z" },
    ]);
  });

  it("returns nothing when the field is absent or empty", () => {
    expect(readToolFileEdits(undefined)).toBeUndefined();
    expect(readToolFileEdits([])).toBeUndefined();
    expect(readToolFileEdits("not an array")).toBeUndefined();
  });

  // The field rides inside an untyped payload, so a newer server may send a
  // variant this build does not know. Those are skipped, never rendered raw.
  it("skips entries it does not recognize", () => {
    expect(
      readToolFileEdits([
        { kind: "conflict", path: "a.ts", markers: [] },
        { kind: "span", path: "b.ts", oldText: "x", newText: "y" },
        { kind: "patch", path: "" },
        { kind: "rewrite", path: "c.ts" },
        null,
        ["nope"],
      ]),
    ).toEqual([{ kind: "span", path: "b.ts", oldText: "x", newText: "y" }]);
  });

  it("drops a start line that is not a positive integer", () => {
    expect(
      readToolFileEdits([
        { kind: "span", path: "a.ts", oldText: "x", newText: "y", startLine: 0 },
        { kind: "span", path: "b.ts", oldText: "x", newText: "y", startLine: 1.5 },
      ]),
    ).toEqual([
      { kind: "span", path: "a.ts", oldText: "x", newText: "y" },
      { kind: "span", path: "b.ts", oldText: "x", newText: "y" },
    ]);
  });
});
