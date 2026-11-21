import {
  AskHumanQuestionId,
  InboxError,
  ThreadId,
  type InboxAnswerAskHumanInput,
  type InboxCloseAskHumanInput,
  type InboxItem,
  type InboxSnapshot,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
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
      const cache = new Map<string, { stamp: string; item: InboxItem | null }>();
      let askHumanAvailable = false;
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
      // Each refresh rereads the few threads the open questions point at, so titles and run
      // state are at most one ten-second scan old without following the event stream.
      const snapshot = Effect.fn("Inbox.snapshot")(function* () {
        yield* readFiles();
        const questions = [...cache.values()].flatMap(({ item }) => (item === null ? [] : [item]));
        const projectRows = yield* projects.listShells().pipe(Effect.mapError(readError));
        const projectTitles = new Map(projectRows.map((row) => [row.id, row.title]));
        const threads = new Map<string, InboxItem["thread"]>();
        for (const id of new Set(questions.flatMap((item) => item.threadId ?? []))) {
          const thread = yield* orchestrator
            .getThreadShell(ThreadId.make(id))
            .pipe(Effect.mapError(readError));
          threads.set(
            id,
            thread === null || thread.deletedAt !== null
              ? null
              : {
                  id: thread.id,
                  title: thread.title,
                  projectId: thread.projectId,
                  projectTitle: projectTitles.get(thread.projectId) ?? "",
                  active:
                    thread.activityRunStatus != null ||
                    ["queued", "preparing", "starting", "running", "waiting"].includes(
                      thread.status,
                    ),
                },
          );
        }
        // Urgent questions first, latest escalation first; then the rest, newest first.
        const sortTime = (item: InboxItem) =>
          Date.parse(item.urgentAt ?? "") || Date.parse(item.createdAt);
        const items = questions
          .map((item) => ({
            ...item,
            thread: item.threadId === null ? null : (threads.get(item.threadId) ?? null),
          }))
          .sort((a, b) => Number(b.urgent) - Number(a.urgent) || sortTime(b) - sortTime(a));
        return { askHumanAvailable, items } satisfies InboxSnapshot;
      });
      const watcher = (yield* fs.exists(directory))
        ? fs.watch(directory).pipe(
            Stream.filter((event) => !event.path.endsWith(".tmp")),
            Stream.map(() => undefined),
            // fs.watch throws synchronously (ENOSPC, a vanished directory), which surfaces as a
            // defect, so catch the whole cause and leave the ten-second scan running.
            Stream.catchCause(() =>
              Stream.fromEffect(
                Effect.logWarning(
                  "Inbox file watcher stopped; the ten-second scan remains active.",
                ),
              ),
            ),
          )
        : Stream.empty;
      const timer = Stream.tick("10 seconds");
      const mutations = Stream.fromPubSub(updates);
      return Stream.mergeAll([watcher, timer, mutations], { concurrency: "unbounded" }).pipe(
        Stream.debounce("50 millis"),
        Stream.prepend([undefined]),
        Stream.mapEffect(snapshot),
        Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      );
    }).pipe(Effect.mapError(readError)),
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
