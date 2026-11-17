import * as Schema from "effect/Schema";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const RemoteChangeRequestRef = Schema.Struct({
  host: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
});
export type RemoteChangeRequestRef = typeof RemoteChangeRequestRef.Type;

export const RemoteIssueRef = Schema.Struct(RemoteChangeRequestRef.fields);
export type RemoteIssueRef = typeof RemoteIssueRef.Type;

export const IssueState = Schema.Literals(["open", "closed"]);
export type IssueState = typeof IssueState.Type;
export const IssueCloseReason = Schema.Literals(["completed", "not_planned"]);
export type IssueCloseReason = typeof IssueCloseReason.Type;

export const PullRequestState = Schema.Literals(["open", "closed", "merged"]);
export type PullRequestState = typeof PullRequestState.Type;

export const ChangeRequestIssueLink = Schema.Struct({
  issue: Schema.Struct({
    ...RemoteIssueRef.fields,
    title: Schema.String,
    state: IssueState,
    url: TrimmedNonEmptyString,
  }),
  changeRequest: Schema.Struct({
    ...RemoteChangeRequestRef.fields,
    title: Schema.String,
    state: PullRequestState,
    url: TrimmedNonEmptyString,
  }),
  kind: Schema.Literals(["closes", "mentions"]),
});
export type ChangeRequestIssueLink = typeof ChangeRequestIssueLink.Type;
