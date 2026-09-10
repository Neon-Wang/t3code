import { RpcClient } from './Rpc';

/** Reopens read subscriptions only. Commands are never replayed. */
export class ReconnectingRpc {
  private open: () => Promise<RpcClient>;
  private subscribe: (rpc: RpcClient) => Promise<void>;
  private status: (state: string) => void;
  private generation: number = 0;
  private attempt: number = 0;
  private timer: number = -1;
  private rpc: RpcClient | null = null;

  constructor(open: () => Promise<RpcClient>, subscribe: (rpc: RpcClient) => Promise<void>,
    status: (state: string) => void) {
    this.open = open;
    this.subscribe = subscribe;
    this.status = status;
  }

  start(): void {
    this.stop();
    this.attempt = 0;
    this.connect(this.generation);
  }

  healthy(): void { this.attempt = 0; }

  stop(): void {
    this.generation++;
    if (this.timer !== -1) clearTimeout(this.timer);
    this.timer = -1;
    this.rpc?.close();
    this.rpc = null;
  }

  private async connect(generation: number): Promise<void> {
    this.status(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let rpc: RpcClient | null = null;
    try {
      rpc = await this.open();
      if (generation !== this.generation) { rpc.close(); return; }
      this.rpc = rpc;
      await this.subscribe(rpc);
    } catch (_) {
      // Both a lost socket and an ended subscription need a fresh snapshot.
    }
    if (generation !== this.generation) return;
    rpc?.close();
    this.rpc = null;
    this.status('reconnecting');
    const delay = Math.min(1000 * Math.pow(2, this.attempt), 15000);
    this.attempt = Math.min(this.attempt + 1, 4);
    this.timer = setTimeout(() => {
      this.timer = -1;
      this.connect(generation);
    }, delay);
  }
}
