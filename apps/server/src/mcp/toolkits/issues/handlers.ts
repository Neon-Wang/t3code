import { i18n } from "@t3tools/shared/i18n";
import {
  CommandId,
  IssueOperationError,
  type RemoteIssueRef,
  type ThreadId,
  type ThreadLinkedIssue,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { IssuesToolkit } from "./tools.ts";

const make = Effect.gen(function* () {
  const engine = yield* Orchestrator.OrchestratorV2;
  const random = yield* SecureRandom.SecureRandom;
  const failure = (operation: string) =>
    new IssueOperationError({
      operation,
      detail: i18n.t("issue.threadOperationFailed", { operation }),
    });
  const threadOf = Effect.fn("IssuesToolkit.threadOf")(function* (threadId: ThreadId | undefined) {
    const scope = yield* McpInvocationContext.requireMcpCapability("pull-requests");
    const id = threadId ?? scope.thread?.threadId;
    if (id === undefined)
      return yield* new IssueOperationError({
        operation: "thread",
        detail: i18n.t("issue.threadRequired"),
      });
    const thread = yield* engine.getThreadShell(id).pipe(Effect.mapError(() => failure("read")));
    if (thread === null || thread.deletedAt !== null) return yield* failure("read");
    return thread;
  });
  const matches = (input: RemoteIssueRef) => (link: ThreadLinkedIssue) =>
    link.host === input.host.toLowerCase() &&
    link.repository === input.repository.toLowerCase() &&
    link.number === input.number;
  return {
    link_issue: McpToolAccess.writesThreads(
      (input) => [input.threadId],
      (input) =>
        Effect.gen(function* () {
          const thread = yield* threadOf(input.threadId);
          const alreadyLinked = (thread.issues ?? []).some(matches(input));
          if (!alreadyLinked)
            yield* engine
              .dispatch({
                type: "thread.issue.link",
                commandId: CommandId.make(`mcp-issue-link:${yield* random.uuidV4()}`),
                threadId: thread.id,
                host: input.host,
                repository: input.repository,
                number: input.number,
                url: input.url,
                source: "agent",
              })
              .pipe(Effect.mapError(() => failure("link")));
          return { alreadyLinked };
        }),
    ),
    unlink_issue: McpToolAccess.writesThreads(
      (input) => [input.threadId],
      (input) =>
        Effect.gen(function* () {
          const thread = yield* threadOf(input.threadId);
          const wasLinked = (thread.issues ?? []).some(matches(input));
          if (wasLinked)
            yield* engine
              .dispatch({
                type: "thread.issue.unlink",
                commandId: CommandId.make(`mcp-issue-unlink:${yield* random.uuidV4()}`),
                threadId: thread.id,
                host: input.host,
                repository: input.repository,
                number: input.number,
              })
              .pipe(Effect.mapError(() => failure("unlink")));
          return { wasLinked };
        }),
    ),
    list_thread_issues: McpToolAccess.reads((input) =>
      threadOf(input.threadId).pipe(Effect.map((thread) => ({ issues: thread.issues ?? [] }))),
    ),
  } satisfies McpToolAccess.Handlers<typeof IssuesToolkit.tools>;
});
export const layer = McpToolAccess.toLayer(IssuesToolkit, make);
