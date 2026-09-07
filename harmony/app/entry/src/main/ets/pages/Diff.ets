/**
 * Diff 审查页：上游 Swift 渲染的 display list 由 SwiftFrame 逐操作回放。
 * 行数据/滚动/点击全部走 SwiftBridge 驱动上游代码，本页无第二份布局逻辑。
 */
import display from '@ohos.display';
import router from '@ohos.router';
import { EnvironmentSession } from '../connection/Environment';
import { RpcClient } from '../connection/Rpc';
import { parseDiffRows } from '../model/DiffRows';
import { SwiftBridge } from '../bridge/NativeBridge';
import { SwiftFrame } from '../bridge/SwiftFrame';

interface DiffRequest {
  threadId: string;
  toTurnCount: number;
}
interface DiffResult {
  diff: string;
}

@Entry
@Component
struct DiffPage {
  @State frameJson: string = '';
  @State ready: boolean = false;
  @State errorText: string = '';
  private instance: string | null = null;
  private rpc: RpcClient | null = null;
  private active: boolean = false;
  private frameWidth: number = 360;
  private frameHeight: number = 640;
  private offsetY: number = 0;
  private panStartY: number = 0;
  @State selectionText: string = '';

  aboutToAppear(): void {
    this.active = true;
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const params = router.getParams() as Record<string, string>;
      const environment = EnvironmentSession.current;
      if (environment === null) throw new Error('连接已关闭，请返回重新连接');
      const toTurnCount = Number(params['toTurnCount'] ?? '0');
      if (toTurnCount === 0) {
        this.errorText = '当前任务尚无已完成的变更检查点';
        return;
      }
      const rpc = await environment.openRpc();
      if (!this.active) { rpc.close(); return; }
      this.rpc = rpc;
      const request: DiffRequest = { threadId: params['threadId'] ?? '', toTurnCount: toTurnCount };
      const result = await rpc.call<DiffResult>('orchestration.getFullThreadDiff', request);
      if (!this.active) return;
      const rows = parseDiffRows(result.diff);
      if (rows.length === 0) { this.errorText = '当前任务没有文件变更'; return; }
      const bridge = SwiftBridge.ensure();
      const instance: string | null = bridge.createView('T3ReviewDiffSurface');
      if (instance === null) {
        this.errorText = '无法创建 review-diff 实例';
        return;
      }
      this.instance = instance;
      bridge.setProp(instance, 'appearanceScheme', 'dark');
      bridge.setProp(instance, 'rowHeight', 24);

      bridge.callAsync('T3ReviewDiffSurface', 'setRowsJson', instance,
        JSON.stringify([JSON.stringify(rows)]));
      bridge.pumpMainQueue();
      this.refresh();
      this.ready = true;
      // 行点击（onPressLine 等）由事件回调送回；此处接住刷新即可。
      SwiftBridge.setEventListener((instanceId: string, name: string, _payloadJson: string) => {
        if (instanceId === instance && name.startsWith('on')) {
          this.refresh();
        }
      });
    } catch (error) {
      this.errorText = error instanceof Error ? error.message : String(error);
    }
  }

  aboutToDisappear(): void {
    this.active = false;
    this.rpc?.close();
    if (this.instance !== null) {
      SwiftBridge.ensure().destroyView(this.instance);
      this.instance = null;
    }
    SwiftBridge.setEventListener(null);
  }

  private refresh(): void {
    if (this.instance === null) {
      return;
    }
    const bridge = SwiftBridge.ensure();
    bridge.setFrame(this.instance, this.frameWidth, this.frameHeight, display.getDefaultDisplaySync().densityPixels);
    const json: string | null = bridge.displayList(this.instance);
    if (json !== null) {
      this.frameJson = json;
    }
  }

  build() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Button('返回').onClick(() => {
          router.back();
        })
        Text('Diff').fontColor('#f8fafc').fontSize(18).fontWeight(FontWeight.Medium).layoutWeight(1)
        Button('重绘').onClick(() => {
          this.refresh();
        })
      }
      .width('100%')

      if (this.errorText.length > 0) {
        Text(this.errorText).fontSize(13).fontColor('#f87171')
      } else if (this.ready) {
        SwiftFrame({ frameJson: this.frameJson })
          .onTouch((event: TouchEvent) => {
            if (this.instance === null || event.touches.length === 0) return;
            const touch = event.touches[0];
            const phase = event.type === TouchType.Down ? 0 : (event.type === TouchType.Move ? 1 : 2);
            SwiftBridge.ensure().touch(this.instance, phase, touch.x, touch.y);
            this.refresh();
          })
          .gesture(PanGesture().onActionStart(() => { this.panStartY = this.offsetY; })
            .onActionUpdate((event: GestureEvent) => {
              if (this.instance === null) return;
              this.offsetY = Math.max(0, this.panStartY - event.offsetY);
              SwiftBridge.ensure().setScrollOffset(this.instance, 0, this.offsetY);
              this.refresh();
            }))
          .width('100%')
          .layoutWeight(1)
          .onAreaChange((_oldArea: Area, newArea: Area) => {
            const bridge = SwiftBridge.ensure();
            if (this.instance !== null) {
              this.frameWidth = Number(newArea.width);
              this.frameHeight = Number(newArea.height);
              bridge.setFrame(this.instance, this.frameWidth, this.frameHeight,
                display.getDefaultDisplaySync().densityPixels);
              this.refresh();
            }
          })
      }
    }
    .padding(16)
    .width('100%')
    .height('100%')
    .backgroundColor('#0f172a')
  }
}
