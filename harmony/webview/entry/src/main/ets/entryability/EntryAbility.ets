import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    // Mirrors the desktop app's Electron scheme registration. `isSecure` buys a
    // secure context, which the client needs for WebCrypto; a custom scheme is
    // not on the engine's mixed-content-restricted list, so the plain ws://
    // socket every LAN T3 server speaks is still allowed. An https page gets
    // only the first half of that and the socket is blocked outright.
    //
    // Must run before the first Web component is built, so it lives here.
    try {
      webview.WebviewController.customizeSchemes([
        {
          schemeName: 't3code',
          isStandard: true,
          isSecure: true,
          isSupportCORS: true,
          isSupportFetch: true
        }
      ]);
      hilog.info(0x0000, 'T3CodeWeb', 'custom scheme registered');
    } catch (error) {
      hilog.error(0x0000, 'T3CodeWeb', 'customizeSchemes failed: %{public}s', JSON.stringify(error));
    }
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code !== 0) {
        hilog.error(0x0000, 'T3CodeWeb', 'loadContent failed: %{public}s', JSON.stringify(error));
      }
    });
  }
}
