import { Inbox, InboxPanel } from '../components/Inbox';
import { Threads } from '../components/Threads';
import { Environments } from '../components/Environments';
import { translate } from '../generated/core.js';
import { ClientState } from '../model/ClientState';

@Entry
@ComponentV2
struct Index {
  @Local state: ClientState = new ClientState();
  private paths: NavPathStack = new NavPathStack();
  aboutToAppear(): void { this.state.start(); }
  aboutToDisappear(): void { this.state.stop(); }

  @Builder
  questionSheet() {
    if (this.state.activeQuestion) { InboxPanel({ state: this.state, row: this.state.activeQuestion }) }
  }
  build() {
    Navigation(this.paths) {
      Tabs({ barPosition: BarPosition.End }) {
        TabContent() { Threads({ state: this.state, openInbox: (environmentId: string, threadId: string) => { this.state.openThreadQuestions(environmentId, threadId); } }) }
          .tabBar(translate('mobile.workspaceSidebarTabs.threads'))
        TabContent() {
          Inbox({ state: this.state })
        }.tabBar(translate('inbox.title'))
        TabContent() {
          Environments({ state: this.state })
        }.tabBar(translate('mobile.workspaceRootScreen.settings'))
      }.barMode(BarMode.Fixed).animationDuration(0).height('100%')
    }.title('T3 Code').mode(NavigationMode.Stack)
      .backgroundColor($r('app.color.screen'))
      .bindSheet($$this.state.inboxOpened, this.questionSheet(), { height: SheetSize.MEDIUM, detents: [SheetSize.MEDIUM, SheetSize.LARGE], onDisappear: () => { this.state.inboxOpened = false; }, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}
