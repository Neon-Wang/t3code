/**
 * 终端页：PTY 在服务器端，字节流经 RPC 收发。
 *
 * 渲染两档：libt3bridge 携带 libghostty-vt 引擎时走 Swift 侧 T3TerminalSurface
 * （display list 回放）；否则回落纯文本 + 键盘输入（与移动端
 * FallbackTerminalSurface 同语义）。输入经键盘事件回传 Swift 编码器
 * （Ctrl/方向键/Tab 的字节序列是上游 Swift 逻辑）。
 */
import router from '@ohos.router';
import { SwiftBridge } from '../bridge/NativeBridge';
import { SwiftFrame } from '../bridge/SwiftFrame';
import { RpcClient, EmptyPayload } from '../connection/Rpc';

interface ResizePayload {
  cols?: number;
  rows?: number;
}

interface InputPayload {
  data?: string;
}

interface TerminalDataChunk {
  data?: string;
}

class WritePayload {
  data: string;

  constructor(data: string) {
    this.data = data;
  }
}

@Entry
@Component
struct TerminalPage {
  @State output: string = '';
  @State inputLine: string = '';
  @State frameJson: string = '';
  @State usingNativeSurface: boolean = false;
  private rpc: RpcClient | null = null;
  private instance: string | null = null;
  private cols: number = 80;
  private rows: number = 24;

  aboutToAppear(): void {
    const pending = router.getParams() as Record<string, string>;
    const socketUrl = pending['socketUrl'] ?? '';
    this.rpc = new RpcClient();
    this.rpc.connect(socketUrl).then(() => {
      const rpc = this.rpc;
      if (rpc !== null) {
        rpc.callStream('t3/terminal/attach', new EmptyPayload(), (_values: object[]) => {
        }).catch(() => {
        });
      }
    }).catch((error: Error) => {
      this.output += `\r\n[rpc] ${error.message}`;
    });

    try {
      const bridge = SwiftBridge.ensure();
      const instance = bridge.createView('T3TerminalSurface');
      if (instance !== null) {
        this.instance = instance;
        bridge.setFrame(instance, 360, 640, 3);
        SwiftBridge.setEventListener((instanceId: string, name: string, payloadJson: string) => {
          if (instanceId !== instance) {
            return;
          }
          if (name === 'onResize') {
            const payload = JSON.parse(payloadJson) as ResizePayload;
            this.cols = payload.cols ?? this.cols;
            this.rows = payload.rows ?? this.rows;
          }
          if (name === 'onInput') {
            const payload = JSON.parse(payloadJson) as InputPayload;
            this.writeToServer(payload.data ?? '');
          }
        });
        this.usingNativeSurface = true;
      }
    } catch (_) {
      this.usingNativeSurface = false;
    }
  }

  aboutToDisappear(): void {
    if (this.rpc !== null) {
      this.rpc.close();
    }
    if (this.instance !== null) {
      SwiftBridge.ensure().destroyView(this.instance);
      SwiftBridge.setEventListener(null);
    }
  }

  private writeToServer(data: string): void {
    const rpc = this.rpc;
    if (rpc === null) {
      return;
    }
    const payload = new WritePayload(data);
    rpc.callStream('t3/terminal/write', payload, (_values: object[]) => {
    }).catch(() => {
    });
  }

  private submit(): void {
    this.writeToServer(`${this.inputLine}\r`);
    this.inputLine = '';
  }

  build() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Button('返回').onClick(() => {
          router.back();
        })
        Text(`终端 ${this.cols}×${this.rows}`).fontSize(14).fontColor('#9ca3af').layoutWeight(1)
      }
      .width('100%')

      if (this.usingNativeSurface) {
        SwiftFrame({ frameJson: this.frameJson })
          .width('100%')
          .layoutWeight(1)
      } else {
        Scroll() {
          Text(this.output.length > 0 ? this.output : '（等待输出…）')
            .fontSize(13)
            .fontColor('#d1d5db')
            .width('100%')
        }
        .layoutWeight(1)
        .width('100%')
        .align(Alignment.TopStart)
      }

      Row({ space: 8 }) {
        TextInput({ placeholder: '输入命令…', text: this.inputLine })
          .layoutWeight(1)
          .onChange((value: string) => {
            this.inputLine = value;
          })
          .onSubmit(() => {
            this.submit();
          })
        Button('发送').onClick(() => {
          this.submit();
        })
      }
      .width('100%')
    }
    .padding(16)
    .width('100%')
    .height('100%')
    .backgroundColor('#0f172a')
  }
}
