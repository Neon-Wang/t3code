import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import '../generated/core.js';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index');
  }
}
