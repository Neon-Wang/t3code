import { TypographyRuntime } from '../connection/TypographyRuntime';
import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { Configuration } from '@ohos.app.ability.Configuration';
import { ThemeRuntime } from '../connection/ThemeRuntime';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'T3Code', 'ability onCreate');
  }

  onDestroy(): void {
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    this.loadWindow(windowStage);
  }

  onConfigurationUpdate(configuration: Configuration): void {
    ThemeRuntime.configurationChanged(configuration.colorMode);
  }

  private async loadWindow(windowStage: window.WindowStage): Promise<void> {
    await ThemeRuntime.initialize(this.context);
    await TypographyRuntime.initialize(this.context);
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code !== 0) {
        hilog.error(0x0000, 'T3Code', 'loadContent failed: %{public}s', JSON.stringify(error));
        return;
      }
      ThemeRuntime.attachWindow(windowStage.getMainWindowSync());
    });
  }

  onWindowStageDestroy(): void {
    ThemeRuntime.detachWindow();
  }

  onForeground(): void {
  }

  onBackground(): void {
  }
}
