import { CommandId, ProjectId, ThreadId, ThreadLinkedIssue } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import * as IssueService from "../issue/IssueService.ts";
import * as Orchestrator from "./Orchestrator.ts";
import { forkParked } from "../serverActivation.ts";

const decodeIssueLink = Schema.decodeEffect(Schema.fromJsonString(ThreadLinkedIssue));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const issues = yield* IssueService.IssueService;
  const engine = yield* Orchestrator.OrchestratorV2;
  const random = yield* SecureRandom.SecureRandom;
  const worker = yield* makeDrainableWorker(
    Effect.fn("IssueSyncReactor.sync")(function* (threadId: ThreadId | null) {
      const rows = yield* sql<{
        readonly thread_id: string;
        readonly project_id: string;
        readonly payload_json: string;
      }>`
      SELECT i.thread_id, t.project_id, i.payload_json
      FROM projection_thread_issues i JOIN orchestration_v2_projection_threads t ON t.thread_id = i.thread_id
      WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
        AND (${threadId} IS NULL OR i.thread_id = ${threadId})`;
      for (const row of rows) {
        yield* Effect.gen(function* () {
          const link = yield* decodeIssueLink(row.payload_json);
          const detail = yield* issues.summary({
            projectId: ProjectId.make(row.project_id),
            host: link.host,
            repository: link.repository,
            number: link.number,
          });
          // An unchanged host snapshot need not rewrite the event log every sweep.
          if (
            link.snapshot?.updatedAt === detail.updatedAt &&
            link.snapshot.state === detail.state &&
            link.snapshot.title === detail.title &&
            link.snapshot.closeReason === detail.closeReason
          )
            return;
          yield* engine.dispatch({
            type: "thread.issue.sync",
            commandId: CommandId.make(`issue-sync:${yield* random.uuidV4()}`),
            threadId: ThreadId.make(row.thread_id),
            host: link.host,
            repository: link.repository,
            number: link.number,
            snapshot: {
              title: detail.title,
              state: detail.state,
              closeReason: detail.closeReason,
              updatedAt: detail.updatedAt,
              syncedAt: DateTime.formatIso(yield* DateTime.now),
            },
          });
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("Linked issue sync failed", {
              threadId: row.thread_id,
              error: error._tag,
            }),
          ),
        );
      }
    }),
  );
  const start = Effect.fn("IssueSyncReactor.start")(function* () {
    yield* forkParked(
      Stream.runForEach(engine.streamDomainEvents, (event) =>
        event.type === "thread.issue-linked" ? worker.enqueue(event.threadId) : Effect.void,
      ),
    );
    yield* forkParked(
      Stream.runForEach(issues.subscribeRefreshes.pipe(Stream.drop(1)), () => worker.enqueue(null)),
    );
    yield* forkParked(
      worker
        .enqueue(null)
        .pipe(Effect.andThen(worker.drain), Effect.repeat(Schedule.spaced("5 minutes"))),
    );
  });
  return { start, drain: worker.drain };
});
export class IssueSyncReactor extends Context.Service<
  IssueSyncReactor,
  Effect.Success<typeof make>
>()("t3/orchestration-v2/IssueSyncReactor") {}
export const layer = Layer.effect(IssueSyncReactor, make);
