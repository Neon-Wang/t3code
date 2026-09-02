/**
 * Diff 审查页：上游 Swift 渲染的 display list 由 SwiftFrame 逐操作回放。
 * 行数据/滚动/点击全部走 SwiftBridge 驱动上游代码，本页无第二份布局逻辑。
 */
import display from '@ohos.display';
import router from '@ohos.router';
import { SwiftBridge } from '../bridge/NativeBridge';
import { SwiftFrame } from '../bridge/SwiftFrame';

interface RouteParams {
  socketUrl: string;
}

interface SampleRow {
  kind: string;
  id: string;
  fileId: string;
  filePath?: string;
  text?: string;
  content?: string;
  change?: string;
  changeType?: string;
  newLineNumber?: number;
  oldLineNumber?: number;
  additions?: number;
  deletions?: number;
}

class SampleRowsPayload {
  rows: SampleRow[];

  constructor(rows: SampleRow[]) {
    this.rows = rows;
  }
}

@Entry
@Component
struct DiffPage {
  @State frameJson: string = '';
  @State ready: boolean = false;
  @State errorText: string = '';
  private instance: string | null = null;

  aboutToAppear(): void {
    try {
      const bridge = SwiftBridge.ensure();
      const instance = bridge.createView('T3ReviewDiffSurface');
      if (instance === null) {
        this.errorText = '无法创建 review-diff 实例';
        return;
      }
      this.instance = instance;
      bridge.setProp(instance, 'appearanceScheme', 'dark');
      bridge.setProp(instance, 'rowHeight', 24);
      const payload = new SampleRowsPayload(this.sampleRows());
      bridge.callAsync('T3ReviewDiffSurface', 'setRowsJson', instance,
        JSON.stringify(payload.rows));
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
    bridge.setFrame(this.instance, 360, 640, 3);
    const json = bridge.displayList(this.instance);
    if (json !== null) {
      this.frameJson = json;
    }
  }

  private sampleRows(): SampleRow[] {
    const header: SampleRow = {
      kind: 'file', id: 'f1', fileId: 'f1', filePath: 'Sources/App.swift',
      changeType: 'modified', additions: 3, deletions: 1
    };
    const hunk: SampleRow = { kind: 'hunk', id: 'h1', fileId: 'f1', text: '@@ -10,4 +10,6 @@' };
    const line: SampleRow = {
      kind: 'line', id: 'l1', fileId: 'f1', content: 'let value = compute(input)',
      change: 'new', newLineNumber: 11
    };
    return [header, hunk, line];
  }

  build() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Button('返回').onClick(() => {
          router.back();
        })
        Text('Diff').fontSize(18).fontWeight(FontWeight.Medium).layoutWeight(1)
        Button('重绘').onClick(() => {
          this.refresh();
        })
      }
      .width('100%')

      if (this.errorText.length > 0) {
        Text(this.errorText).fontSize(13).fontColor('#f87171')
      } else if (this.ready) {
        SwiftFrame({ frameJson: this.frameJson })
          .width('100%')
          .layoutWeight(1)
          .onAreaChange((_oldArea: Area, newArea: Area) => {
            const bridge = SwiftBridge.ensure();
            if (this.instance !== null) {
              const width = Number(newArea.width);
              const height = Number(newArea.height);
              bridge.setFrame(this.instance, width, height,
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
