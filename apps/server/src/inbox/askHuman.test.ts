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
