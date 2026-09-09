/** Effect layerJson transport. Keep envelopes aligned with RpcMessage.ts. */
import webSocket from '@ohos.net.webSocket';

export interface RpcExit {
  _tag: string;
  value?: object;
  cause?: object;
}

interface RemoteFailure {
  _tag: string;
  message?: string;
  cause?: RemoteFailureCause;
}
interface RemoteFailureCause { name?: string; }
interface RpcFailureReason { _tag: string; error?: RemoteFailure; }

export class RpcRemoteError extends Error {
  remoteTag: string = '';
  definitivelyRejected: boolean = false;
  constructor(method: string, exit: RpcExit) {
    super(`RPC ${method}: ${JSON.stringify(exit.cause ?? exit)}`);
    if (!Array.isArray(exit.cause) || exit.cause.length !== 1) return;
    const reason = exit.cause[0] as RpcFailureReason;
    if (reason._tag !== 'Fail' || reason.error === undefined) return;
    const failure = reason.error;
    this.remoteTag = failure._tag;
    if (failure.message) this.message = `${failure._tag}: ${failure.message}`;
    const name = failure.cause?.name;
    // Normalizer rejects these before dispatch and exposes only a message on the wire.
    const message = failure.message ?? '';
    const rejectedAttachment = message.startsWith("Attachment '") &&
      (message.endsWith("' cannot be sent: attachment not found.") ||
        message.endsWith("' cannot be sent: attachment not found (removed or expired).") ||
        message.endsWith("' cannot be sent: stored size does not match.") ||
        message.endsWith("' cannot be sent: attachment type does not match the upload."));
    // Workspace validation runs before dispatch; legacy servers expose only its message.
    const rejectedWorkspace = message.startsWith('Workspace root does not exist: ') ||
      message.startsWith('Workspace root is not a directory: ') ||
      message.startsWith('Failed to create workspace root: ') ||
      /^Failed to stat workspace root '.+' during '(validate-existing|verify-created)'\.$/.test(message);
    this.definitivelyRejected = failure._tag === 'EnvironmentAuthorizationError' ||
      (failure._tag === 'OrchestrationDispatchCommandError' &&
        (name === 'OrchestrationCommandInvariantError' || name === 'OrchestrationCommandPreviouslyRejectedError' || rejectedAttachment || rejectedWorkspace));
  }
}

export interface RpcMessage {
  _tag: string;
  requestId?: number;
  exit?: RpcExit;
  values?: object[];
}

interface RpcRequest {
  _tag: string;
  id: number;
  tag: string;
  payload: object;
  headers: string[][];
}

interface RpcControl {
  _tag: string;
  requestId?: number;
}

export class EmptyPayload {}

export class RpcClient {
  private socket: webSocket.WebSocket | null = null;
  private connected: boolean = false;
  private nextRequestId: number = 0;
  private pending: Map<number, (exit: RpcExit) => void> = new Map();
  private failures: Map<number, (error: Error) => void> = new Map();
  private streamHandlers: Map<number, (values: object[]) => void> = new Map();
  private pingTimer: number = -1;
  private pongSeen: boolean = true;
  private connectTimer: number = -1;
  private rejectConnect: ((error: Error) => void) | null = null;

  async connect(socketUrl: string): Promise<void> {
    this.close();
    const socket = webSocket.createWebSocket();
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      this.rejectConnect = reject;
      this.connectTimer = setTimeout(() => { this.close(); }, 10000);
      socket.on('open', () => {
        clearTimeout(this.connectTimer);
        this.connectTimer = -1;
        this.rejectConnect = null;
        this.connected = true;
        this.startPinger();
        resolve();
      });
      socket.on('error', () => {
        const error = new Error('RPC connection failed');
        this.close();
        reject(error);
      });
      socket.on('message', (_error, value) => {
        if (typeof value === 'string') this.handleFrame(value);
      });
      socket.on('close', () => {
        this.close();
        reject(new Error('RPC connection closed'));
      });
      socket.connect(socketUrl, (error) => {
        if (error) {
          this.close();
          reject(new Error('RPC connection failed'));
        }
      });
    });
  }

  private startPinger(): void {
    this.pongSeen = true;
    this.pingTimer = setInterval(() => {
      if (!this.pongSeen) {
        this.close();
        return;
      }
      this.pongSeen = false;
      const ping: RpcControl = { _tag: 'Ping' };
      this.send(ping);
    }, 5000);
  }

  private send(message: object): void {
    const socket = this.socket;
    if (socket === null || !this.connected) {
      throw new Error('RPC is not connected');
    }
    socket.send(JSON.stringify(message)).then((sent: boolean) => {
      if (!sent) this.close();
    }).catch(() => this.close());
  }

  private handleFrame(text: string): void {
    try {
      const decoded: object = JSON.parse(text);
      const messages = Array.isArray(decoded) ? decoded as object[] : [decoded];
      for (const message of messages) this.handleMessage(message as RpcMessage);
    } catch (_) {
      this.close();
    }
  }

  private handleMessage(message: RpcMessage): void {
    if (message._tag === 'Pong') {
      this.pongSeen = true;
      return;
    }
    const requestId = message.requestId;
    if (requestId === undefined) return;
    if (message._tag === 'Exit' && message.exit !== undefined) {
      const resolver = this.pending.get(requestId);
      this.pending.delete(requestId);
      this.failures.delete(requestId);
      this.streamHandlers.delete(requestId);
      if (resolver !== undefined) resolver(message.exit);
    } else if (message._tag === 'Chunk') {
      const stream = this.streamHandlers.get(requestId);
      if (stream !== undefined) {
        stream(message.values ?? []);
        const ack: RpcControl = { _tag: 'Ack', requestId: requestId };
        this.send(ack);
      }
    }
  }

  call<T extends object>(method: string, payload: object): Promise<T> {
    return this.request<T>(method, payload, null);
  }

  async callStream(method: string, payload: object,
    onChunk: (values: object[]) => void): Promise<void> {
    await this.request<object>(method, payload, onChunk);
  }

  private request<T extends object>(method: string, payload: object,
    onChunk: ((values: object[]) => void) | null): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('RPC is not connected'));
        return;
      }
      const requestId = this.nextRequestId++;
      this.pending.set(requestId, (exit: RpcExit) => {
        if (exit._tag === 'Success') resolve(exit.value as T);
        else reject(new RpcRemoteError(method, exit));
      });
      this.failures.set(requestId, reject);
      if (onChunk !== null) this.streamHandlers.set(requestId, onChunk);
      const request: RpcRequest = {
        _tag: 'Request', id: requestId, tag: method, payload: payload, headers: []
      };
      try {
        this.send(request);
      } catch (_) {
        this.close();
      }
    });
  }

  close(): void {
    if (this.connectTimer !== -1) clearTimeout(this.connectTimer);
    this.connectTimer = -1;
    const rejectConnect = this.rejectConnect;
    this.rejectConnect = null;
    if (rejectConnect !== null) rejectConnect(new Error('RPC connection closed'));
    this.connected = false;
    if (this.pingTimer >= 0) {
      clearInterval(this.pingTimer);
      this.pingTimer = -1;
    }
    for (const reject of this.failures.values()) reject(new Error('RPC connection closed'));
    this.failures.clear();
    this.pending.clear();
    this.streamHandlers.clear();
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.off('message');
      socket.off('open');
      socket.off('error');
      socket.off('close');
      socket.close();
    }
  }
}
