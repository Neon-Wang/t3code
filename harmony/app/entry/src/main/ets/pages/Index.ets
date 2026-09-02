import router from '@ohos.router';
import { connectEnvironment, PreparedConnection } from '../connection/Environment';
import { SshEnvironment, SshTarget } from '../connection/SshTunnel';
import { ThreadShell, WS } from '../model/Models';
import { EmptyPayload } from '../connection/Rpc';

interface ThreadRow {
  id: string;
  title: string;
  state: string;
}

interface ThreadListResponse {
  threads: ThreadShell[];
}

@Entry
@Component
struct Index {
  @State hostname: string = '';
  @State port: string = '22';
  @State username: string = '';
  @State password: string = '';
  @State packageSpec: string = 't3@nightly';
  @State status: string = '';
  @State connecting: boolean = false;
  @State connected: PreparedConnection | null = null;
  @State threads: ThreadRow[] = [];
  @State selectedThreadId: string = '';

  private makeTarget(): SshTarget {
    const target: SshTarget = {
      hostname: this.hostname,
      port: Number(this.port),
      username: this.username,
      password: this.password
    };
    return target;
  }

  private async connect(): Promise<void> {
    this.connecting = true;
    this.status = '准备…';
    try {
      const connection = await connectEnvironment(this.makeTarget(), this.packageSpec,
        (message: string) => {
          this.status = message;
        });
      this.connected = connection;
      this.status = `已连接：${connection.descriptor.label ?? connection.descriptor.environmentId}`;
      await this.loadThreads();
    } catch (error) {
      this.status = `连接失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.connecting = false;
    }
  }

  private async loadThreads(): Promise<void> {
    const connection = this.connected;
    if (connection === null) {
      return;
    }
    try {
      const response = await connection.rpc.call<ThreadListResponse>(WS.threadsList,
        new EmptyPayload());
      const shells = response.threads ?? [];
      const rows: ThreadRow[] = [];
      for (const shell of shells) {
        const row: ThreadRow = {
          id: shell.id,
          title: shell.title ?? '（未命名）',
          state: shell.state
        };
        rows.push(row);
      }
      this.threads = rows;
    } catch (error) {
      this.status = `线程列表失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async disconnect(): Promise<void> {
    const connection = this.connected;
    if (connection !== null) {
      connection.rpc.close();
    }
    await SshEnvironment.disconnect(this.makeTarget());
    this.connected = null;
    this.threads = [];
    this.status = '已断开';
  }

  private openThread(thread: ThreadRow): void {
    const connection = this.connected;
    const params: Record<string, string> = {
      'environmentId': connection !== null ? connection.descriptor.environmentId : '',
      'threadId': thread.id,
      'socketUrl': connection !== null ? connection.socketUrl : '',
      'httpBaseUrl': connection !== null ? connection.httpBaseUrl : ''
    };
    const options: router.RouterOptions = {
      url: 'pages/Thread',
      params: params
    };
    router.pushUrl(options);
    this.selectedThreadId = thread.id;
  }

  build() {
    Column({ space: 12 }) {
      Text('T3 Code')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .padding({ top: 48, bottom: 8 })

      if (this.connected === null) {
        TextInput({ placeholder: '主机（hostname）', text: this.hostname })
          .onChange((value: string) => {
            this.hostname = value;
          })
        TextInput({ placeholder: '端口', text: this.port })
          .onChange((value: string) => {
            this.port = value;
          })
        TextInput({ placeholder: '用户名', text: this.username })
          .onChange((value: string) => {
            this.username = value;
          })
        TextInput({ placeholder: '密码', text: this.password })
          .type(InputType.Password)
          .onChange((value: string) => {
            this.password = value;
          })
        TextInput({ placeholder: '远端 t3 包（t3@nightly / t3@latest）', text: this.packageSpec })
          .onChange((value: string) => {
            this.packageSpec = value;
          })
        Button(this.connecting ? '连接中…' : '连接环境')
          .enabled(!this.connecting && this.hostname.length > 0)
          .width('100%')
          .onClick(() => {
            this.connect();
          })
      } else {
        Text(this.status)
          .fontSize(14)
          .fontColor('#4ade80')
        Row({ space: 8 }) {
          Button('刷新').onClick(() => {
            this.loadThreads();
          })
          Button('断开').onClick(() => {
            this.disconnect();
          })
        }
        List({ space: 4 }) {
          ForEach(this.threads, (thread: ThreadRow) => {
            ListItem() {
              Column({ space: 2 }) {
                Text(thread.title).fontSize(16).maxLines(1)
                Text(thread.state).fontSize(12).fontColor('#9ca3af')
              }
              .width('100%')
              .padding(12)
              .borderRadius(12)
              .backgroundColor('#1e293b')
              .onClick(() => {
                this.openThread(thread);
              })
            }
          }, (thread: ThreadRow) => thread.id)
        }
        .layoutWeight(1)
        .width('100%')
      }

      if (this.status.length > 0) {
        Text(this.status)
          .fontSize(13)
          .fontColor('#9ca3af')
          .maxLines(2)
      }
    }
    .padding(20)
    .width('100%')
    .height('100%')
    .backgroundColor('#0f172a')
  }
}
