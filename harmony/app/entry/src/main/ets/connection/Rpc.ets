/**
 * T3 WebSocket RPC 客户端 —— effect socket RPC 线协议（layerJson）。
 *
 * 真值来自 packages/client-runtime/src/rpc（session.ts/protocol.ts）与
 * .repos/effect-smol 的 RpcClient/RpcSerialization：
 *   - 每条 WS 文本帧 = 一个 JSON 对象（接收侧可为对象数组）。
 *   - 请求：{"_tag":"Request","id":N,"tag":"<WS_METHOD>","payload":{…},"headers":{}}
 *   - 心跳：{"_tag":"Ping"} 每 5s；服务端回 {"_tag":"Pong"}。
 *   - 响应：{"_tag":"Exit","requestId":N,"exit":{"_tag":"Success","value":…}}
 *           {"_tag":"Chunk","requestId":N,"values":[…]}（流式分块）
 *   - 取消：{"_tag":"Interrupt","requestId":N,"interruptors":[]}
 */
import webSocket from '@ohos.net.webSocket';

export interface RpcExit {
  _tag: string;
  value?: object;
  cause?: object;
}

export interface RpcMessage {
  _tag: string;
  requestId?: number;
  id?: number;
  exit?: RpcExit;
  values?: object[];
}

export interface RpcRequest {
  _tag: string;
  id: number;
  tag: string;
  payload: object;
  headers: Record<string, string>;
}

export class EmptyPayload {
}

class PingFrame {
  _tag: string = 'Ping';
}

class InterruptFrame {
  _tag: string = 'Interrupt';
  requestId: number;

  constructor(requestId: number) {
    this.requestId = requestId;
  }
}

export class RpcClient {
  private socket: webSocket.WebSocket | null = null;
  private nextRequestId: number = 0;
  private pending: Map<number, (exit: RpcExit) => void> = new Map();
  private streamHandlers: Map<number, (values: object[]) => void> = new Map();
  private pingTimer: number = -1;
  private pongSeen: boolean = true;

  async connect(socketUrl: string): Promise<void> {
    const socket = webSocket.createWebSocket();
    this.socket = socket;
    return new Promise<void>((resolve, reject) => {
      socket.on('open', () => {
        this.startPinger();
        resolve();
      });
      socket.on('error', (error) => {
        reject(new Error(`rpc socket: ${JSON.stringify(error)}`));
      });
      socket.on('message', (_error, value) => {
        if (typeof value === 'string') {
          this.handleFrame(value);
        }
      });
      socket.on('close', () => {
        this.stopPinger();
      });
      socket.connect(socketUrl, (error) => {
        if (error) {
          reject(new Error(`rpc connect: ${JSON.stringify(error)}`));
        }
      });
    });
  }

  private startPinger(): void {
    this.pongSeen = true;
    this.pingTimer = setInterval(() => {
      if (!this.pongSeen) {
        return;
      }
      this.pongSeen = false;
      const ping: PingFrame = new PingFrame();
      this.send(ping);
    }, 5000);
  }

  private stopPinger(): void {
    if (this.pingTimer >= 0) {
      clearInterval(this.pingTimer);
      this.pingTimer = -1;
    }
  }

  private send(message: object): void {
    if (this.socket !== null) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private handleFrame(text: string): void {
    let decoded: object;
    try {
      decoded = JSON.parse(text);
    } catch (_) {
      return;
    }
    const messages = Array.isArray(decoded) ? decoded as object[] : [decoded];
    for (const message of messages) {
      this.handleMessage(message as RpcMessage);
    }
  }

  private handleMessage(message: RpcMessage): void {
    if (message._tag === 'Pong') {
      this.pongSeen = true;
      return;
    }
    const requestId = message.requestId ?? message.id ?? -1;
    if (message._tag === 'Exit' && message.exit !== undefined) {
      const resolver = this.pending.get(requestId);
      if (resolver !== undefined) {
        this.pending.delete(requestId);
        this.streamHandlers.delete(requestId);
        resolver(message.exit);
      }
      return;
    }
    if (message._tag === 'Chunk') {
      const stream = this.streamHandlers.get(requestId);
      if (stream !== undefined) {
        stream(message.values ?? []);
      }
      return;
    }
  }

  call<T extends object>(method: string, payload: object): Promise<T> {
    const requestId = this.nextRequestId++;
    const request: RpcRequest = {
      _tag: 'Request',
      id: requestId,
      tag: method,
      payload: payload,
      headers: {}
    };
    this.send(request);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, (exit: RpcExit) => {
        if (exit._tag === 'Success' && exit.value !== undefined) {
          resolve(exit.value as T);
        } else {
          reject(new Error(`rpc ${method}: ${JSON.stringify(exit.cause ?? exit)}`));
        }
      });
    });
  }

  callStream(method: string, payload: object, onChunk: (values: object[]) => void): Promise<void> {
    const requestId = this.nextRequestId++;
    const request: RpcRequest = {
      _tag: 'Request',
      id: requestId,
      tag: method,
      payload: payload,
      headers: {}
    };
    this.send(request);
    this.streamHandlers.set(requestId, onChunk);
    return new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, (exit: RpcExit) => {
        this.streamHandlers.delete(requestId);
        if (exit._tag === 'Success') {
          resolve();
        } else {
          reject(new Error(`rpc ${method}: ${JSON.stringify(exit.cause ?? exit)}`));
        }
      });
    });
  }

  close(): void {
    this.stopPinger();
    this.pending.clear();
    this.streamHandlers.clear();
    if (this.socket !== null) {
      this.socket.off('message');
      this.socket.off('open');
      this.socket.off('error');
      this.socket.off('close');
      this.socket.close();
      this.socket = null;
    }
  }
}
