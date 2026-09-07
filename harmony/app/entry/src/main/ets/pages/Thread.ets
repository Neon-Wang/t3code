/**
 * 线程详情：消息流（feed 流式分块）+ composer。
 *
 * composer 的编辑面是平台原生文本组件，文档模型与受控协议跑在上游
 * Swift 代码里（T3ComposerEditor 模块经 SwiftBridge 驱动）。
 */
import router from '@ohos.router';
import util from '@ohos.util';
import { EnvironmentSession } from '../connection/Environment';
import { SwiftBridge } from '../bridge/NativeBridge';
import { RpcClient } from '../connection/Rpc';
import { WS, ChatMessage, ThreadState, ThreadItem, startTurnCommand } from '../model/Models';

interface ThreadSubscription {
  threadId: string;
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
  @State entries: ChatMessage[] = [];
  @State sending: boolean = false;
  @State loaded: boolean = false;
  private state: ThreadState = new ThreadState();
  private cwd: string = '';
  private active: boolean = false;
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
    this.active = true;
    this.cwd = pending['cwd'] ?? '';
    const environment = EnvironmentSession.current;
    if (environment === null) {
      this.threadStatus = '连接已关闭，请返回重新连接';
      return;
    }
    environment.openRpc().then((rpc: RpcClient) => {
      if (!this.active) { rpc.close(); return; }
      this.rpc = rpc;
      this.subscribeFeed();
    }).catch((error: Error) => {
      this.threadStatus = `连接失败：${error.message}`;
    });

    // composer：Swift 侧实例（受控文档协议在原生层驱动）。
    try {
      const bridge = SwiftBridge.ensure();
      const instance: string | null = bridge.createView('T3ComposerEditor');
      this.composerInstance = instance;
    } catch (_) {
      this.composerInstance = null; // 无 .so 时退化纯 ArkTS 输入。
    }
  }

  aboutToDisappear(): void {
    this.active = false;
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
    const subscription: ThreadSubscription = { threadId: this.params.threadId };
    rpc.callStream(WS.threadFeed, subscription, (values: object[]) => {
      for (const value of values) this.state.apply(value as ThreadItem);
      this.entries = this.state.messages;
      this.loaded = this.state.thread !== null;
      this.threadStatus = this.state.thread?.session?.status ?? '';
    }).catch((error: Error) => {
      if (this.active) this.threadStatus = `连接中断：${error.message}`;
    });
  }

  private async send(): Promise<void> {
    if (this.draft.trim().length === 0 || this.rpc === null || this.state.thread === null || this.sending) return;
    const text = this.draft;
    this.sending = true;
    const command = startTurnCommand(this.state.thread, text, util.generateRandomUUID(true),
      util.generateRandomUUID(true), new Date().toISOString());
    try {
      await this.rpc.call(WS.threadStartTurn, command);
      if (this.draft === text) this.draft = '';
    } catch (error) {
      this.threadStatus = error instanceof Error ? error.message : String(error);
    } finally {
      this.sending = false;
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
            params: { threadId: this.params.threadId, cwd: this.state.thread?.worktreePath ?? this.cwd, toTurnCount: this.state.checkpointCount.toString() }
          };
          router.pushUrl(options);
        })
        Button('终端').onClick(() => {
          const options: router.RouterOptions = {
            url: 'pages/Terminal',
            params: { threadId: this.params.threadId, cwd: this.state.thread?.worktreePath ?? this.cwd, toTurnCount: this.state.checkpointCount.toString() }
          };
          router.pushUrl(options);
        })
      }
      .width('100%')

      List({ space: 6 }) {
        ForEach(this.entries, (entry: ChatMessage, index: number) => {
          ListItem() {
            Text(`${entry.role === 'user' ? '你' : 'Agent'}：${entry.text}`)
              .fontSize(15)
              .fontColor('#f8fafc')
              .padding(10)
              .borderRadius(10)
              .backgroundColor(entry.role === 'user' ? '#1d4ed8' : '#1e293b')
              .width('100%')
          }
        }, (entry: ChatMessage) => entry.id + ':' + entry.text.length.toString())
      }
      .layoutWeight(1)
      .width('100%')

      if (this.threadStatus.length > 0) {
        Text(this.threadStatus).fontSize(12).fontColor('#f87171')
      }

      Row({ space: 8 }) {
        TextInput({ placeholder: '给 agent 发消息…', text: this.draft })
          .fontColor('#f8fafc')
          .placeholderColor('#94a3b8')
          .backgroundColor('#1e293b')
          .layoutWeight(1)
          .onChange((value: string) => {
            this.draft = value;
          })
          .onSubmit(() => {
            this.send();
          })
        Button(this.sending ? '发送中…' : '发送').enabled(this.loaded && !this.sending).onClick(() => {
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
