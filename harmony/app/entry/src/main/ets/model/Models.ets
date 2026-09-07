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
  id: string;
  title: string | null;
  state?: string;
  projectId: string;
  archivedAt?: string | null;
  session?: ThreadSession | null;
  worktreePath?: string | null;
  updatedAt: string | null;
}

export interface EnvironmentInfo {
  environmentId: string;
  label: string;
  capabilities: Record<string, string>;
}

export interface ServerConfig {
  environment: EnvironmentInfo;
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

export interface ChatMessage {
  id: string;
  role: string;
  text: string;
  streaming: boolean;
}

export interface Checkpoint {
  checkpointTurnCount: number;
  status: string;
}

export interface ThreadDetail {
  id: string;
  title: string;
  projectId: string;
  runtimeMode: string;
  interactionMode: string;
  worktreePath?: string | null;
  session?: ThreadSession | null;
  messages: ChatMessage[];
  checkpoints?: Checkpoint[];
}

export interface ProjectShell {
  id: string;
  title: string;
  workspaceRoot: string;
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
  private sequence: number = -1;

  apply(item: ThreadItem): void {
    if (item.kind === 'snapshot' && item.snapshot !== undefined) {
      this.sequence = item.snapshot.snapshotSequence;
      this.thread = item.snapshot.thread;
      this.messages = item.snapshot.thread.messages;
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
    if (event.type === 'thread.turn-diff-completed' && event.payload.status === 'ready') {
      this.checkpointCount = Math.max(this.checkpointCount, event.payload.checkpointTurnCount ?? 0);
    }
    if (event.type === 'thread.session-set') {
      this.thread.session = event.payload.session;
    }
    if (event.type !== 'thread.message-sent' || event.payload.messageId === undefined) return;
    const payload = event.payload;
    const existing = this.messages.find((message: ChatMessage) => message.id === payload.messageId);
    const text = payload.text ?? '';
    const message: ChatMessage = {
      id: payload.messageId ?? '', role: payload.role ?? 'assistant',
      text: existing === undefined ? text : (payload.streaming ? existing.text + text : (text || existing.text)),
      streaming: payload.streaming ?? false
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
