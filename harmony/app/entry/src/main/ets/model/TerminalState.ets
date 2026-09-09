export interface TerminalSnapshot {
  threadId: string;
  terminalId: string;
  history: string;
  status: string;
  exitCode?: number | null;
}

export interface TerminalEvent {
  type: string;
  threadId?: string;
  terminalId?: string;
  snapshot?: TerminalSnapshot;
  data?: string;
  message?: string;
  exitCode?: number | null;
}

export interface TerminalUpdate { reset: boolean; data: string; }

export interface TerminalTarget { threadId: string; terminalId: string; }
export interface TerminalSize extends TerminalTarget { cols: number; rows: number; }
export interface TerminalAttach extends TerminalSize { cwd: string; restartIfNotRunning: boolean; }
export interface TerminalWrite extends TerminalTarget { data: string; }

export function terminalResize(threadId: string, terminalId: string, cols: number, rows: number): TerminalSize {
  return { threadId, terminalId, cols: Math.max(1, Math.min(1000, Math.floor(cols))),
    rows: Math.max(1, Math.min(500, Math.floor(rows))) };
}

export function terminalAttach(threadId: string, terminalId: string, cwd: string, cols: number, rows: number): TerminalAttach {
  const size = terminalResize(threadId, terminalId, cols, rows);
  return { threadId, terminalId, cwd, cols: size.cols, rows: size.rows, restartIfNotRunning: false };
}

export function terminalWrite(threadId: string, terminalId: string, data: string): TerminalWrite {
  return { threadId, terminalId, data };
}

/** Keeps server bytes intact for the terminal renderer. A reconnect snapshot replaces history. */
export class TerminalState {
  status: string = 'starting';
  error: string = '';
  exitCode: number | null = null;
  private threadId: string;
  private terminalId: string;

  constructor(threadId: string, terminalId: string) { this.threadId = threadId; this.terminalId = terminalId; }

  apply(event: TerminalEvent): TerminalUpdate | null {
    const snapshot = event.snapshot;
    if ((event.type === 'snapshot' || event.type === 'restarted') && snapshot !== undefined) {
      if (snapshot.threadId !== this.threadId || snapshot.terminalId !== this.terminalId) return null;
      this.status = snapshot.status;
      this.exitCode = snapshot.exitCode ?? null;
      this.error = '';
      return { reset: true, data: snapshot.history };
    }
    if (event.threadId !== this.threadId || event.terminalId !== this.terminalId) return null;
    if (event.type === 'output') return { reset: false, data: event.data ?? '' };
    else if (event.type === 'cleared') return { reset: true, data: '' };
    else if (event.type === 'exited') { this.status = 'exited'; this.exitCode = event.exitCode ?? null; }
    else if (event.type === 'closed') this.status = 'closed';
    else if (event.type === 'error') { this.status = 'error'; this.error = event.message ?? '终端错误'; }
    return null;
  }
}

export interface TerminalClose extends TerminalTarget { deleteHistory: boolean; }
export interface TerminalRestart extends TerminalSize { cwd: string; }

export function terminalClose(threadId: string, terminalId: string): TerminalClose {
  return { threadId, terminalId, deleteHistory: false };
}

export function terminalRestart(threadId: string, terminalId: string, cwd: string, cols: number, rows: number): TerminalRestart {
  const size = terminalResize(threadId, terminalId, cols, rows);
  return { threadId, terminalId, cwd, cols: size.cols, rows: size.rows };
}

/** Explicit closes persist across pages during the current app session. */
export class TerminalClosures {
  private static targets: Set<string> = new Set();
  static has(environment: string, thread: string, terminal: string): boolean {
    return TerminalClosures.targets.has(JSON.stringify([environment, thread, terminal]));
  }
  static set(environment: string, thread: string, terminal: string, closed: boolean): void {
    const key = JSON.stringify([environment, thread, terminal]);
    if (closed) TerminalClosures.targets.add(key);
    else TerminalClosures.targets.delete(key);
  }
}
