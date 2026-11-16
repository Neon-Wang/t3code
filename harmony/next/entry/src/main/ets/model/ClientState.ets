import { getSnapshot, subscribe } from '../generated/core.js';

export interface MenuAction {
  id: string;
  title: string;
  disabled?: boolean;
  children?: MenuAction[];
}
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
interface Snapshot {
  status: string;
  connected: boolean;
  rows: ThreadRow[];
  environments: EnvironmentRow[];
  projects: ProjectRow[];
  hiddenSettledCount: number;
  pageFailed: boolean;
}

@ObservedV2
export class ClientState {
  @Trace projects: ProjectRow[] = [];
  @Trace hiddenSettledCount: number = 0;
  @Trace pageFailed: boolean = false;
  @Trace status: string = '';
  @Trace connected: boolean = false;
  @Trace rows: ThreadRow[] = [];
  @Trace environments: EnvironmentRow[] = [];
  private unsubscribe: () => void = () => {};

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
    this.environments = state.environments;
    this.projects = state.projects ?? [];
    this.hiddenSettledCount = state.hiddenSettledCount ?? 0;
    this.pageFailed = state.pageFailed ?? false;
  }
}
