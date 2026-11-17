import { i18n } from "@t3tools/shared/i18n";
import {
  SourceControlProviderKind,
  IssueOperationError,
  type ChangeRequestIssueLink,
  type IssueActivity,
  type IssueActivityEvent,
  type PullRequestActor,
  type PullRequestReaction,
  type PullRequestReactionContent,
} from "@t3tools/contracts";
import type {
  IssueProviderApi,
  IssueProviderContext,
  ProviderIssue,
} from "@t3tools/source-control-core/server/IssueProvider";
import * as Effect from "effect/Effect";
import { GraphQLClient } from "effect/graphql";
import * as G from "./issues.graphql.ts";
import * as GitHubGraphQlClient from "./gitHubGraphQlClient.ts";
import { gitHubReactionContent } from "./gitHubPullRequestJson.ts";

const nodes = <A>(value: ReadonlyArray<A | null> | null | undefined): A[] =>
  (value ?? []).filter((item): item is A => item !== null);
const actor = (value: G.IssueActor | null): PullRequestActor | null =>
  value === null
    ? null
    : { login: value.login, name: "name" in value ? value.name : null, avatarUrl: value.avatarUrl };
const label = (value: G.IssueLabel) => ({
  name: value.name,
  color: value.color,
  description: value.description,
});
const issueSummary = (
  host: string,
  value: G.IssueLinkSummary,
): ChangeRequestIssueLink["issue"] => ({
  host,
  repository: value.repository.nameWithOwner,
  number: value.number,
  title: value.title,
  state: value.state === "OPEN" ? "open" : "closed",
  url: value.url,
});
const prSummary = (
  host: string,
  value: G.ChangeRequestLinkSummary,
): ChangeRequestIssueLink["changeRequest"] => ({
  host,
  repository: value.repository.nameWithOwner,
  number: value.number,
  title: value.title,
  state: value.state === "OPEN" ? "open" : value.state === "MERGED" ? "merged" : "closed",
  url: value.url,
});
const entry = (host: string, value: G.IssueEntry): ProviderIssue => ({
  ...issueSummary(host, value),
  provider: SourceControlProviderKind.make("github"),
  author: actor(value.author),
  closeReason:
    value.stateReason === "COMPLETED"
      ? "completed"
      : value.stateReason === "NOT_PLANNED"
        ? "not_planned"
        : null,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  labels: nodes(value.labels?.nodes).map(label),
  assignees: nodes(value.assignees.nodes),
  commentCount: value.comments.totalCount,
});
const contents: Record<G.ReactionGroup["content"], PullRequestReactionContent> = {
  THUMBS_UP: "thumbs-up",
  THUMBS_DOWN: "thumbs-down",
  LAUGH: "laugh",
  HOORAY: "hooray",
  CONFUSED: "confused",
  HEART: "heart",
  ROCKET: "rocket",
  EYES: "eyes",
};
const reactions = (
  value: Pick<G.IssueReactions, "reactionGroups">,
  viewer: string,
): PullRequestReaction[] =>
  nodes(value.reactionGroups)
    .filter((g) => g.users.totalCount > 0)
    .map((g) => ({
      content: contents[g.content],
      count: g.users.totalCount,
      viewerHasReacted: g.viewerHasReacted,
      actors: nodes(g.users.nodes)
        .map((u) => u.login)
        .filter((login) => login.toLowerCase() !== viewer.toLowerCase()),
    }));
const missing = (operation: string) =>
  new IssueOperationError({ operation, reason: "not-found", detail: i18n.t("issue.notFound") });
const variables = (input: { readonly repository: string; readonly number: number }) => {
  const [owner, name] = input.repository.split("/");
  return { owner: owner!, name: name!, number: input.number };
};
// One link per issue and change request; a closing reference wins over a plain mention.
const uniqueLinks = (links: ReadonlyArray<ChangeRequestIssueLink>) => {
  const byPair = new Map<string, ChangeRequestIssueLink>();
  for (const link of links) {
    const key = JSON.stringify([
      link.issue.host,
      link.issue.repository,
      link.issue.number,
      link.changeRequest.host,
      link.changeRequest.repository,
      link.changeRequest.number,
    ]);
    if (byPair.get(key)?.kind !== "closes") byPair.set(key, link);
  }
  return [...byPair.values()];
};

export const make = Effect.gen(function* () {
  const client = yield* GraphQLClient.make(
    G.IssuesGraphQLGroup.middleware(GitHubGraphQlClient.GitHubGraphQlAuth),
  ).pipe(Effect.provide(GitHubGraphQlClient.layer));
  const call =
    (input: IssueProviderContext, operation: string) =>
    <A, E>(effect: Effect.Effect<A, E, GitHubGraphQlClient.GitHubGraphQlTarget>) =>
      effect.pipe(
        GitHubGraphQlClient.call({ host: input.host, operation }),
        Effect.mapError(
          () =>
            new IssueOperationError({
              operation,
              detail: i18n.t("issue.githubFailed", { operation }),
            }),
        ),
      );
  const core = Effect.fn("GitHubIssueProvider.core")(function* (
    input: IssueProviderContext & { readonly number: number },
  ) {
    const result = yield* client.IssueCore(variables(input)).pipe(call(input, "detail"));
    if (result.repository?.issue == null) return yield* missing("detail");
    return { issue: result.repository.issue, permission: result.repository.viewerPermission };
  });
  const timeline = Effect.fn("GitHubIssueProvider.timeline")(function* (
    input: IssueProviderContext & {
      readonly number: number;
      readonly cursor?: string | undefined;
      readonly viewer: string;
    },
  ): Effect.fn.Return<IssueActivity, IssueOperationError> {
    const result = yield* client
      .IssueTimeline({ ...variables(input), ...(input.cursor ? { after: input.cursor } : {}) })
      .pipe(call(input, "activity"));
    const issue = result.repository?.issue;
    if (issue == null) return yield* missing("activity");
    const comments: IssueActivity["comments"][number][] = [];
    const events: IssueActivityEvent[] = [];
    for (const event of nodes(issue.timelineItems.nodes)) {
      if (event.__typename === "IssueComment") {
        comments.push({
          id: event.id,
          kind: "issue-comment",
          author: actor(event.author),
          body: event.body,
          createdAt: event.createdAt,
          editedAt: event.lastEditedAt,
          url: event.url,
          path: null,
          reviewState: null,
          canEdit: event.viewerCanUpdate,
          reactions: reactions(event, input.viewer),
        });
        continue;
      }
      if (!("id" in event)) continue;
      const base = { id: event.id, createdAt: event.createdAt, actor: actor(event.actor) };
      switch (event.__typename) {
        case "ClosedEvent":
          events.push({ ...base, kind: "closed" });
          break;
        case "ReopenedEvent":
          events.push({ ...base, kind: "reopened" });
          break;
        case "LabeledEvent":
          events.push({ ...base, kind: "labeled", label: label(event.label) });
          break;
        case "UnlabeledEvent":
          events.push({ ...base, kind: "unlabeled", label: label(event.label) });
          break;
        case "AssignedEvent":
        case "UnassignedEvent":
          events.push({
            ...base,
            kind: event.__typename === "AssignedEvent" ? "assigned" : "unassigned",
            ...(event.assignee?.__typename === "User" ? { assignee: event.assignee } : {}),
          });
          break;
        case "CrossReferencedEvent":
          if (event.source.__typename === "PullRequest")
            events.push({
              ...base,
              kind: "cross-referenced",
              reference: {
                issue: issueSummary(input.host, issue),
                changeRequest: prSummary(input.host, event.source),
                kind: "mentions",
              },
            });
          break;
      }
    }
    return {
      comments,
      events,
      reactions: reactions(issue, input.viewer),
      nextCursor: issue.timelineItems.pageInfo.hasNextPage
        ? issue.timelineItems.pageInfo.endCursor
        : null,
    };
  });
  const linkedChangeRequests = Effect.fn("GitHubIssueProvider.linkedChangeRequests")(function* (
    input: IssueProviderContext & { readonly number: number },
  ) {
    const links: ChangeRequestIssueLink[] = [];
    let after: string | undefined;
    do {
      const result = yield* client
        .IssueLinks({ ...variables(input), ...(after ? { after } : {}) })
        .pipe(call(input, "linkedChangeRequests"));
      const issue = result.repository?.issue;
      if (issue == null) return yield* missing("linkedChangeRequests");
      for (const pr of nodes(issue.closedByPullRequestsReferences?.nodes))
        links.push({
          issue: issueSummary(input.host, issue),
          changeRequest: prSummary(input.host, pr),
          kind: "closes",
        });
      after = issue.closedByPullRequestsReferences?.pageInfo.hasNextPage
        ? (issue.closedByPullRequestsReferences.pageInfo.endCursor ?? undefined)
        : undefined;
    } while (after);
    let cursor: string | undefined;
    do {
      const page = yield* timeline({ ...input, viewer: "", ...(cursor ? { cursor } : {}) });
      for (const event of page.events) if (event.reference) links.push(event.reference);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return uniqueLinks(links);
  });
  const labels = Effect.fn("GitHubIssueProvider.labels")(function* (
    input: IssueProviderContext & { readonly query?: string | undefined },
  ) {
    const all: G.IssueLabel[] = [];
    let after: string | undefined;
    do {
      const { owner, name } = variables({ ...input, number: 1 });
      const result = yield* client
        .IssueLabels({
          owner,
          name,
          ...(input.query ? { query: input.query } : {}),
          ...(after ? { after } : {}),
        })
        .pipe(call(input, "labels"));
      if (result.repository == null) return yield* missing("labels");
      all.push(...nodes(result.repository.labels?.nodes));
      after = result.repository.labels?.pageInfo.hasNextPage
        ? (result.repository.labels.pageInfo.endCursor ?? undefined)
        : undefined;
    } while (after);
    return all;
  });
  const validateSubject = Effect.fn("GitHubIssueProvider.validateSubject")(function* (
    input: IssueProviderContext & { readonly number: number },
    id: string,
    commentOnly: boolean,
  ) {
    const { node } = yield* client.IssueSubject({ id }).pipe(call(input, "subject"));
    const issue =
      node?.__typename === "IssueComment"
        ? node.issue
        : !commentOnly && node?.__typename === "Issue"
          ? node
          : null;
    if (
      issue == null ||
      issue.number !== input.number ||
      issue.repository.nameWithOwner.toLowerCase() !== input.repository.toLowerCase()
    )
      return yield* new IssueOperationError({
        operation: "subject",
        detail: i18n.t("issue.subjectMismatch"),
      });
    return id;
  });
  return {
    summary: (input) =>
      core(input).pipe(
        Effect.map(({ issue }) => {
          const value = entry(input.host, issue);
          return {
            title: value.title,
            state: value.state,
            closeReason: value.closeReason,
            updatedAt: value.updatedAt,
          };
        }),
      ),
    list: Effect.fn("GitHubIssueProvider.list")(function* (input) {
      const quote = (value: string) => JSON.stringify(value);
      const query = [
        `repo:${input.repository}`,
        "is:issue",
        "sort:updated-desc",
        input.state === "all" ? "" : `is:${input.state}`,
        input.query ?? "",
      ];
      if (input.involvement && input.involvement !== "all")
        query.push(
          `${{ assigned: "assignee", authored: "author", mentioned: "mentions" }[input.involvement]}:${quote(input.viewer)}`,
        );
      if (input.filters?.author)
        query.push(
          `author:${quote(/^@?me$/i.test(input.filters.author) ? input.viewer : input.filters.author)}`,
        );
      for (const group of input.filters?.labels ?? [])
        query.push(`label:${group.map(quote).join(",")}`);
      for (const name of input.filters?.excludedLabels ?? []) query.push(`-label:${quote(name)}`);
      const result = yield* client
        .IssueSearch({
          query: query.filter(Boolean).join(" "),
          first: input.limit ?? 50,
          ...(input.cursor ? { after: input.cursor } : {}),
        })
        .pipe(call(input, "list"));
      return {
        entries: nodes(result.search.nodes).flatMap((node) =>
          node.__typename === "Issue" ? [entry(input.host, node)] : [],
        ),
        nextCursor: result.search.pageInfo.hasNextPage ? result.search.pageInfo.endCursor : null,
      };
    }),
    detail: Effect.fn("GitHubIssueProvider.detail")(function* (input) {
      const { issue, permission } = yield* core(input);
      const triage =
        permission === "ADMIN" ||
        permission === "MAINTAIN" ||
        permission === "WRITE" ||
        permission === "TRIAGE";
      return {
        ...entry(input.host, issue),
        body: issue.body,
        closedAt: issue.closedAt,
        capabilities: {
          comment: true,
          edit: true,
          reactions: true,
          labels: true,
          assignees: true,
          close: true,
          search: true,
        },
        viewerPermissions: {
          comment: !issue.locked || triage,
          edit: issue.viewerCanUpdate,
          labels: triage,
          assignees: triage,
          close: issue.state === "OPEN" ? issue.viewerCanClose : issue.viewerCanReopen,
        },
        linkedChangeRequests: yield* linkedChangeRequests(input),
      };
    }),
    activity: timeline,
    linkedIssues: Effect.fn("GitHubIssueProvider.linkedIssues")(function* (input) {
      const links: ChangeRequestIssueLink[] = [];
      let after: string | undefined;
      do {
        const result = yield* client
          .ChangeRequestIssueLinks({ ...variables(input), ...(after ? { after } : {}) })
          .pipe(call(input, "linkedIssues"));
        const pr = result.repository?.pullRequest;
        if (pr == null) return yield* missing("linkedIssues");
        for (const issue of nodes(pr.closingIssuesReferences?.nodes))
          links.push({
            issue: issueSummary(input.host, issue),
            changeRequest: prSummary(input.host, pr),
            kind: "closes",
          });
        after = pr.closingIssuesReferences?.pageInfo.hasNextPage
          ? (pr.closingIssuesReferences.pageInfo.endCursor ?? undefined)
          : undefined;
      } while (after);
      do {
        const result = yield* client
          .ChangeRequestIssueMentions({ ...variables(input), ...(after ? { after } : {}) })
          .pipe(call(input, "linkedIssues"));
        const pr = result.repository?.pullRequest;
        if (pr == null) return yield* missing("linkedIssues");
        for (const event of nodes(pr.timelineItems.nodes))
          if (event.__typename === "CrossReferencedEvent" && event.source.__typename === "Issue")
            links.push({
              issue: issueSummary(input.host, event.source),
              changeRequest: prSummary(input.host, pr),
              kind: "mentions",
            });
        after = pr.timelineItems.pageInfo.hasNextPage
          ? (pr.timelineItems.pageInfo.endCursor ?? undefined)
          : undefined;
      } while (after);
      return uniqueLinks(links);
    }),
    repositoryLabels: (input) =>
      labels(input).pipe(Effect.map((values) => ({ labels: values.map(label), truncated: false }))),
    labelCandidates: Effect.fn("GitHubIssueProvider.labelCandidates")(function* (input) {
      const { issue } = yield* core(input);
      const applied = new Set(nodes(issue.labels?.nodes).map((l) => l.name));
      return {
        candidates: (yield* labels(input)).map((l) => ({
          ...label(l),
          isApplied: applied.has(l.name),
        })),
        truncated: false,
      };
    }),
    assigneeCandidates: Effect.fn("GitHubIssueProvider.assigneeCandidates")(function* (input) {
      const { issue } = yield* core(input);
      const { owner, name } = variables(input);
      const result = yield* client
        .IssueAssignees({ owner, name, ...(input.query ? { query: input.query } : {}) })
        .pipe(call(input, "assignees"));
      if (result.repository == null) return yield* missing("assignees");
      const assigned = new Set(nodes(issue.assignees.nodes).map((a) => a.id));
      return {
        candidates: nodes(result.repository.assignableUsers.nodes).map((u) => ({
          ...u,
          isAssigned: assigned.has(u.id),
        })),
        truncated: result.repository.assignableUsers.pageInfo.hasNextPage,
      };
    }),
    comment: Effect.fn("GitHubIssueProvider.comment")(function* (input) {
      const { issue } = yield* core(input);
      yield* client
        .IssueAddComment({ id: issue.id, body: input.body })
        .pipe(call(input, "comment"));
    }),
    updateComment: Effect.fn("GitHubIssueProvider.updateComment")(function* (input) {
      const id = yield* validateSubject(input, input.commentId, true);
      yield* client.IssueEditComment({ id, body: input.body }).pipe(call(input, "updateComment"));
    }),
    setReaction: Effect.fn("GitHubIssueProvider.setReaction")(function* (input) {
      const id = input.subjectId
        ? yield* validateSubject(input, input.subjectId, false)
        : (yield* core(input)).issue.id;
      const args = { id, content: gitHubReactionContent(input.content) };
      if (input.reacted) yield* client.IssueAddReaction(args).pipe(call(input, "setReaction"));
      else yield* client.IssueRemoveReaction(args).pipe(call(input, "setReaction"));
    }),
    update: Effect.fn("GitHubIssueProvider.update")(function* (input) {
      if (input.closeReason !== undefined && input.state !== "closed")
        return yield* new IssueOperationError({
          operation: "update",
          detail: i18n.t("issue.closeReasonRequiresClosed"),
        });
      const { issue } = yield* core(input);
      if (input.title !== undefined || input.body !== undefined)
        yield* client
          .IssueEdit({
            id: issue.id,
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.body !== undefined ? { body: input.body } : {}),
          })
          .pipe(call(input, "update"));
      if (input.state === "closed")
        yield* client
          .IssueClose({
            id: issue.id,
            reason: input.closeReason === "not_planned" ? "NOT_PLANNED" : "COMPLETED",
          })
          .pipe(call(input, "close"));
      if (input.state === "open")
        yield* client.IssueReopen({ id: issue.id }).pipe(call(input, "reopen"));
    }),
    setLabels: Effect.fn("GitHubIssueProvider.setLabels")(function* (input) {
      const { issue } = yield* core(input);
      const all = yield* labels(input);
      const ids: string[] = [];
      for (const name of input.labels) {
        const found = all.find((l) => l.name.toLowerCase() === name.toLowerCase());
        if (!found)
          return yield* new IssueOperationError({
            operation: "setLabels",
            detail: i18n.t("issue.labelNotFound", { label: name }),
          });
        ids.push(found.id);
      }
      if (input.applied)
        yield* client.IssueAddLabels({ id: issue.id, ids }).pipe(call(input, "setLabels"));
      else yield* client.IssueRemoveLabels({ id: issue.id, ids }).pipe(call(input, "setLabels"));
    }),
    setAssignees: Effect.fn("GitHubIssueProvider.setAssignees")(function* (input) {
      const { issue } = yield* core(input);
      if (input.assigned)
        yield* client
          .IssueAddAssignees({ id: issue.id, ids: input.assigneeIds })
          .pipe(call(input, "setAssignees"));
      else
        yield* client
          .IssueRemoveAssignees({ id: issue.id, ids: input.assigneeIds })
          .pipe(call(input, "setAssignees"));
    }),
  } satisfies IssueProviderApi;
});
