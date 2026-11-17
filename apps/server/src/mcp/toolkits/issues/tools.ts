import {
  IssueOperationError,
  McpCapabilityUnavailableError,
  OrchestratorMcpEnvironmentTarget,
  OrchestratorMcpFailure,
  RemoteIssueRef,
  ThreadId,
  ThreadLinkedIssue,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as Orchestrator from "../../../orchestration-v2/Orchestrator.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";

const target = {
  environmentId: OrchestratorMcpEnvironmentTarget,
  threadId: Schema.optional(ThreadId),
};
const failure = Schema.Union([
  IssueOperationError,
  McpCapabilityUnavailableError,
  OrchestratorMcpFailure,
]);
const dependencies = [
  McpInvocationContext.McpInvocationContext,
  Orchestrator.OrchestratorV2,
  ThreadManagementService.ThreadManagementService,
];
export const IssuesToolkit = Toolkit.make(
  Tool.make("link_issue", {
    description:
      "Link an existing issue to this thread. Only changes T3 state; does not write to the source control host.",
    parameters: Schema.Struct({ ...target, ...RemoteIssueRef.fields, url: TrimmedNonEmptyString }),
    success: Schema.Struct({ alreadyLinked: Schema.Boolean }),
    failure,
    dependencies,
  })
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
  Tool.make("unlink_issue", {
    description: "Remove an issue link from this thread without changing the issue.",
    parameters: Schema.Struct({ ...target, ...RemoteIssueRef.fields }),
    success: Schema.Struct({ wasLinked: Schema.Boolean }),
    failure,
    dependencies,
  })
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, true)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
  Tool.make("list_thread_issues", {
    description: "List this thread's linked issues and their most recently synced states.",
    parameters: Schema.Struct(target),
    success: Schema.Struct({ issues: Schema.Array(ThreadLinkedIssue) }),
    failure,
    dependencies,
  })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
);
