import { i18n } from "@t3tools/shared/i18n";
import * as C from "@t3tools/contracts";
import type {
  IssueProviderApi,
  IssueProviderError,
} from "@t3tools/source-control-core/server/IssueProvider";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Option from "effect/Option";
import * as ProjectService from "../project/ProjectService.ts";
import * as PullRequestService from "../pullRequest/PullRequestService.ts";
import * as PullRequestReadCache from "../pullRequest/PullRequestReadCache.ts";
import * as BuiltInDrivers from "../sourceControl/builtInDrivers.ts";
import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";

const cacheKey = (parts: ReadonlyArray<unknown>) => JSON.stringify(parts);

const isIssueOperationError = Schema.is(C.IssueOperationError);
const isIssueUnavailableError = Schema.is(C.IssueUnavailableError);
const isPullRequestUnavailableError = Schema.is(C.PullRequestUnavailableError);
const isPullRequestOperationError = Schema.is(C.PullRequestOperationError);
const IssueSummary = C.ThreadIssueSnapshot.mapFields(
  ({ title, state, closeReason, updatedAt }) => ({ title, state, closeReason, updatedAt }),
);

const errorOf = (operation: string, error: unknown): IssueProviderError =>
  isIssueOperationError(error) || isIssueUnavailableError(error)
    ? error
    : isPullRequestUnavailableError(error)
      ? new C.IssueUnavailableError({
          reason: error.reason,
          ...(error.provider ? { provider: error.provider } : {}),
          ...(error.requirement ? { requirement: error.requirement } : {}),
        })
      : new C.IssueOperationError({
          operation,
          detail: isPullRequestOperationError(error)
            ? error.detail
            : i18n.t("issue.failed", { operation }),
        });

export const make = Effect.gen(function* () {
  const projects = yield* ProjectService.ProjectService;
  const pullRequests = yield* PullRequestService.PullRequestService;
  const drivers = yield* BuiltInDrivers.SourceControlDrivers;
  const cache = yield* PullRequestReadCache.PullRequestReadCache;
  const refreshes = yield* SubscriptionRef.make(0);
  const route = Effect.fn("IssueService.route")(function* (ref: C.IssueRef) {
    if (!/^[^/\s]+\/[^/\s]+$/u.test(ref.repository))
      return yield* new C.IssueOperationError({
        operation: "route",
        detail: i18n.t("issue.repositoryFormat"),
      });
    const context = yield* pullRequests
      .routing(ref)
      .pipe(Effect.mapError((e) => errorOf("route", e)));
    const api = drivers.find((entry) => entry.driver.kind === context.provider)?.instance.issues;
    if (api === undefined)
      return yield* new C.IssueUnavailableError({
        reason: "provider-unsupported",
        provider: context.provider,
      });
    return { api, context };
  });
  const scopeOf = (ref: C.IssueRef) =>
    `issues:${ref.host ?? ""}:${ref.repository.toLowerCase()}:${ref.number}`;
  const invalidateResolved = Effect.fn("IssueService.invalidateResolved")(function* (
    input: C.IssueInvalidateInput,
  ) {
    yield* cache.invalidate(input.reference ? scopeOf(input.reference) : "issues");
    yield* SubscriptionRef.update(refreshes, (n) => n + 1);
  });
  const invalidate = Effect.fn("IssueService.invalidate")(function* (
    input: C.IssueInvalidateInput,
  ) {
    if (!input.reference) return yield* invalidateResolved({});
    const { context } = yield* route(input.reference);
    yield* invalidateResolved({ reference: { ...input.reference, host: context.host } });
  });
  const read = <A, I>(
    schema: Schema.Codec<A, I>,
    operation: string,
    ref: C.IssueRef,
    lookup: (
      api: IssueProviderApi,
      context: C.PullRequestRoutingResult,
    ) => Effect.Effect<A, IssueProviderError>,
  ) =>
    pullRequests
      .withRoutingCredential(
        ref,
        Effect.gen(function* () {
          const { api, context } = yield* route(ref);
          const fingerprint = yield* SourceControlRateLimit.CredentialScope;
          const key = cacheKey([
            "issues",
            operation,
            context.host,
            context.accountId,
            fingerprint,
            ref,
          ]);
          const codec = Schema.fromJsonString(schema);
          const encoded = lookup(api, context).pipe(
            Effect.flatMap(Schema.encodeEffect(codec)),
            Effect.mapError(
              (e) =>
                new C.PullRequestOperationError({
                  operation,
                  detail: errorOf(operation, e).message,
                }),
            ),
          );
          return yield* cache
            .get(key, encoded, ["issues", scopeOf({ ...ref, host: context.host })])
            .pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(codec)),
              Effect.mapError((e) => errorOf(operation, e)),
            );
        }),
      )
      .pipe(Effect.mapError((e) => errorOf(operation, e)));
  const detail = (input: C.IssueRef) =>
    read(C.IssueDetail, "detail", input, (api, context) =>
      api.detail({ ...input, host: context.host, cwd: context.workspaceRoot }).pipe(
        Effect.map((value) => ({
          ...value,
          projectId: input.projectId,
          projectTitle: context.projectTitle,
          workspaceRoot: context.workspaceRoot,
        })),
      ),
    );
  const summary = (input: C.IssueRef) =>
    read(IssueSummary, "summary", input, (api, context) =>
      api.summary({ ...input, host: context.host, cwd: context.workspaceRoot }),
    );
  const activity = (input: C.IssueActivityInput) =>
    read(C.IssueActivity, "activity", input, (api, context) =>
      api.activity({
        ...input,
        host: context.host,
        cwd: context.workspaceRoot,
        viewer: context.viewer,
      }),
    );
  const labelCandidates = (input: C.IssueCandidatesInput) =>
    read(C.PullRequestLabelCandidateList, "labelCandidates", input, (api, context) =>
      api.labelCandidates({ ...input, host: context.host, cwd: context.workspaceRoot }),
    );
  const assigneeCandidates = (input: C.IssueCandidatesInput) =>
    read(C.IssueAssigneeCandidateList, "assigneeCandidates", input, (api, context) =>
      api.assigneeCandidates({ ...input, host: context.host, cwd: context.workspaceRoot }),
    );
  const projectRef = Effect.fn("IssueService.projectRef")(function* (
    projectId: C.ProjectId,
    host?: string,
  ) {
    const project = yield* projects
      .getShell(projectId)
      .pipe(Effect.mapError((e) => errorOf("project", e)));
    if (Option.isNone(project))
      return yield* new C.IssueOperationError({
        operation: "project",
        detail: i18n.t("issue.projectNotFound"),
      });
    const repository = sourceControlDefinitions.repositorySelector(
      project.value.repositoryIdentity,
    );
    if (repository === null)
      return yield* new C.IssueOperationError({
        operation: "project",
        detail: i18n.t("issue.projectHasNoRepository"),
      });
    return { projectId, repository, number: 1, ...(host ? { host } : {}) };
  });
  const list = Effect.fn("IssueService.list")(function* (
    input: C.IssueListInput,
  ): Effect.fn.Return<C.IssueListResult, IssueProviderError> {
    const selected = yield* projects
      .listShells(
        input.projectId
          ? { projectIds: [input.projectId] }
          : input.projectIds
            ? { projectIds: input.projectIds }
            : undefined,
      )
      .pipe(Effect.mapError((e) => errorOf("list", e)));
    const result: {
      viewers: Record<string, string>;
      providers: C.IssueListResult["providers"][number][];
      entries: C.IssueListEntry[];
      errors: C.IssueListResult["errors"][number][];
      truncated: boolean;
      nextCursors: Record<string, string>;
    } = { viewers: {}, providers: [], entries: [], errors: [], truncated: false, nextCursors: {} };
    const seen = new Set<string>();
    for (const project of selected) {
      const identity = project.repositoryIdentity;
      const repository = sourceControlDefinitions.repositorySelector(identity);
      if (!identity || !repository || !identity.provider) continue;
      const host = sourceControlDefinitions.changeRequestHost(identity, identity.provider);
      if (input.host && input.host !== host) continue;
      const key = `${host}/${repository.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const supported =
        drivers.find((entry) => entry.driver.kind === identity.provider)?.instance.issues !==
        undefined;
      if (!result.providers.some((p) => p.host === host))
        result.providers.push({ host, kind: identity.provider, supported });
      if (!supported) continue;
      const ref = { projectId: project.id, host, repository, number: 1 };
      const pageSchema = Schema.Struct({
        entries: Schema.Array(C.IssueListEntry),
        nextCursor: Schema.NullOr(Schema.String),
        viewer: Schema.String,
      });
      const page = yield* read(pageSchema, cacheKey(["list", input]), ref, (api, context) =>
        api
          .list({
            ...input,
            ...ref,
            cwd: context.workspaceRoot,
            host: context.host,
            viewer: context.viewer,
            ...(input.cursors?.[key] ? { cursor: input.cursors[key] } : {}),
          })
          .pipe(
            Effect.map((page) => ({
              ...page,
              viewer: context.viewer,
              entries: page.entries.map((entry) => ({
                ...entry,
                projectId: project.id,
                projectTitle: project.title,
              })),
            })),
          ),
      ).pipe(Effect.result);
      if (page._tag === "Failure") {
        result.errors.push({
          projectId: project.id,
          projectTitle: project.title,
          message: page.failure.message,
        });
        continue;
      }
      result.viewers[host] = page.success.viewer;
      result.entries.push(...page.success.entries);
      if (page.success.nextCursor) {
        result.truncated = true;
        result.nextCursors[key] = page.success.nextCursor;
      }
    }
    result.entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return result;
  });
  const filterOptions = Effect.fn("IssueService.filterOptions")(function* (
    input: C.IssueFilterOptionsInput,
  ) {
    const ref = yield* projectRef(input.projectId, input.host);
    if (input.kind === "labels")
      return yield* read(
        C.IssueFilterOptions,
        cacheKey(["filterOptions", input]),
        ref,
        (api, context) =>
          api
            .repositoryLabels({
              repository: ref.repository,
              host: context.host,
              cwd: context.workspaceRoot,
              ...(input.query ? { query: input.query } : {}),
            })
            .pipe(Effect.map((value) => ({ ...value, authors: [] }))),
      );
    const page = yield* list({
      projectId: input.projectId,
      ...(input.host ? { host: input.host } : {}),
      state: "all",
      limit: 100,
    });
    if (page.errors.length > 0)
      return yield* new C.IssueOperationError({
        operation: "filterOptions",
        detail: page.errors[0]!.message,
      });
    return {
      labels: [],
      authors: [
        ...new Map(
          page.entries.flatMap((entry) =>
            entry.author &&
            (!input.query || entry.author.login.toLowerCase().includes(input.query.toLowerCase()))
              ? [[entry.author.login, entry.author] as const]
              : [],
          ),
        ).values(),
      ],
      truncated: page.truncated,
    };
  });
  const write = <A extends C.IssueRef>(
    operation: string,
    input: A,
    run: (
      api: IssueProviderApi,
      input: A & { host: string; cwd: string },
    ) => Effect.Effect<void, IssueProviderError>,
  ) =>
    pullRequests
      .withRoutingCredential(
        input,
        Effect.gen(function* () {
          const { api, context } = yield* route(input);
          // A write can partially succeed, so its reads must also be invalidated on failure.
          yield* run(api, { ...input, host: context.host, cwd: context.workspaceRoot }).pipe(
            Effect.ensuring(invalidateResolved({})),
          );
        }),
      )
      .pipe(Effect.mapError((e) => errorOf(operation, e)));
  return {
    list,
    summary,
    detail,
    activity,
    filterOptions,
    labelCandidates,
    assigneeCandidates,
    invalidate,
    subscribeRefreshes: SubscriptionRef.changes(refreshes),
    comment: (input: C.IssueCommentInput) =>
      write("comment", input, (api, input) => api.comment(input)),
    updateComment: (input: C.IssueCommentUpdateInput) =>
      write("updateComment", input, (api, input) => api.updateComment(input)),
    setReaction: (input: C.IssueReactionInput) =>
      write("setReaction", input, (api, input) => api.setReaction(input)),
    update: (input: C.IssueUpdateInput) =>
      write("update", input, (api, input) => api.update(input)),
    setLabels: (input: C.IssueLabelChangeInput) =>
      write("setLabels", input, (api, input) => api.setLabels(input)),
    setAssignees: (input: C.IssueAssigneeChangeInput) =>
      write("setAssignees", input, (api, input) => api.setAssignees(input)),
  };
});
export class IssueService extends Context.Service<IssueService, Effect.Success<typeof make>>()(
  "t3/issue/IssueService",
) {}
export const layer = Layer.effect(IssueService, make);
