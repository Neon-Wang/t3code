/**
 * 数据模型与 WS 方法名（与 packages/contracts WS_METHODS 对齐，按需扩充）。
 * strict ArkTS：方法名集合用显式类常量（无 "as const"）。
 */

export class WS {
  static readonly serverGetConfig: string = 'server.getConfig';
  static readonly serverProbe: string = 'server.probe';
  static readonly threadsList: string = 'orchestration.subscribeShell';
  static readonly threadStartTurn: string = 'orchestration.dispatchCommand';
  static readonly threadFeed: string = 'orchestration.subscribeThread';
  static readonly projectsListEntries: string = 'projects.listEntries';
  static readonly sourceControlLookupRepository: string = 'sourceControl.lookupRepository';
}

export interface ThreadShell {
  latestTurn?: LatestTurn | null;
  modelSelection?: ModelSelection;
  runtimeMode?: string;
  interactionMode?: string;
  id: string;
  title: string | null;
  state?: string;
  projectId: string;
  archivedAt?: string | null;
  settledAt?: string | null;
  session?: ThreadSession | null;
  worktreePath?: string | null;
  branch?: string | null;
  updatedAt: string | null;
}

export interface EnvironmentInfo {
  environmentId: string;
  label: string;
  capabilities: Record<string, string>;
}

export interface ServerConfig {
  environment: EnvironmentInfo;
  providers: ProviderInfo[];
}

export interface ProjectEntry {
  name: string;
  path: string;
}

export interface SavedSshEnvironment {
  alias: string;
  hostname: string;
  port: number;
  username: string;
  t3PackageSpec: string;
}

export interface ThreadSession {
  status: string;
  activeTurnId?: string | null;
}

export interface ChatAttachment {
  type: string; id: string; name: string; mimeType: string; sizeBytes: number;
}

export interface ChatMessage {
  turnId?: string | null;
  updatedAt?: string;
  attachments?: ChatAttachment[];
  id: string;
  role: string;
  text: string;
  streaming: boolean;
  createdAt?: string;
}

export interface ActivityData {
  command?: string;
}

export interface ActivityPayload {
  requestId?: string;
  requestKind?: string;
  requestType?: string;
  appName?: string;
  options?: ApprovalOption[];
  questions?: InputQuestion[];
  toolCallId?: string;
  status?: string;
  detail?: string;
  title?: string;
  data?: ActivityData;
}

export interface ThreadActivity {
  id: string;
  kind: string;
  summary: string;
  turnId?: string | null;
  createdAt: string;
  payload?: ActivityPayload | null;
}

export interface ApprovalOption {
  decision: string;
  label: string;
}

export interface InputOption {
  label: string;
  description: string;
}

export interface InputQuestion {
  id: string;
  header: string;
  question: string;
  options: InputOption[];
  multiSelect?: boolean;
}

export interface AnswerDraft {
  questionId: string;
  selected: string[];
  custom: string;
}

export interface PendingRequest {
  requestId: string;
  kind: string;
  title: string;
  detail: string;
  options: ApprovalOption[];
  questions: InputQuestion[];
}

export function pendingRequests(activities: ThreadActivity[]): PendingRequest[] {
  const pending: Map<string, PendingRequest> = new Map();
  const sorted = activities.slice().sort((a: ThreadActivity, b: ThreadActivity) => a.createdAt.localeCompare(b.createdAt));
  for (const activity of sorted) {
    const payload = activity.payload;
    const id = payload?.requestId;
    if (!id) continue;
    if (activity.kind === 'approval.resolved' || activity.kind === 'user-input.resolved') {
      pending.delete(id);
      continue;
    }
    if (activity.kind === 'provider.approval.respond.failed' || activity.kind === 'provider.user-input.respond.failed') {
      const detail = (payload?.detail ?? '').toLowerCase();
      if (detail.includes('unknown pending') || detail.includes('stale pending')) pending.delete(id);
      continue;
    }
    if (activity.kind !== 'approval.requested' && activity.kind !== 'user-input.requested') continue;
    const questions: InputQuestion[] = [];
    if (Array.isArray(payload?.questions)) {
      for (const question of payload?.questions ?? []) {
        if (question === null || typeof question.id !== 'string' || typeof question.header !== 'string' ||
          typeof question.question !== 'string' || !Array.isArray(question.options)) continue;
        const parsed: InputQuestion = {
          id: question.id, header: question.header, question: question.question, multiSelect: question.multiSelect === true,
          options: question.options.filter((option: InputOption) => option !== null &&
            typeof option.label === 'string' && typeof option.description === 'string')
        };
        questions.push(parsed);
      }
    }
    if (activity.kind === 'user-input.requested' && questions.length === 0) continue;
    const decisions: string[] = ['accept', 'acceptForSession', 'acceptAlways', 'decline', 'cancel'];
    const supplied = Array.isArray(payload?.options) ? (payload?.options ?? []).filter((option: ApprovalOption) =>
      option !== null && decisions.includes(option.decision) && typeof option.label === 'string' && option.label.length > 0) : [];
    const options: ApprovalOption[] = supplied.length > 0 ? supplied : [
      { decision: 'accept', label: '允许本次' },
      { decision: 'acceptForSession', label: '允许本会话' },
      { decision: 'decline', label: '拒绝' }
    ];
    const request: PendingRequest = {
      requestId: id, kind: activity.kind === 'approval.requested' ? 'approval' : 'input',
      title: payload?.appName ?? payload?.requestKind ?? payload?.requestType ?? '需要你的回答',
      detail: payload?.detail ?? '', options: options, questions: questions
    };
    pending.set(id, request);
  }
  const result: PendingRequest[] = [];
  pending.forEach((request: PendingRequest) => { result.push(request); });
  return result;
}

export function questionAnswers(questions: InputQuestion[], drafts: AnswerDraft[]): Record<string, string | string[]> | null {
  const answers: Record<string, string | string[]> = {};
  for (const question of questions) {
    const draft = drafts.find((entry: AnswerDraft) => entry.questionId === question.id);
    if (draft?.custom.trim()) answers[question.id] = draft.custom.trim();
    else if (draft !== undefined && draft.selected.length > 0) {
      answers[question.id] = question.multiSelect ? draft.selected : draft.selected[0];
    } else return null;
  }
  return answers;
}

export interface TimelineRow {
  turnId?: string | null;
  updatedAt?: string;
  streaming?: boolean;
  depth?: number;
  attachments?: ChatAttachment[];
  id: string;
  kind: string;
  role: string;
  text: string;
  detail: string;
  status: string;
  createdAt: string;
}

export function threadTimeline(messages: ChatMessage[], activities: ThreadActivity[], activeTurnId: string | null): TimelineRow[] {
  const rows: TimelineRow[] = messages.map((message: ChatMessage): TimelineRow => ({
    id: message.id, kind: 'message', role: message.role, text: message.text,
    turnId: message.turnId, updatedAt: message.updatedAt, streaming: message.streaming,
    detail: '', status: '', createdAt: message.createdAt ?? '', attachments: message.attachments ?? []
  }));
  const tools: Map<string, TimelineRow> = new Map();
  for (const activity of activities.slice().sort((a: ThreadActivity, b: ThreadActivity) => a.createdAt.localeCompare(b.createdAt))) {
    if (!activity.kind.startsWith('tool.')) continue;
    const payload = activity.payload;
    const id = `tool:${activity.turnId ?? ''}:${payload?.toolCallId ?? activity.id}`;
    const existing = tools.get(id);
    const status = payload?.status ?? activity.kind;
    const row: TimelineRow = {
      id: id, kind: 'tool', role: 'tool', turnId: activity.turnId,
      text: payload?.data?.command ?? existing?.text ?? payload?.title ?? activity.summary,
      detail: payload?.detail ?? existing?.detail ?? '',
      status: activity.turnId !== activeTurnId && status === 'inProgress' ? '未收到完成状态' : status,
      createdAt: existing?.createdAt ?? activity.createdAt
    };
    tools.set(id, row);
  }
  tools.forEach((row: TimelineRow) => { rows.push(row); });
  return rows.sort((left: TimelineRow, right: TimelineRow) => left.createdAt.localeCompare(right.createdAt));
}

export interface Checkpoint {
  checkpointTurnCount: number;
  status: string;
}

export interface LatestTurn {
  turnId: string;
  state: string;
  requestedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  assistantMessageId?: string | null;
}

// Use user-message boundaries for legacy servers whose messages have no turn ID.
// Never hide an unfinished/error run or discard its output; expansion is a view only.
export function transcriptRows(messages: ChatMessage[], activities: ThreadActivity[], session: ThreadSession | null,
  latest: LatestTurn | null, expanded: string[]): TimelineRow[] {
  const timeline = threadTimeline(messages, activities, session?.activeTurnId ?? null);
  const result: TimelineRow[] = [];
  let start = 0;
  while (start < timeline.length) {
    let end = start + 1;
    while (end < timeline.length && timeline[end].role !== 'user') end++;
    const section = timeline.slice(start, end);
    const user = section[0].role === 'user' ? section.shift() : undefined;
    if (user !== undefined) result.push(user);
    const assistant = section.filter((row: TimelineRow) => row.role === 'assistant');
    const last = assistant[assistant.length - 1];
    const turnId = last?.turnId ?? section.find((row: TimelineRow) => !!row.turnId)?.turnId ?? user?.id ?? section[0]?.id ?? '';
    const turn = latest?.turnId === turnId ? latest : null;
    const final = assistant.find((row: TimelineRow) => row.id === turn?.assistantMessageId) ?? last;
    const active = turn?.state === 'running' || session?.activeTurnId === turnId || (end === timeline.length &&
      (session?.status === 'running' || session?.status === 'starting'));
    const failed = turn?.state === 'error' || turn?.state === 'interrupted' ||
      (end === timeline.length && (session?.status === 'error' || session?.status === 'interrupted'));
    const settled = final !== undefined && section.length > 1 && !section.some((row: TimelineRow) => row.streaming === true) && !active && !failed;
    const foldId = `turn:${turnId}`;
    if (settled) {
      const from = Date.parse(turn?.startedAt ?? turn?.requestedAt ?? user?.createdAt ?? section[0].createdAt);
      const to = Date.parse(turn?.completedAt ?? final.updatedAt ?? final.createdAt);
      const seconds = Math.max(0, Math.round((to - from) / 1000));
      const duration = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` :
        `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
      result.push({ id: foldId, kind: 'turn', role: '', text: Number.isFinite(seconds) ? `运行了 ${duration}` : '运行过程',
        detail: '', status: '', createdAt: section[0].createdAt });
    }
    if (!settled || expanded.includes(foldId)) {
      const process = settled ? section.filter((row: TimelineRow) => row.id !== final.id) : section;
      let index = 0;
      while (index < process.length) {
        const row = process[index];
        if (row.kind !== 'tool') { result.push(row); index++; continue; }
        let tail = index + 1;
        while (tail < process.length && process[tail].kind === 'tool') tail++;
        const groupId = `tools:${row.id}`;
        result.push({ id: groupId, kind: 'tools', role: '', text: `${tail - index} 次工具调用`,
          detail: '', status: '', createdAt: row.createdAt });
        if (expanded.includes(groupId)) {
          for (let n = index; n < tail; n++) { process[n].depth = 1; result.push(process[n]); }
        }
        index = tail;
      }
    }
    if (settled) result.push(final);
    start = end;
  }
  return result;
}

export interface ThreadDetail {
  latestTurn?: LatestTurn | null;
  branch?: string | null;
  modelSelection?: ModelSelection;
  id: string;
  title: string;
  projectId: string;
  runtimeMode: string;
  interactionMode: string;
  worktreePath?: string | null;
  session?: ThreadSession | null;
  messages: ChatMessage[];
  activities?: ThreadActivity[];
  checkpoints?: Checkpoint[];
}

export interface RepositoryIdentity {
  canonicalKey: string;
  rootPath?: string;
  name?: string;
  displayName?: string;
}

export interface ProjectShell {
  faviconPath?: string | null;
  repositoryIdentity?: RepositoryIdentity | null;
  updatedAt?: string;
  createdAt?: string;
  id: string;
  title: string;
  workspaceRoot: string;
  defaultModelSelection?: ModelSelection | null;
}

export interface ShellSnapshot {
  snapshotSequence: number;
  threads: ThreadShell[];
  projects: ProjectShell[];
}

export interface ShellItem {
  kind: string;
  sequence?: number;
  snapshot?: ShellSnapshot;
  thread?: ThreadShell;
  threadId?: string;
  project?: ProjectShell;
  projectId?: string;
}

export class ShellState {
  threads: ThreadShell[] = [];
  projects: ProjectShell[] = [];
  private sequence: number = -1;

  apply(item: ShellItem): void {
    if (item.kind === 'snapshot' && item.snapshot !== undefined) {
      this.sequence = item.snapshot.snapshotSequence;
      this.threads = item.snapshot.threads;
      this.projects = item.snapshot.projects;
      return;
    }
    if (item.sequence === undefined || item.sequence <= this.sequence) return;
    this.sequence = item.sequence;
    if (item.kind === 'thread-upserted' && item.thread !== undefined) {
      const thread = item.thread;
      this.threads = this.threads.filter((entry: ThreadShell) => entry.id !== thread.id).concat([thread]);
    } else if (item.kind === 'thread-removed') {
      this.threads = this.threads.filter((entry: ThreadShell) => entry.id !== item.threadId);
    } else if (item.kind === 'project-upserted' && item.project !== undefined) {
      const project = item.project;
      this.projects = this.projects.filter((entry: ProjectShell) => entry.id !== project.id).concat([project]);
    } else if (item.kind === 'project-removed') {
      this.projects = this.projects.filter((entry: ProjectShell) => entry.id !== item.projectId);
    }
  }
}

interface ThreadSnapshot {
  snapshotSequence: number;
  thread: ThreadDetail;
}

interface MessagePayload {
  turnId?: string | null;
  modelSelection?: ModelSelection;
  runtimeMode?: string;
  interactionMode?: string;
  attachments?: ChatAttachment[];
  activity?: ThreadActivity;
  checkpointTurnCount?: number;
  status?: string;
  threadId: string;
  messageId?: string;
  role?: string;
  text?: string;
  streaming?: boolean;
  session?: ThreadSession;
}

interface ThreadEvent {
  sequence: number;
  occurredAt?: string;
  type: string;
  payload: MessagePayload;
}

export interface ThreadItem {
  kind: string;
  snapshot?: ThreadSnapshot;
  event?: ThreadEvent;
}

export class ThreadState {
  checkpointCount: number = 0;
  thread: ThreadDetail | null = null;
  messages: ChatMessage[] = [];
  activities: ThreadActivity[] = [];
  private sequence: number = -1;
  private snapshotSequence: number = -1;
  private shellSequence: number = -1;
  private shellThread: ThreadShell | null = null;

  // Mode/model changes travel on the shell feed, not the detail event feed.
  applyShell(item: ShellItem, threadId: string): void {
    const sequence = item.kind === 'snapshot' ? item.snapshot?.snapshotSequence : item.sequence;
    if (sequence === undefined || sequence <= this.shellSequence) return;
    const thread = item.kind === 'snapshot' ? item.snapshot?.threads.find((entry: ThreadShell) => entry.id === threadId) :
      (item.kind === 'thread-upserted' ? item.thread : undefined);
    if (thread === undefined || thread.id !== threadId) return;
    this.shellSequence = sequence;
    this.shellThread = thread;
    this.applyShellMetadata();
  }

  private applyShellMetadata(): void {
    const shell = this.shellThread;
    if (this.thread === null || shell === null || shell.id !== this.thread.id || this.shellSequence < this.snapshotSequence) return;
    if (shell.latestTurn !== undefined) this.thread.latestTurn = shell.latestTurn;
    if (shell.title !== undefined) this.thread.title = shell.title ?? '';
    if (shell.branch !== undefined) this.thread.branch = shell.branch;
    if (shell.worktreePath !== undefined) this.thread.worktreePath = shell.worktreePath;
    if (shell.modelSelection !== undefined) this.thread.modelSelection = shell.modelSelection;
    if (shell.runtimeMode !== undefined) this.thread.runtimeMode = shell.runtimeMode;
    if (shell.interactionMode !== undefined) this.thread.interactionMode = shell.interactionMode;
  }

  apply(item: ThreadItem): void {
    if (item.kind === 'snapshot' && item.snapshot !== undefined) {
      this.sequence = item.snapshot.snapshotSequence;
      this.snapshotSequence = item.snapshot.snapshotSequence;
      this.thread = item.snapshot.thread;
      this.applyShellMetadata();
      this.messages = item.snapshot.thread.messages;
      this.activities = item.snapshot.thread.activities ?? [];
      this.checkpointCount = 0;
      for (const checkpoint of item.snapshot.thread.checkpoints ?? []) {
        if (checkpoint.status === 'ready') this.checkpointCount = Math.max(this.checkpointCount, checkpoint.checkpointTurnCount);
      }
      return;
    }
    const event = item.event;
    if (event === undefined || event.sequence <= this.sequence || this.thread === null) return;
    if (event.payload.threadId !== this.thread.id) return;
    this.sequence = event.sequence;
    if (event.type === 'thread.activity-appended' && event.payload.activity !== undefined) {
      const activity = event.payload.activity;
      this.activities = this.activities.filter((entry: ThreadActivity) => entry.id !== activity.id).concat([activity]);
    }
    if (event.type === 'thread.turn-diff-completed' && event.payload.status === 'ready') {
      this.checkpointCount = Math.max(this.checkpointCount, event.payload.checkpointTurnCount ?? 0);
    }
    if (event.type === 'thread.meta-updated' && event.payload.modelSelection !== undefined) {
      this.thread.modelSelection = event.payload.modelSelection;
    }
    if (event.type === 'thread.runtime-mode-set' && event.payload.runtimeMode !== undefined) {
      this.thread.runtimeMode = event.payload.runtimeMode;
    }
    if (event.type === 'thread.interaction-mode-set' && event.payload.interactionMode !== undefined) {
      this.thread.interactionMode = event.payload.interactionMode;
    }
    if (event.type === 'thread.session-set') {
      this.thread.session = event.payload.session;
    }
    if (event.type !== 'thread.message-sent' || event.payload.messageId === undefined) return;
    const payload = event.payload;
    const existing = this.messages.find((message: ChatMessage) => message.id === payload.messageId);
    const text = payload.text ?? '';
    const message: ChatMessage = {
      id: payload.messageId ?? '', role: payload.role ?? existing?.role ?? 'assistant',
      turnId: payload.turnId ?? existing?.turnId, updatedAt: event.occurredAt ?? existing?.updatedAt,
      text: existing === undefined ? text : (payload.streaming ? existing.text + text : (text || existing.text)),
      streaming: payload.streaming ?? false,
      attachments: payload.attachments ?? existing?.attachments ?? [],
      createdAt: existing?.createdAt ?? event.occurredAt ?? ''
    };
    if (existing === undefined) this.messages = this.messages.concat([message]);
    else this.messages = this.messages.map((entry: ChatMessage) => entry.id === message.id ? message : entry);
  }
}

interface TurnMessage {
  messageId: string;
  role: string;
  text: string;
  attachments: object[];
}

export interface InterruptTurnCommand {
  type: string;
  commandId: string;
  threadId: string;
  turnId?: string;
  createdAt: string;
}

export function interruptTurnCommand(thread: ThreadDetail, commandId: string,
  createdAt: string): InterruptTurnCommand | null {
  const session = thread.session;
  if (session?.status !== 'running' && session?.status !== 'starting') return null;
  const command: InterruptTurnCommand = {
    type: 'thread.turn.interrupt', commandId: commandId, threadId: thread.id, createdAt: createdAt
  };
  if (session.activeTurnId) command.turnId = session.activeTurnId;
  return command;
}

export interface StartTurnCommand {
  type: string;
  commandId: string;
  threadId: string;
  message: TurnMessage;
  runtimeMode: string;
  interactionMode: string;
  createdAt: string;
}

export function startTurnCommand(thread: ThreadDetail, text: string, commandId: string,
  messageId: string, createdAt: string): StartTurnCommand {
  const message: TurnMessage = { messageId: messageId, role: 'user', text: text, attachments: [] };
  const command: StartTurnCommand = {
    type: 'thread.turn.start', commandId: commandId, threadId: thread.id, message: message,
    runtimeMode: thread.runtimeMode, interactionMode: thread.interactionMode ?? 'default', createdAt: createdAt
  };
  return command;
}

export interface ModelOptionSelection { id: string; value: string | boolean; }
export interface ModelOptionChoice { id: string; label: string; isDefault?: boolean; }
export interface ModelOptionDescriptor {
  id: string; label: string; type: string; description?: string;
  currentValue?: string | boolean; options?: ModelOptionChoice[]; promptInjectedValues?: string[];
}
export interface ModelCapabilities { optionDescriptors?: ModelOptionDescriptor[]; }

export interface ModelSelection {
  options?: ModelOptionSelection[];
  instanceId: string;
  model: string;
}

export interface ProviderModel {
  capabilities?: ModelCapabilities;
  slug: string;
  name: string;
}

export interface ProviderInfo {
  driver?: string;
  instanceId: string;
  displayName?: string;
  enabled: boolean;
  installed: boolean;
  availability?: string;
  models: ProviderModel[];
}

export interface ModelChoice {
  driver?: string;
  providerLabel?: string;
  optionDescriptors?: ModelOptionDescriptor[];
  instanceId: string;
  model: string;
  label: string;
}

export function availableModels(providers: ProviderInfo[]): ModelChoice[] {
  const choices: ModelChoice[] = [];
  for (const provider of providers) {
    if (!provider.enabled || !provider.installed || provider.availability === 'unavailable') continue;
    for (const model of provider.models) {
      choices.push({ instanceId: provider.instanceId, model: model.slug, driver: provider.driver, providerLabel: provider.displayName ?? provider.instanceId,
        label: `${provider.displayName ?? provider.instanceId} · ${model.name}`, optionDescriptors: model.capabilities?.optionDescriptors });
    }
  }
  return choices;
}

export function preferredModelIndex(choices: ModelChoice[], preferred: ModelSelection | null): number {
  if (choices.length === 0) return -1;
  const index = choices.findIndex((choice: ModelChoice) =>
    choice.instanceId === preferred?.instanceId && choice.model === preferred?.model);
  return index < 0 ? 0 : index;
}

export function visibleThreads(threads: ThreadShell[], projectId: string, filter: string,
  search: string, archiveOrder: string = 'newest'): ThreadShell[] {
  const query = search.trim().toLocaleLowerCase();
  return threads.filter((thread: ThreadShell) => {
    if (projectId.length > 0 && thread.projectId !== projectId) return false;
    if (query.length > 0 && !(thread.title ?? '').toLocaleLowerCase().includes(query)) return false;
    if (filter === 'archived') return Boolean(thread.archivedAt);
    if (thread.archivedAt) return false;
    const running = thread.session?.status === 'running' || Boolean(thread.session?.activeTurnId);
    const settled = Boolean(thread.settledAt) && !running;
    if (filter === 'active') return !settled;
    if (filter === 'settled') return settled;
    return true;
  }).sort((a: ThreadShell, b: ThreadShell) => {
    if (filter !== 'archived') return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    const aTime = Date.parse(a.archivedAt ?? a.updatedAt ?? '');
    const bTime = Date.parse(b.archivedAt ?? b.updatedAt ?? '');
    const delta = (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
    if (delta !== 0) return archiveOrder === 'oldest' ? delta : -delta;
    const aTitle = a.title ?? '', bTitle = b.title ?? '';
    if (aTitle !== bTitle) return aTitle < bTitle ? -1 : 1;
    return a.id < b.id ? -1 : a.id === b.id ? 0 : 1;
  });
}


export function searchArchivedThreads(snapshot: ShellSnapshot, query: string, environmentLabel: string): ThreadShell[] {
  const search = query.trim().toLocaleLowerCase();
  const projects = new Map<string, ProjectShell>();
  for (const project of snapshot.projects) projects.set(project.id, project);
  return snapshot.threads.filter((thread: ThreadShell) => {
    const project = projects.get(thread.projectId);
    if (!thread.archivedAt || !project) return false;
    return [project.title, project.workspaceRoot, environmentLabel, thread.title ?? '', thread.branch ?? '']
      .some((value: string) => value.toLocaleLowerCase().includes(search));
  });
}
