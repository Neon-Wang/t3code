import type {
  OrchestrationV2PlanArtifact,
  OrchestrationV2ThreadProjection,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { threadRuntimeIsActive, type EnvironmentThreadShell } from "./models.ts";

type TodoList = Extract<OrchestrationV2PlanArtifact, { kind: "todo_list" }>;

/** The bounded detail keeps the latest plan even when its timeline row has been paged out. */
export function latestThreadTodo(
  projection: Pick<OrchestrationV2ThreadProjection, "plans" | "runs"> & {
    readonly turnItems: ReadonlyArray<
      Pick<OrchestrationV2TurnItem, "type" | "ordinal"> & { readonly planId?: string }
    >;
  },
): TodoList | null {
  const ordinals = new Map(projection.runs.map((run) => [run.id, run.ordinal]));
  const itemOrdinals = new Map(
    projection.turnItems
      .filter((item) => item.type === "todo_list")
      .map((item) => [item.planId, item.ordinal]),
  );
  let latest: TodoList | null = null;
  let latestOrdinal = -1;
  for (const plan of projection.plans) {
    if (plan.kind !== "todo_list" || plan.status === "superseded") continue;
    const ordinal = plan.runId === null ? -1 : (ordinals.get(plan.runId) ?? -1);
    const itemOrdinal = itemOrdinals.get(plan.id);
    const previousItemOrdinal = latest === null ? undefined : itemOrdinals.get(latest.id);
    if (
      latest === null ||
      ordinal > latestOrdinal ||
      (ordinal === latestOrdinal &&
        (itemOrdinal === undefined ||
          previousItemOrdinal === undefined ||
          itemOrdinal >= previousItemOrdinal))
    ) {
      latest = plan;
      latestOrdinal = ordinal;
    }
  }
  return latest;
}

/** Keep unfinished work visible after a run stops; hide a finished list only once it stops. */
export function visibleThreadTodoProgress(
  thread: Pick<EnvironmentThreadShell, "latestTodo" | "latestRun" | "runtime">,
) {
  const todo = thread.latestTodo ?? null;
  if (todo === null || todo.total === 0) return null;
  const running =
    threadRuntimeIsActive(thread.runtime) ||
    (thread.latestRun !== null &&
      ["queued", "preparing", "starting", "running", "waiting"].includes(thread.latestRun.status));
  return todo.done === todo.total && !running ? null : todo;
}
