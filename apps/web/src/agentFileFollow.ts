import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import { resolveWorkspaceRelativePath } from "@t3tools/shared/path";
import { readToolFileEdits } from "@t3tools/shared/toolFileEdit";

export interface AgentFileEdit {
  /** Identity of the activity that reported it, so a follow fires once per edit. */
  readonly activityId: string;
  /** Workspace-relative and already checked against the workspace root. */
  readonly relativePath: string;
  /** Present when the provider reported whole files, so the line is known. */
  readonly line?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstReportedPath(data: Record<string, unknown> | null): string | null {
  if (!data) {
    return null;
  }
  const files = data.files;
  if (!Array.isArray(files)) {
    return null;
  }
  for (const entry of files) {
    const path = asRecord(entry)?.path;
    if (typeof path === "string" && path.trim().length > 0) {
      return path.trim();
    }
  }
  return null;
}

/**
 * The file the agent most recently finished editing, if it is one this client
 * can open.
 *
 * Only completed tool calls count: an in-flight one has not written anything
 * yet, and following it would move the editor to a file whose contents are
 * still the old ones. Paths that do not resolve inside the workspace are
 * ignored rather than opened — `projects.readFile` deliberately serves absolute
 * host paths, so an agent-reported path must never become an automatic read.
 */
export function latestAgentFileEdit(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  workspaceRoot: string | undefined,
): AgentFileEdit | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "tool.completed") {
      continue;
    }
    const payload = asRecord(activity.payload);
    if (payload?.itemType !== "file_change") {
      continue;
    }
    const data = asRecord(payload.data);
    const edits = readToolFileEdits(data?.edits);
    const edit = edits?.[0];
    const reportedPath = edit?.path ?? firstReportedPath(data);
    if (!reportedPath) {
      continue;
    }
    const relativePath = resolveWorkspaceRelativePath({ path: reportedPath, workspaceRoot });
    if (!relativePath) {
      continue;
    }
    const line = edit?.kind === "span" ? edit.startLine : undefined;
    return { activityId: activity.id, relativePath, ...(line === undefined ? {} : { line }) };
  }
  return null;
}

export interface FollowDecisionInput {
  readonly enabled: boolean;
  readonly edit: AgentFileEdit | null;
  /** The activity id already followed, so one edit never opens twice. */
  readonly lastFollowedActivityId: string | null;
  /** Compact layouts show the panel as a modal sheet; do not steal it. */
  readonly compactLayout: boolean;
  /** A background tab must not do work the user cannot see. */
  readonly documentVisible: boolean;
  /**
   * The open file has unsaved edits. Without a server-side revision check a
   * follow would put the user in a buffer that is about to lose their work to
   * the agent's write, so it is refused until they save.
   */
  readonly openFileDirty: boolean;
}

/** Pure so the rule is testable without mounting the panel. */
export function shouldFollowAgentFileEdit(input: FollowDecisionInput): boolean {
  if (!input.enabled || !input.edit) {
    return false;
  }
  if (input.compactLayout || !input.documentVisible || input.openFileDirty) {
    return false;
  }
  return input.edit.activityId !== input.lastFollowedActivityId;
}
