/**
 * Swift 原生层的 NAPI 绑定（libt3bridge.so / libt3_ssh.so）。
 *
 * 界面对齐 harmony/swift/Sources/T3CABI 的 C ABI。display list 与事件载荷
 * 都是 JSON 字符串——Swift 侧 Codable 即协议，两侧无共享类型定义。
 */

interface BridgeNative {
  initialize(): string;
  constants(moduleName: string): string | null;
  createView(moduleName: string): string | null;
  setProp(instanceId: string, name: string, value: string | number | boolean | null): boolean;
  callAsync(moduleName: string, functionName: string, instanceId: string | null,
    argumentsJson: string): string | null;
  callSync(moduleName: string, functionName: string, argumentsJson: string): string | null;
  displayList(instanceId: string): string | null;
  setFrame(instanceId: string, width: number, height: number, scale: number): void;
  setScrollOffset(instanceId: string, x: number, y: number): void;
  touch(instanceId: string, phase: number, x: number, y: number): void;
  tick(timestamp: number): void;
  pumpMainQueue(): void;
  destroyView(instanceId: string): void;
  setEventSink(callback: (instanceId: string, name: string, payloadJson: string) => void): void;
}

interface SshNative {
  initialize(onEvent: (eventJson: string) => void): boolean;
  connect(host: string, port: number, username: string, password: string): boolean;
  openForward(host: string, localPort: number, remotePort: number): number;
  exec(command: string, stdinText: string): SshExecResult;
  disconnect(): boolean;
}

export interface SshExecResult {
  stdout: string;
  exitCode: number;
}

interface NativeModule {
  t3bridge?: BridgeNative;
  t3_ssh?: SshNative;
}

interface EventCallbackParam {
  instanceId: string;
  name: string;
  payloadJson: string;
}

declare function requireNapi(name: string, entry?: string): NativeModule;

export class SwiftBridge {
  private static native: BridgeNative | null = null;
  private static eventListener:
    ((instanceId: string, name: string, payloadJson: string) => void) | null = null;
  private static pendingPump: boolean = false;

  static ensure(): BridgeNative {
    if (SwiftBridge.native !== null) {
      return SwiftBridge.native;
    }
    // .so 由 build-ohos.sh 产出并随 hap 打包（entry/libs/<arch>/）。
    const module: NativeModule = requireNapi('t3bridge');
    const bridge = module.t3bridge;
    if (bridge === undefined) {
      throw new Error('libt3bridge.so 未加载：先运行 harmony/napi/build-ohos.sh');
    }
    bridge.initialize();
    bridge.setEventSink((instanceId: string, name: string, payloadJson: string) => {
      SwiftBridge.pendingPump = true;
      const listener = SwiftBridge.eventListener;
      if (listener !== null) {
        listener(instanceId, name, payloadJson);
      }
    });
    SwiftBridge.native = bridge;
    return bridge;
  }

  /** 每帧调用：驱动 Swift 侧的主队列与显示链时钟。 */
  static frameTick(timestampSeconds: number): void {
    const bridge = SwiftBridge.native;
    if (bridge === null) {
      return;
    }
    if (SwiftBridge.pendingPump) {
      bridge.pumpMainQueue();
      SwiftBridge.pendingPump = false;
    }
    bridge.tick(timestampSeconds);
  }

  static setEventListener(
    listener: ((instanceId: string, name: string, payloadJson: string) => void) | null): void {
    SwiftBridge.eventListener = listener;
  }
}

export class SshBridge {
  private static native: SshNative | null = null;

  static ensure(): SshNative {
    if (SshBridge.native !== null) {
      return SshBridge.native;
    }
    const module: NativeModule = requireNapi('t3_ssh');
    const ssh = module.t3_ssh;
    if (ssh === undefined) {
      throw new Error('libt3_ssh.so 未加载：先运行 harmony/napi/build-ohos.sh');
    }
    SshBridge.native = ssh;
    return ssh;
  }
}
