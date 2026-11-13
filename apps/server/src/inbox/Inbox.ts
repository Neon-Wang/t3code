import {
  AskHumanQuestionId,
  InboxError,
  ThreadId,
  type InboxAnswerAskHumanInput,
  type InboxCloseAskHumanInput,
  type InboxItem,
  type InboxSnapshot,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import { parseAskHumanQuestion } from "./askHuman.ts";

export class Inbox extends Context.Service<
  Inbox,
  {
    readonly subscribe: () => Stream.Stream<InboxSnapshot, InboxError>;
    readonly answerAskHuman: (input: InboxAnswerAskHumanInput) => Effect.Effect<void, InboxError>;
    readonly closeAskHuman: (input: InboxCloseAskHumanInput) => Effect.Effect<void, InboxError>;
  }
>()("t3/inbox/Inbox") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* HostProcess.HomeDirectory;
  const env = yield* HostProcess.Environment;
  const root = env.ASK_HUMAN_HOME ?? path.join(home, ".ask-human");
  const directory = path.join(root, "questions");
  const projects = yield* ProjectStore.ProjectStoreV2;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const processes = yield* ProcessRunner.ProcessRunner;
  const updates = yield* PubSub.sliding<void>({ capacity: 1 });
  const validId = Schema.is(AskHumanQuestionId);
  const readError = (cause: unknown) => new InboxError({ code: "read_failed", cause });

  const source = Stream.unwrap(
    Effect.gen(function* () {
      const cache = new Map<
        string,
        { stamp: string; item: Extract<InboxItem, { source: "ask-human" }> | null }
      >();
      const nativeCache = new Map<string, Extract<InboxItem, { source: "native" }>>();
      // Shells of the threads the inbox shows: ask-human targets and threads with a pending
      // user-input request. `null` marks an ask-human target that no longer exists.
      const shells = new Map<string, OrchestrationV2ThreadShell | null>();
      const dirtyThreads = new Set<string>();
      let askHumanAvailable = false;
      let filesDirty = true;
      let fullScan = true;
      const readFiles = Effect.fn("Inbox.readFiles")(function* () {
        askHumanAvailable = yield* fs.exists(directory).pipe(Effect.mapError(readError));
        if (!askHumanAvailable) {
          cache.clear();
          return;
        }
        const names = (yield* fs.readDirectory(directory).pipe(Effect.mapError(readError)))
          .filter((name) => /^Q-\d{4}-\d{3}\.json$/.test(name))
          .sort();
        const present = new Set(names);
        for (const name of cache.keys()) if (!present.has(name)) cache.delete(name);
        for (const name of names) {
          yield* Effect.gen(function* () {
            const file = path.join(directory, name);
            const info = yield* fs.stat(file);
            const stamp = `${Option.getOrNull(info.mtime)?.getTime()}:${info.size}`;
            if (cache.get(name)?.stamp === stamp) return;
            const text = yield* fs.readFileString(file);
            const item = yield* Effect.try({
              try: () => {
                const parsed = parseAskHumanQuestion(text);
                if (parsed !== null && `${parsed.id}.json` !== name)
                  throw new Error("Question ID does not match filename");
                return parsed;
              },
              catch: readError,
            }).pipe(
              Effect.catch(() =>
                Effect.logWarning("Skipped an invalid ask-human question.", { file: name }).pipe(
                  Effect.as(null),
                ),
              ),
            );
            cache.set(name, { stamp, item });
          }).pipe(
            Effect.catch(() => {
              cache.delete(name);
              return Effect.logWarning("Skipped an unreadable ask-human question.", { file: name });
            }),
          );
        }
      });
      const snapshot = Effect.fn("Inbox.snapshot")(function* () {
        if (filesDirty) {
          filesDirty = false;
          yield* readFiles();
        }
        if (fullScan) {
          // One full read finds requests that were already pending; events keep it current.
          fullScan = false;
          const shell = yield* orchestrator.getShellSnapshot().pipe(Effect.mapError(readError));
          for (const thread of shell.threads) {
            if (thread.pendingRuntimeRequest?.kind === "user_input") {
              shells.set(String(thread.id), thread);
            }
          }
        }
        const askItems = [...cache.values()].flatMap(({ item }) => (item === null ? [] : [item]));
        const askThreadIds = new Set(
          askItems.flatMap((item) => (item.threadId === null ? [] : [item.threadId])),
        );
        for (const id of askThreadIds) if (!shells.has(id)) dirtyThreads.add(id);
        for (const id of dirtyThreads) {
          const thread = yield* orchestrator
            .getThreadShell(ThreadId.make(id))
            .pipe(Effect.mapError(readError));
          shells.set(id, thread !== null && thread.deletedAt === null ? thread : null);
        }
        dirtyThreads.clear();
        for (const [id, thread] of shells) {
          if (!askThreadIds.has(id) && thread?.pendingRuntimeRequest?.kind !== "user_input") {
            shells.delete(id);
          }
        }
        const projectRows = yield* projects.listShells().pipe(Effect.mapError(readError));
        const projectTitles = new Map(projectRows.map((row) => [row.id, row.title]));
        const threadMetadata = (id: string | null): InboxItem["thread"] => {
          const thread = id === null ? null : (shells.get(id) ?? null);
          return thread === null
            ? null
            : {
                id: thread.id,
                title: thread.title,
                projectId: thread.projectId,
                projectTitle: projectTitles.get(thread.projectId) ?? "",
                active:
                  thread.activityRunStatus != null ||
                  ["queued", "preparing", "starting", "running", "waiting"].includes(thread.status),
              };
        };
        const items: InboxItem[] = askItems.map((item) => ({
          ...item,
          thread: threadMetadata(item.threadId),
        }));
        const pendingKeys = new Set<string>();
        for (const thread of shells.values()) {
          const request = thread?.pendingRuntimeRequest;
          if (thread == null || request?.kind !== "user_input") continue;
          const key = `${thread.id}:${request.id}`;
          pendingKeys.add(key);
          let native = nativeCache.get(key);
          if (native === undefined) {
            const records = yield* orchestrator
              .getThreadRecords(thread.id, ["runtimeRequests", "turnItems"], {
                runtimeRequestStatuses: ["pending"],
                turnItemRequestIds: [request.id],
                turnItemTypes: ["user_input_request"],
              })
              .pipe(Effect.mapError(readError));
            const pending = records.runtimeRequests.find(
              (entry) => entry.id === request.id && entry.kind === "user_input",
            );
            const item = records.turnItems.find(
              (entry) => entry.type === "user_input_request" && entry.requestId === request.id,
            );
            if (pending === undefined || item?.type !== "user_input_request") continue;
            native = {
              source: "native",
              threadId: thread.id,
              requestId: request.id,
              createdAt: DateTime.formatIso(request.createdAt),
              blocking: request.blocking !== false,
              questions: item.questions,
              thread: null,
            };
            nativeCache.set(key, native);
          }
          items.push({
            ...native,
            blocking: request.blocking !== false,
            thread: threadMetadata(thread.id),
          });
        }
        for (const key of nativeCache.keys()) if (!pendingKeys.has(key)) nativeCache.delete(key);
        items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        return { askHumanAvailable, items } satisfies InboxSnapshot;
      });
      const watcher = (yield* fs.exists(directory).pipe(Effect.mapError(readError)))
        ? fs.watch(directory).pipe(
            Stream.filter((event) => !event.path.endsWith(".tmp")),
            Stream.tap(() =>
              Effect.sync(() => {
                filesDirty = true;
              }),
            ),
            Stream.map(() => undefined),
            Stream.catch(() =>
              Stream.fromEffect(
                Effect.logWarning(
                  "Inbox file watcher stopped; the ten-second scan remains active.",
                ),
              ),
            ),
          )
        : Stream.empty;
      const timer = Stream.tick("10 seconds").pipe(
        Stream.tap(() =>
          Effect.sync(() => {
            filesDirty = true;
          }),
        ),
      );
      const mutations = Stream.fromPubSub(updates).pipe(
        Stream.tap(() =>
          Effect.sync(() => {
            filesDirty = true;
          }),
        ),
      );
      // Only events that can change a shown item mark their thread for a targeted reread.
      const events = orchestrator.streamDomainEvents.pipe(
        Stream.filter(
          (event) =>
            event.type === "runtime-request.updated" ||
            (event.type === "turn-item.updated" && event.payload.type === "user_input_request") ||
            (shells.has(event.threadId) &&
              (event.type === "run.created" ||
                event.type === "run.updated" ||
                (event.type.startsWith("thread.") &&
                  event.type !== "thread.visited" &&
                  event.type !== "thread.marked-unread"))),
        ),
        Stream.tap((event) =>
          Effect.sync(() => {
            dirtyThreads.add(event.threadId);
            if (event.type === "turn-item.updated" && event.payload.type === "user_input_request") {
              nativeCache.delete(`${event.threadId}:${event.payload.requestId}`);
            }
          }),
        ),
        Stream.map(() => undefined),
        Stream.mapError(readError),
      );
      return Stream.mergeAll([watcher, timer, mutations, events], {
        concurrency: "unbounded",
      }).pipe(
        Stream.debounce("50 millis"),
        Stream.prepend([undefined]),
        Stream.mapEffect(snapshot),
        Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      );
    }),
  );
  const shared = yield* Stream.share(source, { capacity: 1, strategy: "sliding", replay: 1 });

  const mutate = Effect.fn("Inbox.mutate")(function* (id: string, args: readonly string[]) {
    if (!validId(id)) return yield* new InboxError({ code: "invalid_id" });
    if (!(yield* fs.exists(directory).pipe(Effect.mapError(readError))))
      return yield* new InboxError({ code: "unavailable" });
    const readCurrent = fs.readFileString(path.join(directory, `${id}.json`)).pipe(
      Effect.flatMap((text) =>
        Effect.try({ try: () => parseAskHumanQuestion(text), catch: readError }),
      ),
      Effect.mapError(readError),
    );
    if ((yield* readCurrent) === null) return yield* new InboxError({ code: "already_processed" });
    const result = yield* processes
      .run({
        command: path.join(root, "bin", "ask-human"),
        args,
        maxOutputBytes: 16_384,
        timeout: "30 seconds",
      })
      .pipe(Effect.mapError((cause) => new InboxError({ code: "command_failed", cause })));
    yield* PubSub.publish(updates, undefined);
    if (result.code !== 0) {
      const processed = (yield* readCurrent) === null;
      return yield* new InboxError({ code: processed ? "already_processed" : "command_failed" });
    }
  });
  return Inbox.of({
    subscribe: () => shared,
    // Free text goes after `--` or in `--reason=` so argparse never reads a leading dash as a flag.
    answerAskHuman: Effect.fn("Inbox.answerAskHuman")(function* (input) {
      yield* mutate(input.id, ["answer", "--source", "t3", input.id, "--", input.text]);
    }),
    closeAskHuman: Effect.fn("Inbox.closeAskHuman")(function* (input) {
      yield* mutate(input.id, ["close", `--reason=${input.reason}`, input.id]);
    }),
  });
});
export const layer = Layer.effect(Inbox, make);
