import { EnvironmentId, type InboxItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { inboxRows } from "./inboxRows.ts";

const question = (id: string, overrides: Partial<InboxItem> = {}): InboxItem => ({
  id,
  kind: "decide",
  question: id,
  context: "",
  options: [],
  recommend: "",
  agent: "",
  createdAt: "2026-11-13T10:00:00+08:00",
  urgent: false,
  urgentAt: null,
  urgentReason: "",
  threadId: null,
  workspace: "",
  thread: null,
  ...overrides,
});
const environment = (id: string, items: InboxItem[]) => ({
  environmentId: EnvironmentId.make(id),
  label: id,
  snapshot: { askHumanAvailable: true, items },
});

describe("inboxRows", () => {
  it("pins urgent questions from every environment above all other questions", () => {
    const rows = inboxRows([
      environment("a", [question("Q-1113-001"), question("Q-1113-002")]),
      environment("b", [
        question("Q-1113-003", {
          urgent: true,
          urgentAt: "2026-11-13T11:00:00+08:00",
        }),
        question("Q-1113-004", {
          urgent: true,
          urgentAt: "2026-11-13T12:00:00+08:00",
        }),
      ]),
    ]);
    expect(rows.map((row) => row.key)).toEqual([
      "urgent",
      "question:b:Q-1113-004",
      "question:b:Q-1113-003",
      "environment:a",
      "project:a:",
      "question:a:Q-1113-001",
      "question:a:Q-1113-002",
      "environment:b",
    ]);
    expect(rows[1]).toMatchObject({ showThread: true, environmentLabel: "b" });
  });

  it("keeps one key for a question before and after it turns urgent", () => {
    const before = inboxRows([environment("a", [question("Q-1113-001")])]);
    const after = inboxRows([
      environment("a", [question("Q-1113-001", { urgent: true, urgentAt: null })]),
    ]);
    const key = (rows: typeof before) => rows.find((row) => row.kind === "question")?.key;
    expect(key(after)).toBe(key(before));
  });
});
