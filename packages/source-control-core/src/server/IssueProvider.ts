import type * as Effect from "effect/Effect";
import type {
  ThreadIssueSnapshot,
  ChangeRequestIssueLink,
  IssueActivity,
  IssueActivityInput,
  IssueAssigneeCandidateList,
  IssueAssigneeChangeInput,
  IssueCandidatesInput,
  IssueCommentInput,
  IssueCommentUpdateInput,
  IssueDetail,
  IssueLabelChangeInput,
  IssueListEntry,
  IssueListInput,
  IssueOperationError,
  IssueReactionInput,
  IssueRef,
  IssueUnavailableError,
  IssueUpdateInput,
  PullRequestLabel,
  PullRequestLabelCandidateList,
} from "@t3tools/contracts";

export type IssueProviderError = IssueOperationError | IssueUnavailableError;
export interface IssueProviderContext {
  readonly cwd: string;
  readonly host: string;
  readonly repository: string;
}
export type ProviderIssue = Omit<IssueListEntry, "projectId" | "projectTitle">;
export type ProviderIssueDetail = Omit<IssueDetail, "projectId" | "projectTitle" | "workspaceRoot">;
type Input<A> = A & IssueProviderContext;
export interface IssueProviderApi {
  readonly summary: (
    input: Input<IssueRef>,
  ) => Effect.Effect<Omit<ThreadIssueSnapshot, "syncedAt">, IssueProviderError>;
  readonly list: (
    input: Input<IssueListInput> & { readonly viewer: string; readonly cursor?: string },
  ) => Effect.Effect<
    { readonly entries: ReadonlyArray<ProviderIssue>; readonly nextCursor: string | null },
    IssueProviderError
  >;
  readonly detail: (
    input: Input<IssueRef>,
  ) => Effect.Effect<ProviderIssueDetail, IssueProviderError>;
  readonly activity: (
    input: Input<IssueActivityInput> & { readonly viewer: string },
  ) => Effect.Effect<IssueActivity, IssueProviderError>;
  readonly linkedIssues: (
    input: IssueProviderContext & { readonly number: number },
  ) => Effect.Effect<ReadonlyArray<ChangeRequestIssueLink>, IssueProviderError>;
  readonly repositoryLabels: (
    input: IssueProviderContext & { readonly query?: string },
  ) => Effect.Effect<
    { readonly labels: ReadonlyArray<PullRequestLabel>; readonly truncated: boolean },
    IssueProviderError
  >;
  readonly labelCandidates: (
    input: Input<IssueCandidatesInput>,
  ) => Effect.Effect<PullRequestLabelCandidateList, IssueProviderError>;
  readonly assigneeCandidates: (
    input: Input<IssueCandidatesInput>,
  ) => Effect.Effect<IssueAssigneeCandidateList, IssueProviderError>;
  readonly comment: (input: Input<IssueCommentInput>) => Effect.Effect<void, IssueProviderError>;
  readonly updateComment: (
    input: Input<IssueCommentUpdateInput>,
  ) => Effect.Effect<void, IssueProviderError>;
  readonly setReaction: (
    input: Input<IssueReactionInput>,
  ) => Effect.Effect<void, IssueProviderError>;
  readonly update: (input: Input<IssueUpdateInput>) => Effect.Effect<void, IssueProviderError>;
  readonly setLabels: (
    input: Input<IssueLabelChangeInput>,
  ) => Effect.Effect<void, IssueProviderError>;
  readonly setAssignees: (
    input: Input<IssueAssigneeChangeInput>,
  ) => Effect.Effect<void, IssueProviderError>;
}
