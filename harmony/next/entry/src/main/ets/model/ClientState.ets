import { getSnapshot, subscribe } from '../generated/core.js';

export interface MenuAction {
  id: string;
  title: string;
  disabled?: boolean;
  selected?: boolean;
  subtitle?: string;
  children?: MenuAction[];
}
export interface ArrangeRow { id: string; environmentId: string; title: string; canMoveUp: boolean; canMoveDown: boolean; writable: boolean; }
export interface ProjectRow { key: string; label: string; }
export interface WaitingRow { key: string; title: string; provider: string; kind: string; }
export interface ThreadRow {
  key: string;
  kind: string;
  group: string;
  expanded: boolean;
  id: string;
  title: string;
  project: string;
  projectIcon: string;
  environmentId: string;
  environment: string;
  branch: string;
  noBranch: boolean;
  provider: string;
  status: string;
  statusLabel: string;
  color: string;
  waiting: WaitingRow[];
  waitingMore: number;
  inboxCount: number;
  urgent: boolean;
  pinned: boolean;
  writable: boolean;
  primary: MenuAction;
  secondary: MenuAction | null;
  menu: MenuAction[];
}
export interface EnvironmentRow {
  id: string;
  label: string;
  address: string;
  enabled: boolean;
  shellStatus: string;
  status: string;
}
export interface InboxThread { id: string; title: string; projectId: string; projectTitle: string; }
export interface InboxQuestion {
  id: string; question: string; context: string; options: string[]; recommend: string;
  agent: string; urgent: boolean; urgentReason: string; createdAt: string; threadId: string | null;
  thread: InboxThread | null; workspace: string;
}
export interface InboxRow {
  key: string; kind: string; title: string; environmentId: string; writable: boolean;
  item: InboxQuestion; timeLabel: string;
}
interface Snapshot {
  arrangeRows: ArrangeRow[];
  status: string;
  connected: boolean;
  rows: ThreadRow[];
  environments: EnvironmentRow[];
  projects: ProjectRow[];
  hiddenSettledCount: number;
  pageFailed: boolean;
  inboxRows: InboxRow[];
  inboxCount: number;
  inboxStatus: string;
}

@ObservedV2
export class ClientState {
  @Trace arrangeRows: ArrangeRow[] = [];
  @Trace inboxRows: InboxRow[] = [];
  @Trace inboxCount: number = 0;
  @Trace inboxStatus: string = '';
  @Trace inboxOpened: boolean = false;
  @Trace activeQuestion: InboxRow | null = null;
  @Trace answerDraft: string = '';
  private drafts: Map<string, string> = new Map();
  private questionEnvironment: string = '';
  private questionThread: string = '';
  @Trace projects: ProjectRow[] = [];
  @Trace hiddenSettledCount: number = 0;
  @Trace pageFailed: boolean = false;
  @Trace status: string = '';
  @Trace connected: boolean = false;
  @Trace rows: ThreadRow[] = [];
  @Trace environments: EnvironmentRow[] = [];
  private unsubscribe: () => void = () => {};

  private questions(): InboxRow[] {
    return this.inboxRows.filter((row: InboxRow) => row.kind === 'question' && (!this.questionThread || (row.environmentId === this.questionEnvironment && row.item.threadId === this.questionThread)));
  }
  openQuestion(key: string): void {
    this.questionEnvironment = '';
    this.questionThread = '';
    this.selectQuestion(this.inboxRows.find((row: InboxRow) => row.key === key) ?? null);
    this.inboxOpened = this.activeQuestion !== null;
  }
  openThreadQuestions(environmentId: string, threadId: string): void {
    this.questionEnvironment = environmentId;
    this.questionThread = threadId;
    this.selectQuestion(this.questions()[0] ?? null);
    this.inboxOpened = this.activeQuestion !== null;
  }
  private selectQuestion(row: InboxRow | null): void {
    this.activeQuestion = row;
    this.answerDraft = row ? this.drafts.get(row.key) ?? '' : '';
  }
  stepQuestion(direction: number): void {
    const rows = this.questions();
    const index = rows.findIndex((row: InboxRow) => row.key === this.activeQuestion?.key);
    const next = index + direction;
    if (next >= 0 && next < rows.length) { this.selectQuestion(rows[next]); }
  }
  saveDraft(key: string, value: string): void { this.drafts.set(key, value); this.answerDraft = value; }
  clearDraft(key: string): void {
    this.drafts.delete(key);
    if (this.activeQuestion?.key === key) { this.answerDraft = ''; }
  }
  start(): void {
    this.apply(getSnapshot());
    this.unsubscribe = subscribe((snapshot: string) => { this.apply(snapshot); });
  }
  stop(): void { this.unsubscribe(); }
  private apply(json: string): void {
    const state = JSON.parse(json) as Snapshot;
    this.status = state.status;
    this.connected = state.connected;
    this.rows = state.rows;
    this.arrangeRows = state.arrangeRows ?? [];
    this.environments = state.environments;
    this.projects = state.projects ?? [];
    this.hiddenSettledCount = state.hiddenSettledCount ?? 0;
    this.pageFailed = state.pageFailed ?? false;
    this.inboxRows = state.inboxRows ?? [];
    this.inboxCount = state.inboxCount ?? 0;
    this.inboxStatus = state.inboxStatus ?? '';
    if (this.inboxOpened) {
      const rows = this.questions();
      const current = rows.find((row: InboxRow) => row.key === this.activeQuestion?.key);
      const next = current ?? rows[0];
      if (next) { this.selectQuestion(next); }
      // Keep the sheet content mounted until ArkUI finishes dismissing it.
      else { this.inboxOpened = false; }
    }
  }
}
