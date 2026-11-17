import { Inbox, InboxPanel } from '../components/Inbox';
import { Threads } from '../components/Threads';
import { Environments } from '../components/Environments';
import { Glyph } from '../components/Glyph';
import { NewTask } from '../components/NewTask';
import { translate, beginNewTask, workspaceLayout } from '../generated/core.js';
import { ClientState } from '../model/ClientState';
import { ThreadDetail, ThreadRoute } from '../components/ThreadDetail';

interface WorkspaceLayout { usesSplitView: boolean; listPaneWidth: number | null; }

@Entry
@ComponentV2
struct Index {
  @Local state: ClientState = new ClientState();
  @Local tab: number = 0;
  @Local paneWidth: number = 300;
  private paths: NavPathStack = new NavPathStack();
  aboutToAppear(): void { this.state.start(); }
  aboutToDisappear(): void { this.state.stop(); }

  private openThread(route: ThreadRoute): void {
    this.state.selectedEnvironmentId = route.environmentId;
    this.state.selectedThreadId = route.threadId;
    if (this.state.wide && this.paths.size() > 0) { this.paths.replacePath({ name: 'thread', param: route }); }
    else { this.paths.pushPath({ name: 'thread', param: route }); }
  }
  @Builder
  destination(name: string, parameter: Object) {
    if (name === 'new-task') { NewTask({ opened: (route: ThreadRoute) => { this.paths.pop(); this.openThread(route); } }) }
    if (name === 'thread') { ThreadDetail({ route: parameter as ThreadRoute }) }
  }

  @Builder
  questionSheet() {
    if (this.state.activeQuestion) { InboxPanel({ state: this.state, row: this.state.activeQuestion }) }
  }
  // Mirrors the Android navigation bar: icon in a selection pill, label below, inbox count badge.
  @Builder
  tabItem(index: number, icon: string, label: string) {
    Column({ space: 4 }) {
      Stack({ alignContent: Alignment.TopEnd }) {
        Row() { Glyph({ name: icon, side: 24, tint: $r('app.color.foreground') }) }
          .width(56).height(32).borderRadius(16).justifyContent(FlexAlign.Center)
          .backgroundColor(this.tab === index ? $r('app.color.tab_indicator') : Color.Transparent)
        // Read the count here: builder arguments are copied once and would not refresh.
        if (index === 1 && this.state.inboxCount > 0) {
          Text(this.state.inboxCount > 99 ? '99+' : `${this.state.inboxCount}`).fontSize(10).fontWeight(FontWeight.Medium).fontColor($r('app.color.tab_badge_foreground'))
            .height(16).constraintSize({ minWidth: 16 }).padding({ left: 4, right: 4 }).borderRadius(8)
            .textAlign(TextAlign.Center).backgroundColor($r('app.color.tab_badge'))
            .margin({ top: -2, right: 8 })
        }
      }
      Text(label).fontSize(12).fontWeight(this.tab === index ? FontWeight.Medium : FontWeight.Normal)
        .fontColor($r('app.color.foreground'))
    }.width('100%').height('100%').justifyContent(FlexAlign.Center)
  }
  build() {
    Column() {
    ForEach([this.state.locale], (locale: string) => {
    Navigation(this.paths) {
      Tabs({ barPosition: BarPosition.End, index: this.tab }) {
        TabContent() { Threads({ state: this.state, newTask: (environmentId: string, threadId: string) => { beginNewTask(environmentId, threadId); this.paths.pushPath({ name: 'new-task' }); }, openThread: (environmentId: string, threadId: string) => { const route: ThreadRoute = { environmentId, threadId }; this.openThread(route); }, openInbox: (environmentId: string, threadId: string) => { this.state.openThreadQuestions(environmentId, threadId); } }) }
          .tabBar(this.tabItem(0, 'tab.chats', translate('mobile.workspaceSidebarTabs.threads')))
        TabContent() {
          Inbox({ state: this.state })
        }.tabBar(this.tabItem(1, 'tab.inbox', translate('inbox.title')))
        TabContent() {
          Environments({ state: this.state })
        }.tabBar(this.tabItem(2, 'tab.settings', translate('mobile.workspaceRootScreen.settings')))
      }.barMode(BarMode.Fixed).barHeight(80).barBackgroundColor($r('app.color.tab_bar')).divider(null)
        .animationDuration(0).height('100%').onChange((index: number) => { this.tab = index; this.paths.clear(); if (index === 0 && this.state.wide && this.state.selectedThreadId) { this.openThread({ environmentId: this.state.selectedEnvironmentId, threadId: this.state.selectedThreadId }); } })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
    }.hideTitleBar(true).mode(this.state.wide && this.tab === 0 ? NavigationMode.Split : NavigationMode.Stack).navBarWidth(this.paneWidth).navBarWidthRange([280, 380]).minContentWidth(320).backgroundColor(Color.Transparent).navDestination(this.destination)
      .bindSheet($$this.state.inboxOpened, this.questionSheet(), { height: SheetSize.MEDIUM, detents: [SheetSize.MEDIUM, SheetSize.LARGE], onDisappear: () => { this.state.inboxOpened = false; }, showClose: false, backgroundColor: $r('app.color.sheet_solid') })
    }, (locale: string) => locale)
    // The app bar color runs under the status bar and the tab bar color under the gesture bar.
    }.width('100%').height('100%')
      .onSizeChange((_old: SizeOptions, size: SizeOptions) => {
        const layout = JSON.parse(workspaceLayout(Number(size.width), Number(size.height))) as WorkspaceLayout;
        this.state.wide = layout.usesSplitView;
        this.paneWidth = layout.listPaneWidth ?? 300;
      })
      .linearGradient({ direction: GradientDirection.Bottom, colors: [[$r('app.color.app_bar'), 0.5], [$r('app.color.tab_bar'), 0.5]] })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
