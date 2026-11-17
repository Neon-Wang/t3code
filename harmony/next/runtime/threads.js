import { createThreadCards } from "./cards.js";
import { stripDisplayedPlanMarkdown } from "@t3tools/shared/proposedPlanText";
import { createComposer } from "./composer.js";
import { Atom, AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import * as Cause from "effect/Cause";
import {
  createEnvironmentThreadStateAtoms,
  createEnvironmentThreadDetailAtoms,
} from "@t3tools/client-runtime/state/threads";
import { createThreadVisitTracker } from "@t3tools/client-runtime/state/thread-visits";
import {
  AuthOrchestrationOperateScope,
  sessionGrantsScope,
  ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE,
} from "@t3tools/contracts";
import { localeAtom, translate } from "./locale.js";
import {
  buildThreadFeed,
  createThreadFeedCache,
  deriveThreadFeedPresentation,
  formatItemFullDetail,
  workEntryRowLabel,
} from "../../../apps/mobile/src/lib/threadActivity.ts";
import {
  deriveThreadActivityRun,
  deriveThreadRuntime,
  deriveRunlessWorkStartedAt,
} from "@t3tools/client-runtime/state/thread-execution";
import { resolveThreadWorkingStartedAt } from "@t3tools/client-runtime/state/models";
import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import {
  turnItemDetailRevision,
  toolCallLines,
  turnItemOutputText,
} from "@t3tools/client-runtime/work-log/item-detail";
import { formatMessageTimestamp } from "../../../apps/mobile/src/features/threads/messageTimestamp.ts";
import {
  createAssetEnvironmentAtoms,
  assetUrlStateFromResult,
} from "@t3tools/client-runtime/state/assets";
import { resolveViewedImageAsset } from "@t3tools/client-runtime/work-log/presentation";

const refKey = (ref) => JSON.stringify([ref.environmentId, ref.threadId]);

export function createThreadDetails({
  runtime,
  registry,
  lists,
  catalog,
  session,
  server,
  context,
  projectCommands,
}) {
  const states = createEnvironmentThreadStateAtoms(runtime);
  const details = createEnvironmentThreadDetailAtoms(states.stateAtom);
  const visits = createThreadVisitTracker({
    threadShellAtom: lists.threads.threadShellAtom,
    visit: lists.commands.visit,
  });
  const subscriptions = new Set();
  const controls = new Map();
  const orchestration = createOrchestrationEnvironmentAtoms(runtime);
  const assets = createAssetEnvironmentAtoms(runtime);
  const run = async (command, ref, input) => {
    const result = await command.run(registry, {
      environmentId: ref.environmentId,
      input: { threadId: ref.threadId, ...input },
    });
    if (result._tag === "Failure")
      throw new Error(translate("mobile.connectionTone.connectionFailed"));
    if (result.value?._tag === "error") throw new Error(result.value.message);
    return result.value;
  };
  const cards = createThreadCards({ registry, lists, details, run });
  const composer = createComposer({ runtime, registry, lists, server, session, context, run });
  return {
    setText(ref, text) {
      composer.text(ref, text);
    },
    subscribe(ref, listener) {
      const expanded = Atom.make({ runs: new Set(), groups: new Set(), activities: new Set() });
      const cache = createThreadFeedCache();
      let presented = [];
      const view = Atom.make((get) => {
        get(localeAtom);
        const result = get(states.stateAtom(ref.environmentId, ref.threadId));
        if (AsyncResult.isFailure(result)) {
          console.error(
            `Harmony thread subscription: ${Cause.pretty(result.cause)
              .replace(/(?:https?|wss?):\/\/\S+/g, "[URL]")
              .replace(/eyJ[\w.-]+/g, "[REDACTED]")}`,
          );
        }
        const state = get(details.stateAtom(ref));
        const projection = Option.getOrNull(state.data);
        const environment = get(catalog.catalogValueAtom).entries.get(ref.environmentId);
        const snapshot = get(lists.commands.snapshotAtom(ref.environmentId));
        const shell = get(lists.threads.threadShellAtom(ref));
        const project = snapshot?.projects.find(
          (row) => row.id === (projection?.thread.projectId ?? shell?.projectId),
        );
        const auth = get(session.sessionStateAtom(ref.environmentId));
        const grant = AsyncResult.getOrElse(auth, () => null);
        const writable =
          auth._tag !== "Failure" &&
          grant !== null &&
          sessionGrantsScope(grant, AuthOrchestrationOperateScope);
        if (writable) get.mount(visits(ref));
        const disclosure = get(expanded);
        const latestRun = projection ? deriveThreadActivityRun(projection) : null;
        const runtimeState = projection ? deriveThreadRuntime(projection) : null;
        const runless = projection ? deriveRunlessWorkStartedAt(projection) : null;
        const feed = buildThreadFeed(get(details.visibleTurnItemsAtom(ref)), {
          attempts: projection?.attempts ?? [],
          nodes: projection?.nodes ?? [],
          checkpointSummaries: get(details.checkpointSummariesAtom(ref)),
          cache,
        });
        const workingSince =
          resolveThreadWorkingStartedAt({ latestRun, runtime: runtimeState }) ?? runless;
        presented = deriveThreadFeedPresentation(
          feed,
          latestRun,
          disclosure.runs,
          disclosure.groups,
          workingSince,
          runless !== null,
          cache,
        );
        const baseUrl =
          Option.getOrNull(environment?.profile ?? Option.none())?.httpBaseUrl ?? null;
        const image = (path) => {
          const target = resolveViewedImageAsset(path, {
            threadId: ref.threadId,
            workspaceRoot: projection?.thread.worktreePath ?? project?.workspaceRoot,
          });
          if (!target) return { path, url: "", status: "Failure" };
          const value = assetUrlStateFromResult(
            get(
              assets.createUrl({
                environmentId: ref.environmentId,
                input: { resource: target.resource },
              }),
            ),
            baseUrl,
          );
          return {
            path,
            url: value._tag === "Success" ? value.url + target.srcFragment : "",
            status: value._tag,
          };
        };
        // Android shows copy and time only under the last reply of a settled run (ThreadFeed.tsx).
        const terminal = new Map();
        for (const entry of presented)
          if (entry.type === "message" && entry.message.role === "assistant" && entry.message.runId)
            terminal.set(entry.message.runId, entry.message.id);
        const unsettledRunId = workingSince ? latestRun?.runId : null;
        const rows = presented.map((entry) => {
          const row = {
            id: entry.id,
            type: entry.type,
            text: "",
            role: "",
            time: "",
            meta: false,
            expanded: false,
            activities: [],
            images: [],
            files: [],
          };
          switch (entry.type) {
            case "message":
              return {
                ...row,
                text: entry.message.text,
                role: entry.message.role,
                time: formatMessageTimestamp(
                  entry.message.role === "user"
                    ? entry.message.createdAt
                    : (entry.message.updatedAt ?? entry.message.createdAt),
                ),
                meta:
                  entry.message.role === "user" ||
                  (terminal.get(entry.message.runId) === entry.message.id &&
                    entry.message.runId !== unsettledRunId &&
                    !entry.message.streaming),
                files: (entry.message.attachments ?? [])
                  .filter((item) => item.type !== "image")
                  .map((item) => item.name),
                images: (entry.message.attachments ?? [])
                  .filter((item) => item.type === "image")
                  .map((item) => {
                    const value = assetUrlStateFromResult(
                      get(
                        assets.createUrl({
                          environmentId: ref.environmentId,
                          input: { resource: { _tag: "attachment", attachmentId: item.id } },
                        }),
                      ),
                      baseUrl,
                    );
                    return {
                      path: item.name,
                      url: value._tag === "Success" ? value.url : "",
                      status: value._tag,
                    };
                  }),
              };
            case "run-fold":
              return { ...row, text: entry.label, expanded: entry.expanded };
            case "work-toggle":
              return { ...row, text: entry.summary.replace(/\*\*/g, ""), expanded: entry.expanded };
            case "thinking":
              return { ...row, text: entry.label ?? translate("mobile.threads.thinking") };
            case "html-render":
              return { ...row, text: `${entry.render.title ?? "HTML"} · 在网页端查看` };
            case "mcp-app":
              return { ...row, text: `${entry.app.title ?? "MCP App"} · 在网页端查看` };
            case "viewed-images":
              return { ...row, images: entry.paths.map(image) };
            case "activity-group":
              return {
                ...row,
                activities: entry.activities.map((activity) => {
                  const item = activity.projectedItem.item;
                  const placeholder =
                    item.type === "secret_request" || item.type === "link_request";
                  const opened = disclosure.activities.has(activity.id);
                  let detail = "";
                  let error = "";
                  let fetched = null;
                  if (opened && activity.fetchesDetail) {
                    const target = activity.projectedItem;
                    const result = get(
                      orchestration.turnItem({
                        environmentId: ref.environmentId,
                        input: {
                          threadId: target.sourceThreadId,
                          itemId: target.sourceItemId,
                          revision: turnItemDetailRevision(target.item),
                        },
                      }),
                    );
                    if (AsyncResult.isSuccess(result)) {
                      if (result.value.item !== null) fetched = result.value.item;
                      else error = "活动详情已不可用";
                    } else if (AsyncResult.isFailure(result))
                      error = translate("mobile.connectionTone.connectionFailed");
                  }
                  // Same split as Android thread-work-log.tsx: the call (command or arguments), then output.
                  const shown = fetched ?? item;
                  const call = !opened
                    ? null
                    : shown.type === "command_execution"
                      ? toolCallLines({ command: shown.input })
                      : shown.type === "dynamic_tool"
                        ? toolCallLines({ args: shown.input })
                        : shown.type === "file_search"
                          ? toolCallLines({ args: { pattern: shown.pattern } })
                          : shown.type === "web_search"
                            ? toolCallLines({ args: { query: shown.patterns?.join(", ") } })
                            : null;
                  const lines = call
                    ? [
                        ...(call.args ?? []).map(([key, value]) => `${key} ${value}`),
                        ...(call.argsText ? [call.argsText] : []),
                      ]
                    : [];
                  if (opened && !call)
                    detail = fetched
                      ? formatItemFullDetail(activity.projectedItem, fetched)
                      : (activity.getFullDetail() ?? activity.detail ?? "");
                  const output = !opened
                    ? ""
                    : shown.type === "file_search" || shown.type === "web_search"
                      ? (turnItemOutputText(shown) ?? "")
                      : fetched
                        ? (turnItemOutputText(fetched) ?? translate("v2.chat.noOutput"))
                        : activity.fetchesDetail && !error
                          ? translate("v2.chat.loadingOutput")
                          : "";
                  return {
                    id: activity.id,
                    icon: item.type === "reasoning" ? "brain" : activity.icon,
                    reasoning: item.type === "reasoning",
                    command: call?.command ?? "",
                    lines,
                    output: output.trimEnd(),
                    exit:
                      call && shown.type === "command_execution" && shown.exitCode
                        ? `${translate("mobile.threads.exit")}${shown.exitCode}`
                        : "",
                    plan:
                      activity.projectedItem.item.type === "proposed_plan"
                        ? stripDisplayedPlanMarkdown(activity.projectedItem.item.markdown)
                        : "",
                    title: placeholder
                      ? `${activity.summary} · 在网页端查看`
                      : (
                          activity.groupStandIn?.label ??
                          workEntryRowLabel(activity.workEntry, opened)
                        ).replace(/\*\*/g, ""),
                    expandable: !placeholder && (activity.canExpand || activity.fetchesDetail),
                    expanded: opened,
                    detail,
                    error,
                    failed: activity.status === "failure",
                    retryRunId:
                      item.type === "error" &&
                      item.failure.code === ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE
                        ? (item.runId ?? "")
                        : "",
                  };
                }),
              };
          }
        });
        return {
          title: projection?.thread.title ?? shell?.title ?? translate("inbox.untitledThread"),
          project: project?.title ?? "",
          workspace: Boolean(projection?.thread.worktreePath ?? project?.workspaceRoot),
          workingSince: workingSince ?? "",
          environment: environment?.target.label ?? "",
          status: state.status,
          rows,
          cards: cards.view(get, ref, shell, writable),
          composer: composer.view(get, ref, projection, shell, writable),
          hasMore: state.history.hasMoreHistory,
          loadingHistory: state.history.loading,
          historyError: state.history.error ?? "",
          error: AsyncResult.isFailure(result)
            ? translate("mobile.connectionTone.connectionFailed")
            : (Option.getOrNull(state.error) ?? ""),
        };
      });
      const release = registry.subscribe(view, (value) => listener(JSON.stringify(value)), {
        immediate: true,
      });
      const unsubscribe = () => {
        release();
        subscriptions.delete(unsubscribe);
        controls.delete(refKey(ref));
      };
      controls.set(refKey(ref), async (action, id) => {
        if (action === "retry-workspace")
          return run(lists.commands.retryWorkspacePreparation, ref, { runId: id });
        if (action === "plan-save") {
          const { activityId, path } = JSON.parse(id);
          const activity = presented
            .flatMap((row) => row.activities ?? [])
            .find((item) => item.id === activityId);
          const plan = activity?.projectedItem.item;
          if (plan?.type !== "proposed_plan") throw new Error("计划已不可用");
          const projection = Option.getOrNull(registry.get(details.stateAtom(ref)).data);
          const project = registry
            .get(lists.commands.snapshotAtom(ref.environmentId))
            ?.projects.find((item) => item.id === projection?.thread.projectId);
          const cwd = projection?.thread.worktreePath ?? project?.workspaceRoot;
          if (!cwd) throw new Error("工作目录不可用");
          const result = await projectCommands.writeFile.run(registry, {
            environmentId: ref.environmentId,
            input: { cwd, relativePath: path, contents: plan.markdown.trimEnd() + "\n" },
          });
          if (result._tag === "Failure") throw new Error("保存计划失败");
          return;
        }
        if (action.startsWith("card:"))
          return cards.action(
            ref,
            action.slice(5),
            id,
            registry.get(lists.threads.threadShellAtom(ref)),
          );
        if (action.startsWith("composer:")) {
          const projection = Option.getOrNull(registry.get(details.stateAtom(ref)).data);
          return composer.action(
            ref,
            action.slice(9),
            id,
            projection,
            registry.get(lists.threads.threadShellAtom(ref)),
          );
        }
        if (action === "earlier") return run(lists.commands.loadEarlierHistory, ref, {});
        const entry = presented.find((row) => row.id === id);
        const field =
          action === "activity" ? "activities" : entry?.type === "run-fold" ? "runs" : "groups";
        const key = field === "runs" ? entry.runId : field === "groups" ? entry.groupId : id;
        const previous = registry.get(expanded);
        const next = new Set(previous[field]);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        registry.set(expanded, { ...previous, [field]: next });
        if (entry?.type === "run-fold" && next.has(key)) {
          for (const workAnchorId of entry.deferredWorkItemIds ?? [])
            await run(lists.commands.loadEarlierHistory, ref, { workAnchorId });
        }
      });
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
    action(ref, action, id) {
      return controls.get(refKey(ref))(action, id);
    },
    dispose() {
      for (const unsubscribe of subscriptions) unsubscribe();
    },
  };
}
