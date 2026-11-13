import { AskHumanQuestionId, type InboxAskHumanItem } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const AskHumanQuestion = Schema.Struct({
  id: AskHumanQuestionId,
  status: Schema.Literals(["open", "answered", "delivered", "closed"]),
  kind: Schema.optional(Schema.Literals(["decide", "action"])),
  created_at: Schema.String,
  question: Schema.String,
  context: Schema.optional(Schema.NullOr(Schema.String)),
  options: Schema.optional(Schema.Array(Schema.String)),
  recommend: Schema.optional(Schema.NullOr(Schema.String)),
  agent: Schema.optional(Schema.NullOr(Schema.String)),
  thread_id: Schema.optional(Schema.NullOr(Schema.String)),
  workspace: Schema.optional(Schema.String),
});
const decodeQuestion = Schema.decodeUnknownSync(AskHumanQuestion);

export function parseAskHumanQuestion(text: string): InboxAskHumanItem | null {
  const value = decodeQuestion(JSON.parse(text));
  if (!Number.isFinite(Date.parse(value.created_at))) throw new Error("Invalid question timestamp");
  if (value.status !== "open") return null;
  return {
    source: "ask-human",
    id: value.id,
    kind: value.kind ?? "decide",
    question: value.question,
    context: value.context ?? "",
    options: value.options ?? [],
    recommend: value.recommend ?? "",
    agent: value.agent ?? "",
    createdAt: value.created_at,
    threadId: value.thread_id || null,
    workspace: value.workspace ?? "",
    thread: null,
  };
}
