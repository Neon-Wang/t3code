import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import { scopeThreadRef, scopedThreadKey } from "../environment/index.ts";
import { threadRuntimeIsActive, type EnvironmentThreadShell } from "./models.ts";
import { formatSubagentDisplayTitle } from "./subagentDisplay.ts";

interface WaitingOnItem {
  readonly key: string;
  readonly kind: "agent" | "command" | "monitor" | "task";
  readonly title: string;
  readonly providerInstanceId: string | null;
}

/** Groups working children, including children waiting on work of their own. */
export function activeChildThreadsByParent(threads: ReadonlyArray<EnvironmentThreadShell>) {
  const byParent = new Map<string, EnvironmentThreadShell[]>();
  for (const thread of threads) {
    if (!threadRuntimeIsActive(thread.runtime) && thread.runtime?.status !== "idle") continue;
    const parent =
      thread.lineage.relationshipToParent === "subagent" && thread.lineage.parentThreadId !== null
        ? scopeThreadRef(thread.environmentId, thread.lineage.parentThreadId)
        : thread.delegatedFrom;
    if (!parent) continue;
    const key = scopedThreadKey(parent);
    const siblings = byParent.get(key);
    if (siblings) siblings.push(thread);
    else byParent.set(key, [thread]);
  }
  return byParent;
}

/** Resolves children and completion-holding background work without duplicating subagents. */
export function waitingOn(
  thread: Pick<EnvironmentThreadShell, "pendingBackgroundTasks">,
  children: ReadonlyArray<EnvironmentThreadShell>,
): ReadonlyArray<WaitingOnItem> {
  const items: WaitingOnItem[] = children.map((child) => ({
    key: `thread:${child.environmentId}:${child.id}`,
    kind: "agent",
    title: formatSubagentDisplayTitle(child.title),
    providerInstanceId: child.runtime?.providerInstanceId ?? child.modelSelection.instanceId,
  }));
  const childIds = new Set<string>(children.map((child) => child.id));
  for (const task of thread.pendingBackgroundTasks) {
    if (!backgroundWorkHoldsCompletion([task])) continue;
    if (task.kind === "subagent") {
      if (task.childThreadId !== undefined && childIds.has(task.childThreadId)) continue;
      items.push({
        key: `task:${task.taskId}`,
        kind: "agent",
        title: task.description ?? task.taskId,
        providerInstanceId: task.providerInstanceId ?? null,
      });
      continue;
    }
    items.push({
      key: `task:${task.taskId}`,
      kind: task.kind === "command" ? "command" : task.kind === "monitor" ? "monitor" : "task",
      title: task.description ?? task.command ?? task.taskId,
      providerInstanceId: null,
    });
  }
  return items;
}
