/**
 * 线程详情：消息流（feed 流式分块）+ composer。
 *
 * composer 的编辑面是平台原生文本组件，文档模型与受控协议跑在上游
 * Swift 代码里（T3ComposerEditor 模块经 SwiftBridge 驱动）。
 */
import router from '@ohos.router';
import { SwiftBridge } from '../bridge/NativeBridge';
import { RpcClient, EmptyPayload } from '../connection/Rpc';
import { WS } from '../model/Models';

interface FeedEntry {
  role: string;
  text: string;
}

interface FeedChunkEntry {
  role: string;
  text: string;
}

interface StartTurnPart {
  kind: string;
  text: string;
}

interface StartTurnPayload {
  environmentId: string;
  threadId: string;
  parts: StartTurnPart[];
}

class FeedSubscriptionPayload {
  environmentId: string;
  threadId: string;

  constructor(environmentId: string, threadId: string) {
    this.environmentId = environmentId;
    this.threadId = threadId;
  }
}

class SocketRouteParams {
  socketUrl: string;

  constructor(socketUrl: string) {
    this.socketUrl = socketUrl;
  }
}

interface RouteParams {
  environmentId: string;
  threadId: string;
  socketUrl: string;
  httpBaseUrl: string;
}

@Entry
@Component
struct ThreadPage {
  @State entries: FeedEntry[] = [];
  @State draft: string = '';
  @State composerInstance: string | null = null;
  @State threadStatus: string = '';
  private params: RouteParams = { environmentId: '', threadId: '', socketUrl: '', httpBaseUrl: '' };
  private rpc: RpcClient | null = null;

  aboutToAppear(): void {
    const pending = router.getParams() as Record<string, string>;
    this.params = {
      environmentId: pending['environmentId'] ?? '',
      threadId: pending['threadId'] ?? '',
      socketUrl: pending['socketUrl'] ?? '',
      httpBaseUrl: pending['httpBaseUrl'] ?? ''
    };
    this.rpc = new RpcClient();
    this.rpc.connect(this.params.socketUrl).then(() => {
      this.subscribeFeed();
    }).catch((error: Error) => {
      this.threadStatus = `连接失败：${error.message}`;
    });

    // composer：Swift 侧实例（受控文档协议在原生层驱动）。
    try {
      const bridge = SwiftBridge.ensure();
      const instance = bridge.createView('T3ComposerEditor');
      this.composerInstance = instance;
    } catch (_) {
      this.composerInstance = null; // 无 .so 时退化纯 ArkTS 输入。
    }
  }

  aboutToDisappear(): void {
    if (this.rpc !== null) {
      this.rpc.close();
    }
    if (this.composerInstance !== null) {
      SwiftBridge.ensure().destroyView(this.composerInstance);
    }
  }

  private subscribeFeed(): void {
    const rpc = this.rpc;
    if (rpc === null) {
      return;
    }
    const subscription = new FeedSubscriptionPayload(this.params.environmentId, this.params.threadId);
    rpc.callStream(WS.threadFeed, subscription, (values: object[]) => {
      for (const value of values) {
        const chunk = value as FeedChunkEntry;
        const entry: FeedEntry = {
          role: chunk.role ?? 'assistant',
          text: chunk.text ?? ''
        };
        this.entries.push(entry);
      }
    }).catch(() => {
    });
  }

  private async send(): Promise<void> {
    if (this.draft.length === 0 || this.rpc === null) {
      return;
    }
    const text = this.draft;
    this.draft = '';
    const userEntry: FeedEntry = { role: 'user', text: text };
    this.entries.push(userEntry);
    const part: StartTurnPart = { kind: 'text', text: text };
    const payload: StartTurnPayload = {
      environmentId: this.params.environmentId,
      threadId: this.params.threadId,
      parts: [part]
    };
    try {
      await this.rpc.call(WS.threadStartTurn, payload);
    } catch (error) {
      this.threadStatus = error instanceof Error ? error.message : String(error);
    }
  }

  build() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Button('返回').onClick(() => {
          router.back();
        })
        Text(this.params.threadId.substring(0, 8))
          .fontSize(14)
          .fontColor('#9ca3af')
          .layoutWeight(1)
        Button('Diff').onClick(() => {
          const options: router.RouterOptions = {
            url: 'pages/Diff',
            params: new SocketRouteParams(this.params.socketUrl)
          };
          router.pushUrl(options);
        })
        Button('终端').onClick(() => {
          const options: router.RouterOptions = {
            url: 'pages/Terminal',
            params: new SocketRouteParams(this.params.socketUrl)
          };
          router.pushUrl(options);
        })
      }
      .width('100%')

      List({ space: 6 }) {
        ForEach(this.entries, (entry: FeedEntry, index: number) => {
          ListItem() {
            Text(`${entry.role === 'user' ? '你' : 'Agent'}：${entry.text}`)
              .fontSize(15)
              .padding(10)
              .borderRadius(10)
              .backgroundColor(entry.role === 'user' ? '#1d4ed8' : '#1e293b')
              .width('100%')
          }
        }, (_entry: FeedEntry, index: number) => index.toString())
      }
      .layoutWeight(1)
      .width('100%')

      if (this.threadStatus.length > 0) {
        Text(this.threadStatus).fontSize(12).fontColor('#f87171')
      }

      Row({ space: 8 }) {
        TextInput({ placeholder: '给 agent 发消息…', text: this.draft })
          .layoutWeight(1)
          .onChange((value: string) => {
            this.draft = value;
          })
          .onSubmit(() => {
            this.send();
          })
        Button('发送').onClick(() => {
          this.send();
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
