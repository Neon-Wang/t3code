import * as Schema from "effect/Schema";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { RemoteIssueRef, IssueState, IssueCloseReason } from "./changeRequestIssue.ts";

export const ThreadIssueSnapshot = Schema.Struct({
  title: TrimmedNonEmptyString,
  state: IssueState,
  closeReason: Schema.NullOr(IssueCloseReason),
  updatedAt: IsoDateTime,
  syncedAt: IsoDateTime,
});
export type ThreadIssueSnapshot = typeof ThreadIssueSnapshot.Type;
export const ThreadLinkedIssue = Schema.Struct({
  ...RemoteIssueRef.fields,
  url: TrimmedNonEmptyString,
  source: Schema.Literals(["manual", "agent", "created"]),
  linkedAt: IsoDateTime,
  snapshot: Schema.NullOr(ThreadIssueSnapshot),
});
export type ThreadLinkedIssue = typeof ThreadLinkedIssue.Type;
