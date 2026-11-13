import * as Schema from "effect/Schema";
import { ProjectId, RuntimeRequestId, ThreadId } from "./baseSchemas.ts";
import { OrchestrationV2UserInputQuestion } from "./orchestrationV2.ts";

export const AskHumanQuestionId = Schema.String.check(Schema.isPattern(/^Q-\d{4}-\d{3}$/));
export const InboxThread = Schema.Struct({
  id: ThreadId,
  title: Schema.String,
  projectId: ProjectId,
  projectTitle: Schema.String,
  active: Schema.Boolean,
});
export const InboxAskHumanItem = Schema.Struct({
  source: Schema.Literal("ask-human"),
  id: AskHumanQuestionId,
  kind: Schema.Literals(["decide", "action"]),
  question: Schema.String,
  context: Schema.String,
  options: Schema.Array(Schema.String),
  recommend: Schema.String,
  agent: Schema.String,
  createdAt: Schema.String,
  threadId: Schema.NullOr(Schema.String),
  workspace: Schema.String,
  thread: Schema.NullOr(InboxThread),
});
export type InboxAskHumanItem = typeof InboxAskHumanItem.Type;
export const InboxItem = Schema.Union([
  InboxAskHumanItem,
  Schema.Struct({
    source: Schema.Literal("native"),
    threadId: ThreadId,
    requestId: RuntimeRequestId,
    createdAt: Schema.String,
    blocking: Schema.Boolean,
    questions: Schema.Array(OrchestrationV2UserInputQuestion),
    thread: Schema.NullOr(InboxThread),
  }),
]);
export type InboxItem = typeof InboxItem.Type;
export const InboxSnapshot = Schema.Struct({
  askHumanAvailable: Schema.Boolean,
  items: Schema.Array(InboxItem),
});
export type InboxSnapshot = typeof InboxSnapshot.Type;
export const InboxAnswerAskHumanInput = Schema.Struct({
  id: AskHumanQuestionId,
  text: Schema.String.check(Schema.isMinLength(1)),
});
export type InboxAnswerAskHumanInput = typeof InboxAnswerAskHumanInput.Type;
export const InboxCloseAskHumanInput = Schema.Struct({
  id: AskHumanQuestionId,
  reason: Schema.String,
});
export type InboxCloseAskHumanInput = typeof InboxCloseAskHumanInput.Type;
export class InboxError extends Schema.TaggedError<InboxError>()("InboxError", {
  code: Schema.Literals([
    "already_processed",
    "unavailable",
    "read_failed",
    "command_failed",
    "invalid_id",
  ]),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    switch (this.code) {
      case "already_processed":
        return "This question has already been handled.";
      case "unavailable":
        return "ask-human is unavailable in this environment.";
      case "read_failed":
        return "Failed to read inbox questions.";
      case "command_failed":
        return "Failed to update the ask-human question.";
      case "invalid_id":
        return "Invalid ask-human question ID.";
    }
  }
}
