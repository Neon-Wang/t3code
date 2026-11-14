import { describe, expect, it } from "vite-plus/test";
import { parseAskHumanQuestion } from "./askHuman.ts";

// Field combinations from the real questions directory, with question text removed.
const question = {
  id: "Q-1112-001",
  status: "open",
  created_at: "2026-11-12T19:07:04+08:00",
  question: "",
  context: null,
  options: [],
  recommend: null,
  agent: "",
  thread_id: null,
  workspace: "",
};

describe("ask-human question parsing", () => {
  it("accepts legacy null fields and absent kind, preserving offset timestamps", () => {
    expect(parseAskHumanQuestion(JSON.stringify(question))).toMatchObject({
      id: question.id,
      kind: "decide",
      context: "",
      recommend: "",
      threadId: null,
      createdAt: question.created_at,
    });
  });
  it("preserves action questions and delegated thread IDs", () => {
    expect(
      parseAskHumanQuestion(
        JSON.stringify({ ...question, kind: "action", thread_id: "thread:delegated-task:example" }),
      ),
    ).toMatchObject({ kind: "action", threadId: "thread:delegated-task:example" });
  });
  it("reads urgent questions and treats a missing or normal priority as not urgent", () => {
    expect(
      parseAskHumanQuestion(
        JSON.stringify({
          ...question,
          priority: "urgent",
          urgent_at: "2026-11-13T20:10:00+08:00",
          urgent_reason: "blocked",
          urgent_message_id: "om_example",
        }),
      ),
    ).toMatchObject({
      urgent: true,
      urgentAt: "2026-11-13T20:10:00+08:00",
      urgentReason: "blocked",
    });
    expect(parseAskHumanQuestion(JSON.stringify(question))).toMatchObject({
      urgent: false,
      urgentAt: null,
      urgentReason: "",
    });
    expect(
      parseAskHumanQuestion(
        JSON.stringify({ ...question, priority: "normal", urgent_reason: "x" }),
      ),
    ).toMatchObject({ urgent: false, urgentReason: "" });
  });
  it.each(["answered", "delivered", "closed"])("excludes %s questions", (status) => {
    expect(parseAskHumanQuestion(JSON.stringify({ ...question, status }))).toBeNull();
  });
  it.each(["../Q-1112-001", "Q-1112-001;echo", "Q-1112-001.json", "Q-1112-01"])(
    "rejects unsafe ID %s",
    (id) => {
      expect(() => parseAskHumanQuestion(JSON.stringify({ ...question, id }))).toThrow();
    },
  );
  it("rejects malformed JSON and timestamps", () => {
    expect(() => parseAskHumanQuestion("{")).toThrow();
    expect(() =>
      parseAskHumanQuestion(JSON.stringify({ ...question, created_at: "invalid" })),
    ).toThrow();
  });
});
