import {
  EventId,
  type KimiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  type ProviderSession,
  RuntimeItemId,
  RuntimeTaskId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Random from "effect/Random";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  ProviderAdapterProcessError,
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { type KimiAdapterShape } from "../Services/KimiAdapter.ts";
import { type EventNdjsonLogger, makeEventNdjsonLogger } from "./EventNdjsonLogger.ts";

const PROVIDER = ProviderDriverKind.make("kimi");

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

interface KimiSessionContext {
  session: ProviderSession;
  readonly stopped: Ref.Ref<boolean>;
  activeTurnId: TurnId | undefined;
  activeProcess: ChildProcessSpawner.ChildProcessHandle | undefined;
  toolCalls: Map<string, { name: string; itemType: "command_execution" | "file_change" | "dynamic_tool_call" }>;
}

export interface KimiAdapterLiveOptions {
  readonly instanceId?: ProviderInstanceId;
  readonly environment?: NodeJS.ProcessEnv;
  readonly nativeEventLogPath?: string;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

const KimiStreamJsonLine = Schema.Union([
  Schema.Struct({
    role: Schema.Literal("assistant"),
    content: Schema.optionalKey(Schema.String),
    tool_calls: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          type: Schema.Literal("function"),
          id: Schema.String,
          function: Schema.Struct({
            name: Schema.String,
            arguments: Schema.optionalKey(Schema.String),
          }),
        }),
      ),
    ),
  }),
  Schema.Struct({
    role: Schema.Literal("tool"),
    tool_call_id: Schema.String,
    content: Schema.String,
  }),
  Schema.Struct({
    role: Schema.Literal("meta"),
    type: Schema.String,
    session_id: Schema.optionalKey(Schema.String),
    command: Schema.optionalKey(Schema.String),
  }),
]);
type KimiStreamJsonLine = typeof KimiStreamJsonLine.Type;

const decodeKimiStreamJsonLine = Schema.decodeUnknownEffect(KimiStreamJsonLine);

function buildEventBase(input: {
  readonly threadId: ThreadId;
  readonly turnId?: TurnId | undefined;
  readonly itemId?: string | undefined;
  readonly createdAt?: string | undefined;
  readonly raw?: unknown;
}): Effect.Effect<
  Pick<
    ProviderRuntimeEvent,
    "eventId" | "provider" | "threadId" | "createdAt" | "turnId" | "itemId" | "raw"
  >
> {
  return Effect.gen(function* () {
    const uuid = yield* Random.nextUUIDv4;
    const createdAt = input.createdAt ?? (yield* nowIso);
    return {
      eventId: EventId.make(uuid),
      provider: PROVIDER,
      threadId: input.threadId,
      createdAt,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.itemId ? { itemId: RuntimeItemId.make(input.itemId) } : {}),
      ...(input.raw !== undefined
        ? {
            raw: {
              source: "kimi.stream-json" as const,
              payload: input.raw,
            },
          }
        : {}),
    };
  });
}

function buildKimiArgs(input: {
  prompt: string;
  sessionId?: string;
  model?: string | undefined;
  attachments?: ReadonlyArray<{ path: string; name: string; mimeType: string }>;
}): Array<string> {
  const args: Array<string> = [];
  if (input.sessionId) {
    args.push("-S", input.sessionId);
  } else {
    args.push("-C");
  }
  if (input.model) {
    args.push("-m", input.model);
  }
  args.push("-p", input.prompt);
  args.push("--output-format", "stream-json");
  return args;
}

function extractThinkingBlocks(text: string): Array<{ content: string; tag: string }> {
  const blocks: Array<{ content: string; tag: string }> = [];
  const patterns = [
    { tag: "thinking", regex: /<thinking>([\s\S]*?)<\/thinking>/g },
    { tag: "think", regex: /<think>([\s\S]*?)<\/think>/g },
  ];
  for (const { tag, regex } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const content = match[1];
      if (content !== undefined) {
        blocks.push({ content: content.trim(), tag });
      }
    }
  }
  return blocks;
}

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}

function toToolLifecycleItemType(
  toolName: string,
): "command_execution" | "file_change" | "dynamic_tool_call" {
  const normalized = toolName.toLowerCase();
  if (
    normalized.includes("bash") ||
    normalized.includes("command") ||
    normalized.includes("shell")
  ) {
    return "command_execution";
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("read")
  ) {
    return "file_change";
  }
  return "dynamic_tool_call";
}

export function makeKimiAdapter(kimiSettings: KimiSettings, options?: KimiAdapterLiveOptions) {
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("kimi");
    const nativeEventLogger =
      options?.nativeEventLogger ??
      (options?.nativeEventLogPath !== undefined
        ? yield* makeEventNdjsonLogger(options.nativeEventLogPath, {
            stream: "native",
          })
        : undefined);
    const managedNativeEventLogger =
      options?.nativeEventLogger === undefined ? nativeEventLogger : undefined;
    const runtimeEvents = yield* Queue.unbounded<ProviderRuntimeEvent>();
    const sessions = new Map<ThreadId, KimiSessionContext>();

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        for (const context of sessions.values()) {
          if (context.activeProcess) {
            yield* Effect.ignore(
              context.activeProcess.kill({ killSignal: "SIGTERM", forceKillAfter: "1 second" }),
            );
          }
        }
        sessions.clear();
        if (managedNativeEventLogger !== undefined) {
          yield* managedNativeEventLogger.close();
        }
      }).pipe(Effect.ensuring(Queue.shutdown(runtimeEvents))),
    );

    const emit = (event: ProviderRuntimeEvent) =>
      Queue.offer(runtimeEvents, event).pipe(Effect.asVoid);

    const ensureSessionContext = (threadId: ThreadId): KimiSessionContext => {
      const session = sessions.get(threadId);
      if (!session) {
        throw new ProviderAdapterSessionNotFoundError({
          provider: PROVIDER,
          threadId,
        });
      }
      if (Ref.getUnsafe(session.stopped)) {
        throw new ProviderAdapterSessionClosedError({
          provider: PROVIDER,
          threadId,
        });
      }
      return session;
    };

    const parseStreamJson = (
      context: KimiSessionContext,
      turnId: TurnId,
      line: string,
    ): Effect.Effect<void, never> =>
      Effect.gen(function* () {
        const parsed = yield* decodeKimiStreamJsonLine(JSON.parse(line)).pipe(Effect.option);
        if (Option.isNone(parsed)) {
          return;
        }

        const event = parsed.value;

        if (event.role === "assistant") {
          if (event.content && event.content.length > 0) {
            const thinkingBlocks = extractThinkingBlocks(event.content);
            for (const block of thinkingBlocks) {
              yield* emit({
                ...(yield* buildEventBase({
                  threadId: context.session.threadId,
                  turnId,
                  raw: event,
                })),
                type: "task.progress",
                payload: {
                  taskId: RuntimeTaskId.make(`kimi-${block.tag}-${turnId}`),
                  description: block.content,
                },
              });
            }

            const strippedContent = stripThinkingBlocks(event.content);
            if (strippedContent.length > 0) {
              yield* emit({
                ...(yield* buildEventBase({
                  threadId: context.session.threadId,
                  turnId,
                  raw: event,
                })),
                type: "content.delta",
                payload: {
                  streamKind: "assistant_text",
                  delta: strippedContent,
                },
              });
            }
          }

          if (event.tool_calls && event.tool_calls.length > 0) {
            for (const toolCall of event.tool_calls) {
              const itemType = toToolLifecycleItemType(toolCall.function.name);
              context.toolCalls.set(toolCall.id, {
                name: toolCall.function.name,
                itemType,
              });

              yield* emit({
                ...(yield* buildEventBase({
                  threadId: context.session.threadId,
                  turnId,
                  itemId: toolCall.id,
                  raw: event,
                })),
                type: "item.started",
                payload: {
                  itemType,
                  status: "inProgress",
                  title: toolCall.function.name,
                  detail: toolCall.function.arguments,
                  data: {
                    toolCallId: toolCall.id,
                    arguments: toolCall.function.arguments,
                  },
                },
              });

              yield* emit({
                ...(yield* buildEventBase({
                  threadId: context.session.threadId,
                  turnId,
                  itemId: toolCall.id,
                  raw: event,
                })),
                type: "item.updated",
                payload: {
                  itemType,
                  title: toolCall.function.name,
                  detail: toolCall.function.arguments,
                  data: {
                    toolCallId: toolCall.id,
                    arguments: toolCall.function.arguments,
                  },
                },
              });
            }
          }
        }

        if (event.role === "tool") {
          const toolInfo = context.toolCalls.get(event.tool_call_id);
          yield* emit({
            ...(yield* buildEventBase({
              threadId: context.session.threadId,
              turnId,
              itemId: event.tool_call_id,
              raw: event,
            })),
            type: "item.completed",
            payload: {
              itemType: toolInfo?.itemType ?? "dynamic_tool_call",
              status: "completed",
              title: toolInfo?.name ?? "Tool",
              detail: event.content,
              data: {
                toolCallId: event.tool_call_id,
                result: event.content,
              },
            },
          });
        }
      }).pipe(Effect.catch(() => Effect.void));

    const runPrompt = (
      context: KimiSessionContext,
      turnId: TurnId,
      prompt: string,
    ): Effect.Effect<void, ProviderAdapterError> =>
      Effect.gen(function* () {
        const args = buildKimiArgs({
          prompt,
          sessionId: context.session.threadId,
          model: kimiSettings.model || undefined,
        });

        const child = yield* spawner
          .spawn(
            ChildProcess.make(kimiSettings.binaryPath, args, {
              cwd: context.session.cwd ?? process.cwd(),
              env: options?.environment ?? process.env,
            }),
          )
          .pipe(
            Effect.scoped,
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: context.session.threadId,
                  detail: `Failed to spawn Kimi Code: ${cause.message ?? String(cause)}`,
                  cause,
                }),
            ),
          );

        context.activeProcess = child;

        yield* emit({
          ...(yield* buildEventBase({
            threadId: context.session.threadId,
            turnId,
          })),
          type: "turn.started",
          payload: {
            model: kimiSettings.model || undefined,
          },
        });

        yield* child.stdout
          .pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.runForEach((line) => {
              if (line.trim().length === 0) return Effect.void;
              return parseStreamJson(context, turnId, line);
            }),
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: context.session.threadId,
                  detail: `Failed to read Kimi Code output: ${cause.message ?? String(cause)}`,
                  cause,
                }),
            ),
          );

        const exitCode = yield* child.exitCode.pipe(
          Effect.map(Number),
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: context.session.threadId,
                detail: `Failed to read Kimi Code exit code: ${cause.message ?? String(cause)}`,
                cause,
              }),
          ),
        );

        context.activeProcess = undefined;

        if (exitCode !== 0 && !Ref.getUnsafe(context.stopped)) {
          return yield* new ProviderAdapterProcessError({
            provider: PROVIDER,
            threadId: context.session.threadId,
            detail: `Kimi Code exited with code ${exitCode}`,
          });
        }

        yield* emit({
          ...(yield* buildEventBase({
            threadId: context.session.threadId,
            turnId,
          })),
          type: "turn.completed",
          payload: {
            state: "completed",
          },
        });
      }).pipe(
        Effect.catch((error: ProviderAdapterError) =>
          Effect.gen(function* () {
            if (!Ref.getUnsafe(context.stopped)) {
              yield* emit({
                ...(yield* buildEventBase({
                  threadId: context.session.threadId,
                  turnId,
                })),
                type: "turn.completed",
                payload: {
                  state: "failed",
                  errorMessage: error instanceof Error ? error.message : String(error),
                },
              });
            }
            return yield* Effect.fail(error);
          }),
        ),
      );

    const shape: KimiAdapterShape = {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "unsupported" },

      startSession: (input) =>
        Effect.gen(function* () {
          const createdAt = yield* nowIso;
          const session: ProviderSession = {
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            status: "ready",
            runtimeMode: input.runtimeMode,
            ...(input.cwd ? { cwd: input.cwd } : {}),
            ...(input.modelSelection?.model ? { model: input.modelSelection.model } : {}),
            threadId: input.threadId,
            createdAt,
            updatedAt: createdAt,
          };

          const context: KimiSessionContext = {
            session,
            stopped: yield* Ref.make(false),
            activeTurnId: undefined,
            activeProcess: undefined,
            toolCalls: new Map(),
          };

          sessions.set(input.threadId, context);

          yield* emit({
            ...(yield* buildEventBase({ threadId: input.threadId })),
            type: "session.started",
            payload: {},
          });

          yield* emit({
            ...(yield* buildEventBase({ threadId: input.threadId })),
            type: "session.state.changed",
            payload: { state: "ready" },
          });

          return session;
        }),

      sendTurn: (input) =>
        Effect.gen(function* () {
          const context = ensureSessionContext(input.threadId);
          const turnId = TurnId.make(yield* Random.nextUUIDv4);
          context.activeTurnId = turnId;

          const updatedAt = yield* nowIso;
          context.session = {
            ...context.session,
            updatedAt,
            status: "running",
            activeTurnId: turnId,
          };

          yield* emit({
            ...(yield* buildEventBase({ threadId: input.threadId, turnId })),
            type: "session.state.changed",
            payload: { state: "running" },
          });

          const prompt = input.input ?? "";
          yield* runPrompt(context, turnId, prompt).pipe(Effect.forkChild);

          return {
            threadId: input.threadId,
            turnId,
          };
        }),

      interruptTurn: (threadId) =>
        Effect.gen(function* () {
          const context = ensureSessionContext(threadId);
          const turnId = context.activeTurnId;
          if (context.activeProcess) {
            yield* Effect.ignore(
              context.activeProcess.kill({ killSignal: "SIGTERM", forceKillAfter: "1 second" }),
            );
          }
          context.activeTurnId = undefined;

          if (turnId) {
            yield* emit({
              ...(yield* buildEventBase({ threadId, turnId })),
              type: "turn.aborted",
              payload: { reason: "User interrupted the turn." },
            });
          }

          yield* emit({
            ...(yield* buildEventBase({ threadId })),
            type: "session.state.changed",
            payload: { state: "ready" },
          });
        }),

      respondToRequest: () => Effect.void,
      respondToUserInput: () => Effect.void,

      stopSession: (threadId) =>
        Effect.gen(function* () {
          const context = sessions.get(threadId);
          if (!context) return;
          yield* Ref.set(context.stopped, true);
          if (context.activeProcess) {
            yield* Effect.ignore(
              context.activeProcess.kill({ killSignal: "SIGTERM", forceKillAfter: "1 second" }),
            );
          }
          sessions.delete(threadId);

          yield* emit({
            ...(yield* buildEventBase({ threadId })),
            type: "session.exited",
            payload: { reason: "Session stopped by user." },
          });
        }),

      listSessions: () =>
        Effect.sync(() =>
          Array.from(sessions.values())
            .filter((ctx) => !Ref.getUnsafe(ctx.stopped))
            .map((ctx) => ctx.session),
        ),

      hasSession: (threadId) =>
        Effect.sync(() => {
          const context = sessions.get(threadId);
          return context !== undefined && !Ref.getUnsafe(context.stopped);
        }),

      readThread: (threadId) =>
        Effect.sync(() => ({
          threadId,
          turns: [],
        })),

      rollbackThread: (threadId) =>
        Effect.sync(() => ({
          threadId,
          turns: [],
        })),

      stopAll: () =>
        Effect.gen(function* () {
          for (const [threadId, context] of sessions) {
            yield* Ref.set(context.stopped, true);
            if (context.activeProcess) {
              yield* Effect.ignore(
                context.activeProcess.kill({ killSignal: "SIGTERM", forceKillAfter: "1 second" }),
              );
            }
            sessions.delete(threadId);
          }
        }),

      streamEvents: Stream.fromQueue(runtimeEvents),
    };

    return shape;
  });
}
