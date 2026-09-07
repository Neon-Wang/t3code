import router from '@ohos.router';
import { connectEnvironment, connectDirectEnvironment, EnvironmentSession, PreparedConnection } from '../connection/Environment';
import { SshEnvironment, SshTarget } from '../connection/SshTunnel';
import { ThreadShell, ShellState, ShellItem, WS } from '../model/Models';
import { EmptyPayload } from '../connection/Rpc';

interface ThreadRow {
  id: string;
  title: string;
  state: string;
}

@Entry
@Component
struct Index {
  @State direct: boolean = true;
  @State environmentUrl: string = '';
  @State pairingToken: string = '';
  private shell: ShellState = new ShellState();
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
      const onStatus = (message: string): void => { this.status = message; };
      const connection = this.direct
        ? await connectDirectEnvironment(this.environmentUrl, this.pairingToken, onStatus)
        : await connectEnvironment(this.makeTarget(), this.packageSpec, onStatus);
      EnvironmentSession.current = connection;
      this.pairingToken = '';
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
      connection.rpc.callStream(WS.threadsList, new EmptyPayload(), (values: object[]) => {
        for (const value of values) this.shell.apply(value as ShellItem);
        const rows: ThreadRow[] = [];
        for (const shell of this.shell.threads) {
          if (shell.archivedAt) continue;
          const row: ThreadRow = {
            id: shell.id, title: shell.title ?? '（未命名）', state: shell.session?.status ?? 'idle'
          };
          rows.push(row);
        }
        this.threads = rows;
      }).catch((error: Error) => { this.status = `连接中断：${error.message}`; });
    } catch (error) {
      this.status = `线程列表失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async disconnect(): Promise<void> {
    const connection = this.connected;
    if (connection !== null) {
      connection.rpc.close();
    }
    if (!this.direct) await SshEnvironment.disconnect(this.makeTarget());
    EnvironmentSession.current = null;
    this.shell = new ShellState();
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
      'httpBaseUrl': connection !== null ? connection.httpBaseUrl : '',
      'cwd': this.shell.projects.find((project) => project.id ===
        this.shell.threads.find((entry) => entry.id === thread.id)?.projectId)?.workspaceRoot ?? ''
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
        .fontColor('#f8fafc')
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .padding({ top: 48, bottom: 8 })

      if (this.connected === null) {
        Row({ space: 8 }) {
          Button('环境地址 / Tailscale').onClick(() => { this.direct = true; })
          Button('SSH').onClick(() => { this.direct = false; })
        }
        if (this.direct) {
          TextInput({ placeholder: 'https://环境名称.ts.net', text: this.environmentUrl })
            .fontColor('#f8fafc')
            .placeholderColor('#94a3b8')
            .backgroundColor('#1e293b')
            .onChange((value: string) => { this.environmentUrl = value; })
          TextInput({ placeholder: '配对令牌', text: this.pairingToken })
            .fontColor('#f8fafc')
            .placeholderColor('#94a3b8')
            .backgroundColor('#1e293b')
            .type(InputType.Password)
            .onChange((value: string) => { this.pairingToken = value; })
        } else {
        TextInput({ placeholder: '主机（hostname）', text: this.hostname })
          .fontColor('#f8fafc')
          .placeholderColor('#94a3b8')
          .backgroundColor('#1e293b')
          .onChange((value: string) => {
            this.hostname = value;
          })
        TextInput({ placeholder: '端口', text: this.port })
          .fontColor('#f8fafc')
          .placeholderColor('#94a3b8')
          .backgroundColor('#1e293b')
          .onChange((value: string) => {
            this.port = value;
          })
        TextInput({ placeholder: '用户名', text: this.username })
          .fontColor('#f8fafc')
          .placeholderColor('#94a3b8')
          .backgroundColor('#1e293b')
          .onChange((value: string) => {
            this.username = value;
          })
        TextInput({ placeholder: '密码', text: this.password })
          .fontColor('#f8fafc')
          .placeholderColor('#94a3b8')
          .backgroundColor('#1e293b')
          .type(InputType.Password)
          .onChange((value: string) => {
            this.password = value;
          })
        TextInput({ placeholder: '远端 t3 包（t3@nightly / t3@latest）', text: this.packageSpec })
          .fontColor('#f8fafc')
          .placeholderColor('#94a3b8')
          .backgroundColor('#1e293b')
          .onChange((value: string) => {
            this.packageSpec = value;
          })
        }
        Button(this.connecting ? '连接中…' : '连接环境')
          .enabled(!this.connecting && (this.direct ? this.environmentUrl.length > 0 && this.pairingToken.length > 0 : this.hostname.length > 0))
          .width('100%')
          .onClick(() => {
            this.connect();
          })
      } else {
        Text(this.status)
          .fontSize(14)
          .fontColor('#4ade80')
        Row({ space: 8 }) {
          Button('断开').onClick(() => {
            this.disconnect();
          })
        }
        List({ space: 4 }) {
          ForEach(this.threads, (thread: ThreadRow) => {
            ListItem() {
              Column({ space: 2 }) {
                Text(thread.title).fontColor('#f8fafc').fontSize(16).maxLines(1)
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
