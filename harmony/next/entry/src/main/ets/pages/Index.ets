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

  build() {
    Navigation(this.paths) {
      Tabs({ barPosition: BarPosition.End }) {
        TabContent() { Threads({ state: this.state }) }
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
