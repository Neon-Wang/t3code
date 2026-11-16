import { getSnapshot, subscribe } from '../generated/core.js';

export interface ThreadRow {
  id: string;
  title: string;
  project: string;
  environmentId: string;
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
}

@ObservedV2
export class ClientState {
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
  }
}
