import { Atom, AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import * as Cause from "effect/Cause";
import {
  createEnvironmentThreadStateAtoms,
  createEnvironmentThreadDetailAtoms,
} from "@t3tools/client-runtime/state/threads";
import { createThreadVisitTracker } from "@t3tools/client-runtime/state/thread-visits";
import { AuthOrchestrationOperateScope, sessionGrantsScope } from "@t3tools/contracts";
import { localeAtom, translate } from "./locale.js";
import {
  buildThreadFeed,
  createThreadFeedCache,
  deriveThreadFeedPresentation,
  formatItemFullDetail,
} from "../../../apps/mobile/src/lib/threadActivity.ts";
import {
  deriveThreadActivityRun,
  deriveThreadRuntime,
  deriveRunlessWorkStartedAt,
} from "@t3tools/client-runtime/state/thread-execution";
import { resolveThreadWorkingStartedAt } from "@t3tools/client-runtime/state/models";
import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import { turnItemDetailRevision } from "@t3tools/client-runtime/work-log/item-detail";
import {
  createAssetEnvironmentAtoms,
  assetUrlStateFromResult,
} from "@t3tools/client-runtime/state/assets";
import { resolveViewedImageAsset } from "@t3tools/client-runtime/work-log/presentation";

const refKey = (ref) => JSON.stringify([ref.environmentId, ref.threadId]);

export function createThreadDetails({ runtime, registry, lists, catalog, session }) {
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
  return {
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
        presented = deriveThreadFeedPresentation(
          feed,
          latestRun,
          disclosure.runs,
          disclosure.groups,
          resolveThreadWorkingStartedAt({ latestRun, runtime: runtimeState }) ?? runless,
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
        const rows = presented.map((entry) => {
          const row = {
            id: entry.id,
            type: entry.type,
            text: "",
            role: "",
            expanded: false,
            activities: [],
            images: [],
          };
          switch (entry.type) {
            case "message":
              return { ...row, text: entry.message.text, role: entry.message.role };
            case "run-fold":
              return { ...row, text: entry.label, expanded: entry.expanded };
            case "work-toggle":
              return { ...row, text: entry.summary, expanded: entry.expanded };
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
                  const opened = disclosure.activities.has(activity.id);
                  let detail = opened ? (activity.getFullDetail() ?? activity.detail ?? "") : "";
                  let error = "";
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
                      if (result.value.item !== null)
                        detail = formatItemFullDetail(target, result.value.item);
                      else error = "活动详情已不可用";
                    } else if (AsyncResult.isFailure(result))
                      error = translate("mobile.connectionTone.connectionFailed");
                  }
                  return {
                    id: activity.id,
                    title: activity.summary,
                    expandable: activity.canExpand || activity.fetchesDetail,
                    expanded: opened,
                    detail,
                    error,
                    failed: activity.status === "failure",
                  };
                }),
              };
          }
        });
        return {
          title: projection?.thread.title ?? shell?.title ?? translate("inbox.untitledThread"),
          project: project?.title ?? "",
          environment: environment?.target.label ?? "",
          status: state.status,
          rows,
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
