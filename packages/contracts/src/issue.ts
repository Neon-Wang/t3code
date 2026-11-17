import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  ChangeRequestIssueLink,
  IssueCloseReason,
  IssueState,
  RemoteIssueRef,
} from "./changeRequestIssue.ts";
import {
  PullRequestActor,
  PullRequestComment,
  PullRequestLabel,
  PullRequestReaction,
  PullRequestReactionContent,
  PullRequestRef,
  PullRequestListCursors,
  PullRequestListProjectError,
  PullRequestUnavailableReason,
} from "./pullRequest.ts";
import { SourceControlProviderKind } from "./sourceControl.ts";

export const IssueRef = Schema.Struct(PullRequestRef.fields);
export type IssueRef = typeof IssueRef.Type;

export const IssueCapabilities = Schema.Struct({
  comment: Schema.Boolean,
  edit: Schema.Boolean,
  reactions: Schema.Boolean,
  labels: Schema.Boolean,
  assignees: Schema.Boolean,
  close: Schema.Boolean,
  search: Schema.Boolean,
});
export type IssueCapabilities = typeof IssueCapabilities.Type;
export const IssueViewerPermissions = Schema.Struct({
  comment: Schema.Boolean,
  edit: Schema.Boolean,
  labels: Schema.Boolean,
  assignees: Schema.Boolean,
  close: Schema.Boolean,
});
export type IssueViewerPermissions = typeof IssueViewerPermissions.Type;

export const IssueListFilters = Schema.Struct({
  labels: Schema.optional(
    Schema.Array(Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(10))).check(
      Schema.isMaxLength(10),
    ),
  ),
  excludedLabels: Schema.optional(
    Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(10)),
  ),
  author: Schema.optional(TrimmedNonEmptyString),
});
export type IssueListFilters = typeof IssueListFilters.Type;
export const IssueListInput = Schema.Struct({
  state: Schema.Literals(["all", "open", "closed"]),
  involvement: Schema.optional(Schema.Literals(["all", "assigned", "authored", "mentioned"])),
  filters: Schema.optional(IssueListFilters),
  projectId: Schema.optional(ProjectId),
  projectIds: Schema.optional(Schema.Array(ProjectId).check(Schema.isMaxLength(100))),
  host: Schema.optional(TrimmedNonEmptyString),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  cursors: Schema.optional(PullRequestListCursors),
  query: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(200))),
});
export type IssueListInput = typeof IssueListInput.Type;

export const IssueListEntry = Schema.Struct({
  ...RemoteIssueRef.fields,
  provider: SourceControlProviderKind,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  author: Schema.NullOr(PullRequestActor),
  state: IssueState,
  closeReason: Schema.NullOr(IssueCloseReason),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  labels: Schema.Array(PullRequestLabel),
  assignees: Schema.Array(PullRequestActor),
  commentCount: NonNegativeInt,
});
export type IssueListEntry = typeof IssueListEntry.Type;
export const IssueListResult = Schema.Struct({
  viewers: Schema.Record(TrimmedNonEmptyString, TrimmedNonEmptyString),
  providers: Schema.Array(
    Schema.Struct({
      host: TrimmedNonEmptyString,
      kind: SourceControlProviderKind,
      supported: Schema.Boolean,
    }),
  ),
  entries: Schema.Array(IssueListEntry),
  errors: Schema.Array(PullRequestListProjectError),
  truncated: Schema.Boolean,
  nextCursors: PullRequestListCursors,
});
export type IssueListResult = typeof IssueListResult.Type;

export const IssueDetail = Schema.Struct({
  ...IssueListEntry.fields,
  body: Schema.String,
  workspaceRoot: TrimmedNonEmptyString,
  closedAt: Schema.NullOr(IsoDateTime),
  capabilities: IssueCapabilities,
  viewerPermissions: IssueViewerPermissions,
  linkedChangeRequests: Schema.Array(ChangeRequestIssueLink),
});
export type IssueDetail = typeof IssueDetail.Type;
export const IssueActivityEvent = Schema.Struct({
  id: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  actor: Schema.NullOr(PullRequestActor),
  kind: Schema.Literals([
    "closed",
    "reopened",
    "labeled",
    "unlabeled",
    "assigned",
    "unassigned",
    "cross-referenced",
  ]),
  label: Schema.optional(PullRequestLabel),
  assignee: Schema.optional(PullRequestActor),
  reference: Schema.optional(ChangeRequestIssueLink),
});
export type IssueActivityEvent = typeof IssueActivityEvent.Type;
export const IssueActivityInput = Schema.Struct({
  ...IssueRef.fields,
  cursor: Schema.optional(TrimmedNonEmptyString),
});
export type IssueActivityInput = typeof IssueActivityInput.Type;
export const IssueActivity = Schema.Struct({
  comments: Schema.Array(PullRequestComment),
  events: Schema.Array(IssueActivityEvent),
  reactions: Schema.Array(PullRequestReaction),
  nextCursor: Schema.NullOr(TrimmedNonEmptyString),
});
export type IssueActivity = typeof IssueActivity.Type;

export const IssueFilterOptionsInput = Schema.Struct({
  projectId: ProjectId,
  host: Schema.optional(TrimmedNonEmptyString),
  kind: Schema.Literals(["labels", "authors"]),
  query: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(100))),
});
export type IssueFilterOptionsInput = typeof IssueFilterOptionsInput.Type;
export const IssueFilterOptions = Schema.Struct({
  labels: Schema.Array(PullRequestLabel),
  authors: Schema.Array(PullRequestActor),
  truncated: Schema.Boolean,
});
export type IssueFilterOptions = typeof IssueFilterOptions.Type;
export const IssueCandidatesInput = Schema.Struct({
  ...IssueRef.fields,
  query: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(100))),
});
export type IssueCandidatesInput = typeof IssueCandidatesInput.Type;
export const IssueAssigneeCandidateList = Schema.Struct({
  candidates: Schema.Array(
    Schema.Struct({
      ...PullRequestActor.fields,
      id: TrimmedNonEmptyString,
      isAssigned: Schema.Boolean,
    }),
  ),
  truncated: Schema.Boolean,
});
export type IssueAssigneeCandidateList = typeof IssueAssigneeCandidateList.Type;
const Body = Schema.String.check(Schema.isMaxLength(65_536));
export const IssueCommentInput = Schema.Struct({
  ...IssueRef.fields,
  body: Body.check(Schema.isMinLength(1)),
});
export type IssueCommentInput = typeof IssueCommentInput.Type;
export const IssueCommentUpdateInput = Schema.Struct({
  ...IssueCommentInput.fields,
  commentId: TrimmedNonEmptyString,
});
export type IssueCommentUpdateInput = typeof IssueCommentUpdateInput.Type;
export const IssueReactionInput = Schema.Struct({
  ...IssueRef.fields,
  subjectId: Schema.optional(TrimmedNonEmptyString),
  content: PullRequestReactionContent,
  reacted: Schema.Boolean,
});
export type IssueReactionInput = typeof IssueReactionInput.Type;
export const IssueUpdateInput = Schema.Struct({
  ...IssueRef.fields,
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
  body: Schema.optional(Body),
  state: Schema.optional(IssueState),
  closeReason: Schema.optional(IssueCloseReason),
});
export type IssueUpdateInput = typeof IssueUpdateInput.Type;
export const IssueLabelChangeInput = Schema.Struct({
  ...IssueRef.fields,
  labels: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1), Schema.isMaxLength(25)),
  applied: Schema.Boolean,
});
export type IssueLabelChangeInput = typeof IssueLabelChangeInput.Type;
export const IssueAssigneeChangeInput = Schema.Struct({
  ...IssueRef.fields,
  assigneeIds: Schema.Array(TrimmedNonEmptyString).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(25),
  ),
  assigned: Schema.Boolean,
});
export type IssueAssigneeChangeInput = typeof IssueAssigneeChangeInput.Type;
export const IssueInvalidateInput = Schema.Struct({ reference: Schema.optional(IssueRef) });
export type IssueInvalidateInput = typeof IssueInvalidateInput.Type;
export class IssueUnavailableError extends Schema.TaggedError<IssueUnavailableError>()(
  "IssueUnavailableError",
  {
    reason: PullRequestUnavailableReason,
    provider: Schema.optional(SourceControlProviderKind),
    requirement: Schema.optional(TrimmedNonEmptyString),
  },
) {
  override get message(): string {
    return this.requirement ?? "Issues are unavailable for this host.";
  }
}
export class IssueOperationError extends Schema.TaggedError<IssueOperationError>()(
  "IssueOperationError",
  {
    operation: Schema.String,
    detail: TrimmedNonEmptyString,
    reason: Schema.optional(Schema.Literal("not-found")),
  },
) {
  override get message(): string {
    return this.detail;
  }
}
