import { createI18n, type I18n, type MessageKey } from "@t3tools/shared/i18n";

const englishWorkLogTranslator = createI18n({ locale: "en" }).t;

import {
  isToolLifecycleItemType,
  type AssetResource,
  type RuntimeItemStatus,
  type ThreadId,
  type ToolActivitySource,
  type ToolLifecycleItemType,
} from "@t3tools/contracts";
import { classifyMarkdownImageSource } from "@t3tools/client-runtime/markdown-images";
import { resolveMediaSource } from "@t3tools/client-runtime/media-source";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import { isWorkspaceImagePreviewPath } from "@t3tools/shared/filePreview";

/**
 * Activities the worktree setup card already represents. The settled record
 * is rendered by the card on web and mobile, never as a
 * worklog entry, so it is hidden from the activity feed even when it failed.
 */
export function isWorktreeSetupActivity(kind: string): boolean {
  return (
    kind === "setup-script.requested" ||
    kind === "setup-script.started" ||
    kind === "worktree-setup"
  );
}

export type WorkLogToolLifecycleStatus = RuntimeItemStatus | "stopped";

export interface WorkLogPresentationEntry {
  readonly label: string;
  readonly toolTitle?: string;
  readonly toolData?: unknown;
  readonly tone: "thinking" | "tool" | "info" | "error";
  readonly command?: string;
  readonly detail?: string;
  readonly viewedImagePath?: string;
  readonly changedFiles?: ReadonlyArray<string>;
  readonly itemType?: ToolLifecycleItemType;
  readonly requestKind?: string;
  readonly turnId?: string | null;
  readonly toolCallId?: string;
  readonly toolLifecycleStatus?: string;
  readonly sourceActivityKind?: string;
  readonly taskId?: string;
  readonly toolSource?: ToolActivitySource;
}

export type ToolGroupAction =
  | "link-pr"
  | "unlink-pr"
  | "list-prs"
  | "read"
  | "edit"
  | "command"
  | "browser"
  | "device"
  | "code-search"
  | "search"
  | "other"
  | "update";

export type ToolGroupSummaryKind =
  | "pull-request"
  | ToolGroupAction
  | "dynamic-tool"
  | "agent-tool"
  | "tone-tool"
  | "mixed";

export function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

const T3_MCP_TOOL_LABELS: Record<
  string,
  readonly [
    action: MessageKey,
    running: MessageKey,
    completed: MessageKey,
    detail: MessageKey,
    stopped: MessageKey,
  ]
> = {
  link_pull_request: [
    "pr.link",
    "chat.timeline.tools.link_pull_request.running",
    "pr.linked",
    "chat.timeline.tools.link_pull_request.target",
    "chat.timeline.tools.link_pull_request.stopped",
  ],
  unlink_pull_request: [
    "chat.timeline.tools.unlink_pull_request.action",
    "chat.timeline.tools.unlink_pull_request.running",
    "chat.timeline.tools.unlink_pull_request.completed",
    "chat.timeline.tools.link_pull_request.target",
    "chat.timeline.tools.unlink_pull_request.stopped",
  ],
  list_thread_pull_requests: [
    "chat.timeline.tools.list_thread_pull_requests.action",
    "settings.diagnostics.checking",
    "settings.diagnostics.checked",
    "chat.timeline.tools.list_thread_pull_requests.target",
    "chat.timeline.tools.list_thread_pull_requests.stopped",
  ],
  orchestrator_capabilities: [
    "chat.timeline.tools.task_status.action",
    "chat.timeline.tools.task_status.running",
    "chat.timeline.tools.task_status.completed",
    "chat.timeline.tools.orchestrator_capabilities.target",
    "chat.timeline.tools.task_status.stopped",
  ],
  delegate_task: [
    "chat.timeline.tools.delegate_task.action",
    "chat.timeline.tools.delegate_task.running",
    "chat.timeline.tools.delegate_task.completed",
    "chat.timeline.tools.delegate_task.target",
    "chat.timeline.tools.delegate_task.stopped",
  ],
  task_status: [
    "chat.timeline.tools.task_status.action",
    "chat.timeline.tools.task_status.running",
    "chat.timeline.tools.task_status.completed",
    "chat.timeline.tools.task_status.target",
    "chat.timeline.tools.task_status.stopped",
  ],
  task_cancel: [
    "action.cancel",
    "chat.timeline.tools.task_cancel.running",
    "chat.timeline.tools.task_cancel.completed",
    "chat.timeline.tools.task_cancel.target",
    "chat.timeline.tools.task_cancel.stopped",
  ],
  schedule_task: [
    "chat.timeline.tools.schedule_task.action",
    "chat.timeline.tools.schedule_task.running",
    "chat.timeline.tools.schedule_task.completed",
    "chat.timeline.tools.schedule_task.target",
    "chat.timeline.tools.schedule_task.stopped",
  ],
  list_scheduled_tasks: [
    "chat.timeline.tools.device_list.action",
    "chat.timeline.tools.device_list.running",
    "chat.timeline.tools.device_list.completed",
    "chat.timeline.tools.list_scheduled_tasks.target",
    "chat.timeline.tools.device_list.stopped",
  ],
  update_scheduled_task: [
    "chat.view.update",
    "chat.timeline.tools.update_scheduled_task.running",
    "ui.providerUpdateLaunchNotification.logic.updated",
    "chat.timeline.tools.update_scheduled_task.target",
    "chat.timeline.tools.update_scheduled_task.stopped",
  ],
  delete_scheduled_task: [
    "action.delete",
    "chat.timeline.tools.delete_scheduled_task.running",
    "chat.timeline.tools.delete_scheduled_task.completed",
    "chat.timeline.tools.update_scheduled_task.target",
    "chat.timeline.tools.delete_scheduled_task.stopped",
  ],
  create_threads: [
    "chat.timeline.tools.create_threads.action",
    "chat.timeline.tools.create_threads.running",
    "chat.timeline.tools.create_threads.completed",
    "chat.timeline.tools.create_threads.target",
    "chat.timeline.tools.create_threads.stopped",
  ],
  t3_thread_start: [
    "chat.timeline.tools.t3_thread_start.action",
    "device.starting",
    "chat.timeline.tools.t3_thread_start.completed",
    "chat.timeline.tools.t3_thread_read.target",
    "chat.timeline.tools.t3_thread_start.stopped",
  ],
  t3_thread_list: [
    "chat.timeline.tools.device_list.action",
    "chat.timeline.tools.device_list.running",
    "chat.timeline.tools.device_list.completed",
    "chat.timeline.tools.create_threads.target",
    "chat.timeline.tools.device_list.stopped",
  ],
  t3_thread_read: [
    "settings.diagnostics.read",
    "chat.timeline.tools.t3_thread_read.running",
    "chat.timeline.tools.t3_thread_read.completed",
    "chat.timeline.tools.t3_thread_read.target",
    "chat.timeline.tools.t3_thread_read.stopped",
  ],
  t3_thread_send: [
    "device.send",
    "chat.composer.sending",
    "chat.timeline.tools.t3_thread_send.completed",
    "chat.timeline.tools.t3_thread_send.target",
    "chat.timeline.tools.t3_thread_send.stopped",
  ],
  t3_thread_wait: [
    "chat.timeline.tools.t3_thread_wait.action",
    "chat.timeline.tools.t3_thread_wait.running",
    "chat.timeline.tools.t3_thread_wait.completed",
    "chat.timeline.tools.t3_thread_wait.target",
    "chat.timeline.tools.t3_thread_wait.stopped",
  ],
  t3_thread_interrupt: [
    "chat.timeline.tools.t3_thread_interrupt.action",
    "chat.timeline.tools.t3_thread_interrupt.running",
    "chat.timeline.tools.t3_thread_interrupt.completed",
    "chat.timeline.tools.t3_thread_read.target",
    "chat.timeline.tools.t3_thread_interrupt.stopped",
  ],
  t3_worktree_handoff: [
    "chat.timeline.tools.t3_worktree_handoff.action",
    "chat.timeline.tools.t3_worktree_handoff.running",
    "chat.timeline.tools.t3_worktree_handoff.completed",
    "chat.timeline.tools.t3_worktree_handoff.target",
    "chat.timeline.tools.t3_worktree_handoff.stopped",
  ],
  t3_worktree_status: [
    "chat.timeline.tools.task_status.action",
    "chat.timeline.tools.task_status.running",
    "chat.timeline.tools.task_status.completed",
    "chat.timeline.tools.t3_worktree_status.target",
    "chat.timeline.tools.task_status.stopped",
  ],
  preview_status: [
    "chat.timeline.tools.task_status.action",
    "chat.timeline.tools.task_status.running",
    "chat.timeline.tools.task_status.completed",
    "chat.timeline.tools.preview_status.target",
    "chat.timeline.tools.task_status.stopped",
  ],
  preview_open: [
    "action.open",
    "chat.timeline.tools.device_open.running",
    "chat.timeline.tools.device_open.completed",
    "chat.timeline.tools.preview_open.target",
    "chat.timeline.tools.device_open.stopped",
  ],
  preview_navigate: [
    "commandPalette.navigate",
    "chat.timeline.tools.preview_navigate.running",
    "chat.timeline.tools.preview_navigate.completed",
    "chat.timeline.tools.preview_scroll.target",
    "chat.timeline.tools.preview_navigate.stopped",
  ],
  preview_snapshot: [
    "chat.timeline.tools.preview_snapshot.action",
    "chat.timeline.tools.preview_snapshot.running",
    "chat.timeline.tools.preview_snapshot.completed",
    "chat.timeline.tools.preview_snapshot.target",
    "chat.timeline.tools.preview_snapshot.stopped",
  ],
  preview_click: [
    "chat.timeline.tools.preview_click.action",
    "chat.timeline.tools.preview_click.running",
    "chat.timeline.tools.preview_click.completed",
    "chat.timeline.tools.preview_type.target",
    "chat.timeline.tools.preview_click.stopped",
  ],
  preview_press: [
    "chat.timeline.tools.preview_press.action",
    "chat.timeline.tools.preview_press.running",
    "chat.timeline.tools.preview_press.completed",
    "chat.timeline.tools.preview_press.target",
    "chat.timeline.tools.preview_press.stopped",
  ],
  preview_type: [
    "chat.timeline.tools.preview_type.action",
    "chat.timeline.tools.preview_type.running",
    "chat.timeline.tools.preview_type.completed",
    "chat.timeline.tools.preview_type.target",
    "chat.timeline.tools.preview_type.stopped",
  ],
  preview_scroll: [
    "chat.timeline.tools.preview_scroll.action",
    "chat.timeline.tools.preview_scroll.running",
    "chat.timeline.tools.preview_scroll.completed",
    "chat.timeline.tools.preview_scroll.target",
    "chat.timeline.tools.preview_scroll.stopped",
  ],
  preview_resize: [
    "chat.timeline.tools.preview_resize.action",
    "chat.timeline.tools.preview_resize.running",
    "chat.timeline.tools.preview_resize.completed",
    "chat.timeline.tools.preview_scroll.target",
    "chat.timeline.tools.preview_resize.stopped",
  ],
  preview_evaluate: [
    "chat.timeline.tools.preview_evaluate.action",
    "chat.timeline.tools.preview_evaluate.running",
    "chat.timeline.tools.preview_evaluate.completed",
    "chat.timeline.tools.preview_evaluate.target",
    "chat.timeline.tools.preview_evaluate.stopped",
  ],
  preview_wait_for: [
    "chat.timeline.tools.t3_thread_wait.action",
    "chat.timeline.tools.t3_thread_wait.running",
    "chat.timeline.tools.t3_thread_wait.completed",
    "chat.timeline.tools.preview_wait_for.target",
    "chat.timeline.tools.t3_thread_wait.stopped",
  ],
  preview_set_appearance: [
    "device.set",
    "chat.timeline.tools.preview_set_appearance.running",
    "chat.timeline.tools.preview_set_appearance.completed",
    "chat.timeline.tools.preview_set_appearance.target",
    "chat.timeline.tools.preview_set_appearance.stopped",
  ],
  preview_recording_start: [
    "chat.timeline.tools.t3_thread_start.action",
    "device.starting",
    "chat.timeline.tools.t3_thread_start.completed",
    "chat.timeline.tools.preview_recording_stop.target",
    "chat.timeline.tools.t3_thread_start.stopped",
  ],
  preview_recording_stop: [
    "action.stop",
    "chat.timeline.tools.preview_recording_stop.running",
    "agents.stopped",
    "chat.timeline.tools.preview_recording_stop.target",
    "chat.timeline.tools.preview_recording_stop.stopped",
  ],
  device_list: [
    "chat.timeline.tools.device_list.action",
    "chat.timeline.tools.device_list.running",
    "chat.timeline.tools.device_list.completed",
    "chat.timeline.tools.device_list.target",
    "chat.timeline.tools.device_list.stopped",
  ],
  device_open: [
    "action.open",
    "chat.timeline.tools.device_open.running",
    "chat.timeline.tools.device_open.completed",
    "chat.timeline.tools.device_open.target",
    "chat.timeline.tools.device_open.stopped",
  ],
  device_screenshot: [
    "chat.timeline.tools.device_screenshot.action",
    "chat.timeline.tools.device_screenshot.running",
    "chat.timeline.tools.device_screenshot.completed",
    "chat.timeline.tools.device_screenshot.target",
    "chat.timeline.tools.device_screenshot.stopped",
  ],
  device_close: [
    "action.close",
    "chat.timeline.tools.device_close.running",
    "pr.closed",
    "chat.timeline.tools.device_close.target",
    "chat.timeline.tools.device_close.stopped",
  ],
};

const PR_TOOL_ACTIONS: Readonly<Record<string, ToolGroupAction>> = {
  link_pull_request: "link-pr",
  unlink_pull_request: "unlink-pr",
  list_thread_pull_requests: "list-prs",
};

function resolveT3McpToolPresentation(
  value: string | undefined,
  status: string | undefined,
  data?: unknown,
  t: I18n["t"] = englishWorkLogTranslator,
) {
  if (!value) return null;
  const name = normalizeCompactToolLabel(value).replace(
    /^(?:mcp__(?:t3-code|t3_code|t3code)__|(?:t3-code|t3_code|t3code)(?:[.:/]|\s*·\s*))/i,
    "",
  );
  if (!Object.hasOwn(T3_MCP_TOOL_LABELS, name)) return null;

  const [actionKey, runningKey, completedKey, detailKey, stoppedKey] = T3_MCP_TOOL_LABELS[name]!;
  const action = t(actionKey);
  const running = t(runningKey);
  const completed = t(completedKey);
  const detail = t(detailKey);
  const verb =
    status === "inProgress"
      ? running
      : status === "completed"
        ? completed
        : status === "failed"
          ? t("chat.timeline.tools.failedAction", { action: action.toLowerCase() })
          : status === "declined"
            ? t("chat.timeline.tools.declinedAction", { action: action.toLowerCase() })
            : status === "stopped"
              ? t(stoppedKey)
              : running;

  const actionKind = Object.hasOwn(PR_TOOL_ACTIONS, name) ? PR_TOOL_ACTIONS[name] : undefined;
  const payload = asRecord(data);
  const input =
    asRecord(payload?.arguments) ?? asRecord(payload?.input) ?? asRecord(payload?.rawInput);
  const urlTarget = typeof input?.url === "string" ? parseChangeRequestUrl(input.url) : null;
  const number = urlTarget?.number ?? input?.number;
  const target =
    actionKind !== undefined &&
    actionKind !== "list-prs" &&
    typeof number === "number" &&
    Number.isSafeInteger(number) &&
    number > 0
      ? `PR #${number}`
      : detail;
  return {
    displayName: t(
      /^[A-Za-z0-9]/u.test(target)
        ? "chat.timeline.tools.displayReference"
        : "chat.timeline.tools.display",
      { verb, target },
    ),
    icon:
      actionKind !== undefined
        ? ("pull-request" as const)
        : name.startsWith("preview_")
          ? ("browser" as const)
          : name.startsWith("device_")
            ? ("device" as const)
            : ("t3-code" as const),
    ...(actionKind === undefined ? {} : { action: actionKind }),
  };
}

/** Latest live activity stays present-tense unless the call itself failed, declined, or stopped. */
export function liveActivityToolStatus(status: string | undefined, presentTense: boolean) {
  if (status === "failed" || status === "declined" || status === "stopped") return status;
  if (presentTense || status === "inProgress") return "inProgress";
  return "completed";
}

/** Resolves tool identity before choosing labels or icons in either client. */
export function resolveWorkEntryToolPresentation(
  entry: Pick<WorkLogPresentationEntry, "label" | "toolTitle" | "toolData" | "toolLifecycleStatus">,
  fallbackStatus?: "inProgress" | "completed",
  t: I18n["t"] = englishWorkLogTranslator,
) {
  const status = entry.toolLifecycleStatus ?? fallbackStatus;
  const data = entry.toolData;
  if (data !== null && typeof data === "object") {
    if (
      "server" in data &&
      typeof data.server === "string" &&
      "tool" in data &&
      typeof data.tool === "string"
    ) {
      return resolveT3McpToolPresentation(`${data.server}.${data.tool}`, status, data, t);
    }
    if ("toolName" in data && typeof data.toolName === "string") {
      return resolveT3McpToolPresentation(data.toolName, status, data, t);
    }
  }

  return (
    resolveT3McpToolPresentation(entry.toolTitle, status, data, t) ??
    resolveT3McpToolPresentation(entry.label, status, data, t)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function commandResultContent(value: unknown): string | null {
  const direct = nonEmptyString(value);
  if (direct) return direct;

  const directContent = Array.isArray(value) ? value : null;
  const record = asRecord(value);
  const content = record?.content;
  const contentText = nonEmptyString(content);
  if (contentText) return contentText;
  const blocks = directContent ?? (Array.isArray(content) ? content : null);
  if (!blocks) return null;

  const chunks = blocks.flatMap((entry) => {
    const text = nonEmptyString(entry) ?? nonEmptyString(asRecord(entry)?.text);
    return text ? [text] : [];
  });
  return chunks.length > 0 ? chunks.join("\n") : null;
}

/** Returns provider command output before it is formatted for a work-log row. */
export function extractCommandOutputText(dataValue: unknown): string | null {
  const data = asRecord(dataValue);
  const item = asRecord(data?.item);
  const itemResult = asRecord(item?.result);
  const rawOutput = asRecord(data?.rawOutput);
  const outputStreams = [
    nonEmptyString(rawOutput?.stdout),
    nonEmptyString(rawOutput?.stderr),
  ].filter((value): value is string => value !== null);
  const acpContent = Array.isArray(data?.content)
    ? data.content
        .flatMap((entryValue) => {
          const entry = asRecord(entryValue);
          const content = asRecord(entry?.content);
          const text = entry?.type === "content" ? nonEmptyString(content?.text) : null;
          return text ? [text] : [];
        })
        .join("\n")
    : null;

  const candidates = [
    item?.aggregatedOutput,
    itemResult?.content,
    data?.rawOutput,
    rawOutput?.content,
    outputStreams.length > 0 ? outputStreams.join("\n") : null,
    rawOutput?.output,
    acpContent,
    data?.result,
  ];
  for (const candidate of candidates) {
    const text = commandResultContent(candidate);
    if (text) return text;
  }
  return null;
}

/**
 * Ingestion caps tool details at 180 chars and appends "...", so a long command
 * echo no longer equals the command it repeats. Treat a truncated prefix of the
 * command as the same echo.
 */
function textRepeatsCommand(text: string, commands: ReadonlyArray<string | null>): boolean {
  const truncated = text.endsWith("...")
    ? text.slice(0, -3)
    : text.endsWith("\u2026")
      ? text.slice(0, -1)
      : null;
  return commands.some((candidate) => {
    const command = candidate?.trim();
    if (!command) return false;
    if (command === text) return true;
    return (
      truncated !== null &&
      truncated.length > 0 &&
      command.length > truncated.length &&
      command.startsWith(truncated)
    );
  });
}

/**
 * Decides whether a command row's `detail` is a synthetic echo of the command
 * rather than real output. OpenCode stores completed output in `detail` with no
 * other output channel, so plain equality is only treated as synthetic when the
 * payload shape shows the detail came from the command: Codex item metadata,
 * an ACP tool call (`data.toolCallId`, `kind: "execute"`), a Claude tool-name
 * prefix, or no structured command at all.
 */
export function commandDetailRepeatsCommand(input: {
  readonly detail: string;
  readonly command: string | null;
  readonly rawCommand: string | null;
  readonly toolName: unknown;
  readonly data: unknown;
}): boolean {
  const toolName = nonEmptyString(input.toolName)?.trim();
  const detail = input.detail.trim();
  const commands = [input.command, input.rawCommand];
  if (toolName) {
    const prefix = `${toolName}:`;
    if (detail.toLowerCase().startsWith(prefix.toLowerCase())) {
      const unprefixed = detail.slice(prefix.length).trim();
      if (textRepeatsCommand(unprefixed, commands)) return true;
    }
  }

  if (!textRepeatsCommand(detail, commands)) return false;

  const data = asRecord(input.data);
  const item = asRecord(data?.item);
  const itemInput = asRecord(item?.input);
  const itemResult = asRecord(item?.result);
  const hasStructuredCommand = [
    item?.command,
    itemInput?.command,
    itemResult?.command,
    data?.command,
  ].some((value) =>
    Array.isArray(value)
      ? value.some((part) => nonEmptyString(part) !== null)
      : nonEmptyString(value) !== null,
  );
  return (
    !hasStructuredCommand ||
    item !== null ||
    data?.toolCallId !== undefined ||
    nonEmptyString(data?.kind)?.toLowerCase() === "execute"
  );
}

export function workLogEntryIsToolLike(entry: WorkLogPresentationEntry): boolean {
  if (entry.tone === "tool" || entry.tone === "thinking" || entry.tone === "error") return true;
  if (entry.command !== undefined && entry.command.trim().length > 0) return true;
  if (entry.requestKind !== undefined) return true;
  return entry.itemType !== undefined && isToolLifecycleItemType(entry.itemType);
}

/** Maps item and task status to the status shown on a work-log row. */
export function extractWorkLogToolLifecycleStatus(
  payloadValue: unknown,
): WorkLogToolLifecycleStatus | undefined {
  const payload = asRecord(payloadValue);
  switch (payload?.status) {
    case "pending":
    case "running":
    case "waiting":
      return "inProgress";
    case "cancelled":
    case "interrupted":
      return "stopped";
    case "idle":
      // A batch becomes idle when its parent turn ends. Other idle tasks can resume.
      return payload.taskType === "subagent_batch" ? "stopped" : undefined;
    case "inProgress":
    case "completed":
    case "failed":
    case "declined":
    case "stopped":
      return payload.status;
    default:
      return undefined;
  }
}

// Some providers report completion even when the output describes a failure.
function toolDetailTextLooksLikeFailure(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("file not found") ||
    normalized.includes("no files found") ||
    normalized.includes("enoent") ||
    normalized.includes("no such file or directory") ||
    normalized.includes("no such file") ||
    normalized.includes("commandnotfoundexception") ||
    normalized.includes("command not found") ||
    (normalized.includes("cannot find path") && normalized.includes("because it does not exist")) ||
    (normalized.includes("is not recognized") && normalized.includes("the term '")) ||
    normalized.includes("is not recognized as the name of a cmdlet") ||
    normalized.includes("a parameter cannot be found that matches parameter name") ||
    /<exited with exit code\s+[1-9]\d*\s*>/i.test(text) ||
    /exit(?:ed)? with exit code\s+[1-9]\d*/i.test(text) ||
    /exit code\s*[:\s]\s*[1-9]\d*\b/i.test(text)
  );
}

function workEntryIndicatesToolFailureFromOutput(
  entry: WorkLogPresentationEntry,
  includeCommand: boolean,
): boolean {
  if (
    entry.tone === "error" ||
    entry.toolLifecycleStatus === "failed" ||
    entry.toolLifecycleStatus === "declined"
  ) {
    return true;
  }
  if (!workLogEntryIsToolLike(entry)) return false;
  const output = includeCommand
    ? [entry.detail, entry.command].filter(Boolean).join("\n")
    : (entry.detail ?? "");
  return output.length > 0 && toolDetailTextLooksLikeFailure(output);
}

/** Includes legacy activities that stored error output in the command field. */
export function workEntryIndicatesToolFailure(entry: WorkLogPresentationEntry): boolean {
  return workEntryIndicatesToolFailureFromOutput(entry, true);
}

/** Checks rendered output without treating the user's command as an error. */
export function workEntryDisplayIndicatesToolFailure(entry: WorkLogPresentationEntry): boolean {
  return workEntryIndicatesToolFailureFromOutput(entry, false);
}

/** Decides whether the row can show a success marker. */
export function workEntryIndicatesToolSuccess(entry: WorkLogPresentationEntry): boolean {
  return (
    workLogEntryIsToolLike(entry) &&
    !workEntryIndicatesToolFailure(entry) &&
    entry.tone !== "thinking" &&
    entry.toolLifecycleStatus !== "inProgress" &&
    entry.toolLifecycleStatus !== "stopped"
  );
}

function workLogEntryIsLocalCodeSearch(entry: WorkLogPresentationEntry): boolean {
  return (
    entry.itemType === "web_search" &&
    /\bgrep\b/i.test(normalizeCompactToolLabel(entry.toolTitle ?? entry.label))
  );
}

export function toolGroupAction(entry: WorkLogPresentationEntry): ToolGroupAction {
  if (
    entry.sourceActivityKind === "approval.requested" ||
    entry.sourceActivityKind === "approval.resolved" ||
    entry.sourceActivityKind === "provider.approval.respond.failed"
  ) {
    return "update";
  }
  const presentation = resolveWorkEntryToolPresentation(entry);
  if (presentation?.action !== undefined) return presentation.action;
  if (presentation?.icon === "browser") return "browser";
  if (presentation?.icon === "device") return "device";
  if (
    entry.requestKind === "file-read" ||
    entry.itemType === "image_view" ||
    entry.viewedImagePath !== undefined ||
    (entry.itemType === "dynamic_tool_call" &&
      entry.toolTitle?.trim().toLowerCase() === "read file")
  ) {
    return "read";
  }
  if (
    entry.requestKind === "file-change" ||
    entry.itemType === "file_change" ||
    (entry.changedFiles?.length ?? 0) > 0
  ) {
    return "edit";
  }
  if (entry.requestKind === "command" || entry.itemType === "command_execution" || entry.command) {
    return "command";
  }
  if (workLogEntryIsLocalCodeSearch(entry)) return "code-search";
  if (entry.itemType === "web_search") return "search";
  return workLogEntryIsToolLike(entry) ? "other" : "update";
}

export function workEntryViewedImagePath(entry: WorkLogPresentationEntry): string | null {
  const viewedImagePath = entry.viewedImagePath?.trim();
  if (
    viewedImagePath !== undefined &&
    !/[\r\n]/.test(viewedImagePath) &&
    isWorkspaceImagePreviewPath(viewedImagePath)
  ) {
    return viewedImagePath;
  }
  const detail = entry.detail?.trim();
  return toolGroupAction(entry) === "read" &&
    detail !== undefined &&
    !/[\r\n]/.test(detail) &&
    isWorkspaceImagePreviewPath(detail)
    ? detail
    : null;
}

export interface ViewedImageAsset {
  readonly resource: Extract<AssetResource, { readonly _tag: "media-file" }>;
  readonly alt: string;
  readonly srcFragment: string;
}

export function resolveViewedImageAsset(
  source: string,
  input: {
    readonly threadId: ThreadId;
    readonly workspaceRoot?: string | null | undefined;
  },
): ViewedImageAsset | null {
  // A relative path with no known workspace still names a media-file relative
  // to the thread's workspace, so classify against "." and drop the prefix.
  const imageSource = classifyMarkdownImageSource(source, input.workspaceRoot ?? ".");
  if (imageSource._tag !== "WorkspaceFile") return null;
  const resolvedFilePath =
    input.workspaceRoot == null && imageSource.path.startsWith("./")
      ? imageSource.path.slice(2)
      : imageSource.path;

  const media = resolveMediaSource(source, {
    threadId: input.threadId,
    workspaceRoot: input.workspaceRoot,
    resolvedFilePath,
  });
  if (media === null || media.access !== "environment") return null;
  return { resource: media.resource, alt: media.name, srcFragment: media.srcFragment };
}

function toolGroupActionCount(
  action: ToolGroupAction,
  entries: ReadonlyArray<WorkLogPresentationEntry>,
): number {
  if (action !== "edit") return entries.length;

  const changedFiles = new Set<string>();
  let editsWithoutFileDetails = 0;
  for (const entry of entries) {
    if (!entry.changedFiles || entry.changedFiles.length === 0) {
      editsWithoutFileDetails += 1;
      continue;
    }
    for (const file of entry.changedFiles) changedFiles.add(file);
  }
  return changedFiles.size + editsWithoutFileDetails;
}

function toolGroupActionLabel(action: ToolGroupAction, count: number, t: I18n["t"]): string {
  switch (action) {
    case "link-pr":
      return t(
        count === 1
          ? "chat.timeline.tools.group.link-pr.one"
          : "chat.timeline.tools.group.link-pr.many",
        { count },
      );
    case "unlink-pr":
      return t(
        count === 1
          ? "chat.timeline.tools.group.unlink-pr.one"
          : "chat.timeline.tools.group.unlink-pr.many",
        { count },
      );
    case "list-prs":
      return t(
        count === 1
          ? "chat.timeline.tools.group.list-prs.one"
          : "chat.timeline.tools.group.list-prs.many",
        { count },
      );
    case "read":
      return t(
        count === 1 ? "chat.timeline.tools.group.read.one" : "chat.timeline.tools.group.read.many",
        { count },
      );
    case "edit":
      return t(
        count === 1 ? "chat.timeline.tools.group.edit.one" : "chat.timeline.tools.group.edit.many",
        { count },
      );
    case "command":
      return t(
        count === 1
          ? "chat.timeline.tools.group.command.one"
          : "chat.timeline.tools.group.command.many",
        { count },
      );
    case "device":
      return t(
        count === 1
          ? "chat.timeline.tools.group.device.one"
          : "chat.timeline.tools.group.device.many",
        { count },
      );
    case "browser":
      return t(
        count === 1
          ? "chat.timeline.tools.group.browser.one"
          : "chat.timeline.tools.group.browser.many",
        { count },
      );
    case "search":
      return t(
        count === 1
          ? "chat.timeline.tools.group.search.one"
          : "chat.timeline.tools.group.search.many",
        { count },
      );
    case "code-search":
      return t(
        count === 1
          ? "chat.timeline.tools.group.code-search.one"
          : "chat.timeline.tools.group.code-search.many",
        { count },
      );
    case "other":
      return t(
        count === 1
          ? "chat.timeline.tools.group.other.one"
          : "chat.timeline.tools.group.other.many",
        { count },
      );
    case "update":
      return t(
        count === 1
          ? "chat.timeline.tools.group.update.one"
          : "chat.timeline.tools.group.update.many",
        { count },
      );
  }
}

export function summarizeToolGroup(
  entries: ReadonlyArray<WorkLogPresentationEntry>,
  t: I18n["t"] = englishWorkLogTranslator,
): string {
  const summaryEntries = omitSupersededLifecycleMarkers(entries, (entry) => entry);
  const sources = new Map<string, ToolActivitySource>();
  const groupedEntries = new Map<ToolGroupAction, WorkLogPresentationEntry[]>();
  for (const entry of summaryEntries) {
    if (entry.toolSource && resolveWorkEntryToolPresentation(entry)?.icon !== "pull-request") {
      sources.set(entry.toolSource.key, entry.toolSource);
      continue;
    }
    const action = toolGroupAction(entry);
    const group = groupedEntries.get(action);
    if (group) group.push(entry);
    else groupedEntries.set(action, [entry]);
  }
  const labels = [...groupedEntries].map(([action, actionEntries]) =>
    toolGroupActionLabel(action, toolGroupActionCount(action, actionEntries), t),
  );
  if (sources.size > 0) {
    const sourceValues = [...sources.values()];
    const sourceNames = sourceValues.map((source) => source.name);
    const formattedNames =
      sourceNames.length < 2
        ? sourceNames[0]!
        : sourceNames.length === 2
          ? sourceNames.join(t("chat.timeline.tools.and"))
          : t("chat.timeline.tools.listLast", {
              items: sourceNames.slice(0, -1).join(", "),
              last: sourceNames.at(-1)!,
            });
    const allIntegrations = sourceValues.every((source) => source.kind === "integration");
    labels.unshift(
      t(
        allIntegrations
          ? sources.size === 1
            ? "chat.timeline.tools.usedIntegration"
            : "chat.timeline.tools.usedIntegrations"
          : "chat.timeline.tools.usedSource",
        { names: formattedNames },
      ),
    );
  }
  const sentenceLabels = labels.map((label, index) =>
    index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1),
  );
  if (sentenceLabels.length < 2) return sentenceLabels[0] ?? "";
  if (sentenceLabels.length === 2) return sentenceLabels.join(t("chat.timeline.tools.and"));
  return t("chat.timeline.tools.listLast", {
    items: sentenceLabels.slice(0, -1).join(", "),
    last: sentenceLabels.at(-1)!,
  });
}

export function omitSupersededLifecycleMarkers<T>(
  entries: readonly T[],
  workEntryFor: (entry: T) => WorkLogPresentationEntry,
): T[] {
  const laterTerminalIdentities = new Set<string>();
  const reversedEntries: T[] = [];

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const workEntry = workEntryFor(entry);
    const normalizedLabel = normalizeCompactToolLabel(workEntry.toolTitle ?? workEntry.label);
    const identity = [
      workEntry.turnId ?? "no-turn",
      workEntry.itemType ?? "",
      normalizedLabel,
    ].join("\u001f");
    const activityKind = workEntry.sourceActivityKind;
    const isStatuslessIdlessMarker =
      workEntry.toolCallId === undefined &&
      workEntry.toolLifecycleStatus === undefined &&
      (activityKind === "tool.started" || activityKind === "tool.updated");
    if (isStatuslessIdlessMarker && laterTerminalIdentities.has(identity)) continue;

    reversedEntries.push(entry);
    if (
      activityKind === "tool.completed" ||
      (workEntry.toolLifecycleStatus !== undefined &&
        workEntry.toolLifecycleStatus !== "inProgress")
    ) {
      laterTerminalIdentities.add(identity);
    }
  }

  // Hermes lacks toReversed; this array is local, so reversing it cannot mutate the input.
  // oxlint-disable-next-line unicorn/no-array-reverse
  return reversedEntries.reverse();
}

export function toolGroupSummaryKind(
  entries: ReadonlyArray<WorkLogPresentationEntry>,
): ToolGroupSummaryKind {
  if (
    entries.length > 0 &&
    entries.every((entry) => resolveWorkEntryToolPresentation(entry)?.icon === "pull-request")
  )
    return "pull-request";
  const actions = new Set(entries.map(toolGroupAction));
  if (actions.size !== 1) return "mixed";

  const action = actions.values().next().value!;
  if (action !== "other") return action;

  const fallbackKinds = new Set(
    entries.map((entry): ToolGroupSummaryKind => {
      if (entry.itemType === "mcp_tool_call") return "other";
      if (entry.itemType === "dynamic_tool_call") return "dynamic-tool";
      if (entry.itemType === "collab_agent_tool_call" || entry.taskId) return "agent-tool";
      if (entry.tone === "thinking") return "agent-tool";
      if (entry.tone === "tool") return "tone-tool";
      return "other";
    }),
  );
  return fallbackKinds.size === 1 ? fallbackKinds.values().next().value! : "mixed";
}
