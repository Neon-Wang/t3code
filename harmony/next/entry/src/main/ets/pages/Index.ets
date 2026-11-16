import { connect, subscribe, getSnapshot, disconnect, translate } from '../generated/core.js';

interface ThreadRow {
  id: string;
  title: string;
  project: string;
}
interface Snapshot {
  status: string;
  connected: boolean;
  rows: ThreadRow[];
}

@Entry
@Component
struct Index {
  @State pairingUrl: string = '';
  @State status: string = '未连接';
  @State rows: ThreadRow[] = [];
  @State busy: boolean = false;
  @State connected: boolean = false;
  private firstListReported: boolean = false;
  private unsubscribe: () => void = () => {};

  aboutToAppear(): void {
    this.update(getSnapshot());
    this.unsubscribe = subscribe((snapshot: string) => { this.update(snapshot); });
  }

  aboutToDisappear(): void {
    this.unsubscribe();
  }

  private update(snapshot: string): void {
    const state = JSON.parse(snapshot) as Snapshot;
    this.status = state.status;
    this.connected = state.connected;
    this.rows = state.rows;
  }

  build() {
    Column({ space: 12 }) {
      Text('T3 Code').fontColor($r('app.color.foreground')).fontSize(24)
      TextInput({ placeholder: translate('settings.connections.pairingLinkText'), text: this.pairingUrl })
        .id('pairingUrl')
        .onChange((value: string) => { this.pairingUrl = value; })
      Button(this.connected ? '断开' : '连接')
        .id('connect')
        .enabled(!this.busy && (this.connected || this.pairingUrl.length > 0))
        .onClick(async () => {
          this.busy = true;
          try {
            if (this.connected) {
              await disconnect();
            } else {
              await connect(this.pairingUrl, this.getUIContext().getHostContext()!);
              this.pairingUrl = '';
            }
          } catch (error) {
            this.status = '连接失败';
            console.error('T3P0 connect failed');
          } finally {
            this.busy = false;
          }
        })
      Text(this.status).id('status')
      Text(`会话数：${this.rows.length}`).id('count')
      List() {
        ForEach(this.rows, (row: ThreadRow) => {
          ListItem() {
            Column() {
              Text(row.title)
              Text(row.project)
            }.alignItems(HorizontalAlign.Start).padding(8)
          }.onVisibleAreaChange([0.0], (visible: boolean) => {
            if (visible && !this.firstListReported) {
              this.firstListReported = true;
              console.info(`T3P0 first list visible count=${this.rows.length} at=${Date.now()}`);
            }
          })
        }, (row: ThreadRow) => row.id)
      }.layoutWeight(1)
    }.padding(20).width('100%').height('100%').backgroundColor($r('app.color.screen'))
  }
}
