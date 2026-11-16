import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { initialize, setForeground, dispose } from '../generated/core.js';

export default class EntryAbility extends UIAbility {
  onCreate(): void {
    initialize(this.context).catch(() => { console.error('T3P1 initialization failed'); });
  }
  onForeground(): void { setForeground(true); }
  onBackground(): void { setForeground(false); }
  onDestroy(): void { dispose(); }
  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index');
  }
}
