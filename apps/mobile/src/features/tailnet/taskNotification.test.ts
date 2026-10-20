import { describe, expect, it } from "@effect/vitest";
import { RunId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import { changedTaskNotification } from "./taskNotification";

type ObservedTask = Pick<
  OrchestrationV2ThreadShell,
  "status" | "latestRunId" | "pendingRuntimeRequest"
>;
const running: ObservedTask = {
  status: "running",
  latestRunId: RunId.make("test-run"),
  pendingRuntimeRequest: null,
};

describe("background task notifications", () => {
  it("does not replay completed history on first sync", () => {
    expect(changedTaskNotification(undefined, { ...running, status: "completed" })).toBeNull();
  });
  it("notifies once when the observed run finishes", () => {
    const completed: ObservedTask = { ...running, status: "completed" };
    expect(changedTaskNotification(running, completed)?.message).toBe("任务已完成");
    expect(changedTaskNotification(completed, completed)).toBeNull();
  });
  it("keeps progress and cancellations quiet", () => {
    for (const status of ["running", "waiting", "queued", "cancelled", "interrupted"] as const) {
      expect(changedTaskNotification(running, { ...running, status })).toBeNull();
    }
  });
  it("notifies failures without exposing provider error text", () => {
    expect(changedTaskNotification(running, { ...running, status: "failed" })).toEqual({
      id: "test-run:failed",
      message: "任务执行失败，请查看详情",
    });
  });
});
