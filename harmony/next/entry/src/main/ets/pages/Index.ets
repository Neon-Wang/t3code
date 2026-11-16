import { Environments } from '../components/Environments';
import { translate } from '../generated/core.js';
import { ClientState, ThreadRow } from '../model/ClientState';

@Entry
@ComponentV2
struct Index {
  @Local state: ClientState = new ClientState();
  private paths: NavPathStack = new NavPathStack();
  private firstListReported: boolean = false;

  aboutToAppear(): void { this.state.start(); }
  aboutToDisappear(): void { this.state.stop(); }

  @Builder
  threads() {
    Column() {
      Text(this.state.status).fontColor($r('app.color.foreground_muted')).padding(12)
      List({ space: 8 }) {
        Repeat<ThreadRow>(this.state.rows).each((item: RepeatItem<ThreadRow>) => {
          ListItem() {
            Column({ space: 6 }) {
              Text(item.item.project).fontSize(12).fontColor($r('app.color.foreground_muted'))
              Text(item.item.title).fontSize(16).fontColor($r('app.color.foreground')).maxLines(1)
            }.width('100%').alignItems(HorizontalAlign.Start).padding(16)
              .backgroundColor($r('app.color.card')).borderRadius(12)
          }.onVisibleAreaChange([0.0], (visible: boolean) => {
            if (visible && !this.firstListReported) {
              this.firstListReported = true;
              console.info(`T3P1 first list visible count=${this.state.rows.length} at=${Date.now()}`);
            }
          })
        }).key((row: ThreadRow) => `${row.environmentId}:${row.id}`).virtualScroll()
      }.layoutWeight(1).padding({ left: 16, right: 16 })
    }.height('100%')
  }

  build() {
    Navigation(this.paths) {
      Tabs({ barPosition: BarPosition.End }) {
        TabContent() { this.threads() }
          .tabBar(translate('mobile.workspaceSidebarTabs.threads'))
        TabContent() {
          Text(translate('inbox.loading')).fontColor($r('app.color.foreground_muted'))
        }.tabBar(translate('inbox.title'))
        TabContent() {
          Environments({ state: this.state })
        }.tabBar(translate('mobile.workspaceRootScreen.settings'))
      }.barMode(BarMode.Fixed).animationDuration(0).height('100%')
    }.title('T3 Code').mode(NavigationMode.Stack)
      .backgroundColor($r('app.color.screen'))
  }
}
