import { Typography, resolveTypography, scaledFontSize, codeMetrics } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
/**
 * Diff 审查页：上游 Swift 渲染的 display list 由 SwiftFrame 逐操作回放。
 * 行数据/滚动/点击全部走 SwiftBridge 驱动上游代码，本页无第二份布局逻辑。
 */
import display from '@ohos.display';
import router from '@ohos.router';
import { EnvironmentSession } from '../connection/Environment';
import { RpcClient } from '../connection/Rpc';
import { DiffCheckpoint, DiffScope, diffScopes, checkpointRequest } from '../model/DiffScope';
import { DraftStore } from '../connection/DraftStore';
import { ReviewLine, formatLineComment, appendComment } from '../model/ReviewComment';
import { DiffRow, parseDiffRows } from '../model/DiffRows';
import { SwiftBridge } from '../bridge/NativeBridge';
import { SwiftFrame } from '../bridge/SwiftFrame';

interface DiffFontStyle { codeFontSize: number; lineNumberFontSize: number; rowHeight: number; gutterWidth: number; codePadding: number; textVerticalInset: number; codeFontWeight: string; lineNumberFontWeight: string; }
interface ThreadRequest { threadId: string; }
interface DiffSnapshot { thread: DiffThread; }
interface DiffThread { checkpoints?: DiffCheckpoint[]; }
interface DiffItem { kind: string; snapshot?: DiffSnapshot; }
interface FileAction { fileId: string; rowId?: string; }
interface DiffResult { diff: string; }
interface PreviewRequest { cwd: string; ignoreWhitespace: boolean; }
interface PreviewSource { kind: string; diff: string; truncated: boolean; }
interface PreviewResult { sources: PreviewSource[]; }

@Entry
@Component
struct DiffPage {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') @Watch('typographyChanged') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') @Watch('themeChanged') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
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
  @State scopes: DiffScope[] = [];
  @State selectedId: string = 'all';
  @State loading: boolean = false;
  @State notice: string = '';
  private collapsedFiles: string[] = [];
  private viewedFiles: string[] = [];
  private fileIds: string[] = [];
  private rows: DiffRow[] = [];
  @State commentRow: DiffRow | null = null;
  @State commentText: string = '';
  @State commentPath: string = '';
  @State savingComment: boolean = false;

  aboutToAppear(): void {
    this.active = true;
    this.load();
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.errorText = '';
    this.notice = '';
    this.ready = false;
    this.rpc?.close();
    this.rpc = null;
    try {
      const params = router.getParams() as Record<string, string>;
      const environment = EnvironmentSession.current;
      if (environment === null) throw new Error('连接已关闭，请返回重新连接');
      const rpc = await environment.openRpc();
      if (!this.active) { rpc.close(); return; }
      this.rpc = rpc;
      const threadId = params['threadId'] ?? '';
      const subscription: ThreadRequest = { threadId: threadId };
      const checkpoints = await new Promise<DiffCheckpoint[]>((resolve, reject) => {
        rpc.callStream('orchestration.subscribeThread', subscription, (values: object[]) => {
          for (const value of values) {
            const item = value as DiffItem;
            if (item.kind === 'snapshot' && item.snapshot !== undefined) {
              resolve(item.snapshot.thread.checkpoints ?? []);
            }
          }
        }).catch((error: Error) => { reject(error); });
      });
      if (!this.active) return;
      this.scopes = diffScopes(checkpoints);
      let scope = this.scopes.find((item: DiffScope) => item.id === this.selectedId);
      if (scope === undefined) scope = this.scopes[0];
      this.selectedId = scope.id;
      let diff = '';
      if (scope.id === 'workspace') {
        const request: PreviewRequest = { cwd: params['cwd'] ?? '', ignoreWhitespace: false };
        const preview = await rpc.call<PreviewResult>('review.getDiffPreview', request);
        const source = preview.sources.find((item: PreviewSource) => item.kind === 'working-tree');
        diff = source?.diff ?? '';
        if (source?.truncated) this.notice = '变更内容过长，当前显示已截断';
      } else {
        const query = checkpointRequest(threadId, scope.turnCount, scope.id === 'all');
        const result = await rpc.call<DiffResult>(query.method, query.payload);
        diff = result.diff;
      }
      if (!this.active) return;
      const rows = parseDiffRows(diff);
      this.rows = rows;
      if (rows.length === 0) { this.notice = '此范围没有文件变更'; return; }
      const bridge = SwiftBridge.ensure();
      if (this.instance === null) this.instance = bridge.createView('T3ReviewDiffSurface');
      const instance = this.instance;
      if (instance === null) throw new Error('无法创建 review-diff 实例');
      this.applyTheme();
      this.applyTypography();
      bridge.callAsync('T3ReviewDiffSurface', 'setRowsJson', instance,
        JSON.stringify([JSON.stringify(rows)]));
      bridge.pumpMainQueue();
      this.fileIds = rows.filter((row) => row.kind === 'file').map((row) => row.id);
      this.collapsedFiles = [];
      this.viewedFiles = [];
      bridge.setProp(instance, 'collapsedFileIdsJson', '[]');
      bridge.setProp(instance, 'viewedFileIdsJson', '[]');
      this.offsetY = 0;
      bridge.setScrollOffset(instance, 0, 0);
      this.refresh();
      this.ready = true;
      SwiftBridge.setEventListener((instanceId: string, name: string, payloadJson: string) => {
        if (instanceId !== instance) return;
        if (name === 'onPressLine') {
          const action = JSON.parse(payloadJson) as FileAction;
          const row = this.rows.find((entry: DiffRow) => entry.id === action.rowId && entry.kind === 'line');
          if (row !== undefined) {
            this.commentPath = this.rows.find((entry: DiffRow) => entry.id === row.fileId)?.filePath ?? '';
            this.commentRow = row;
            this.commentText = '';
          }
          return;
        }
        if (name === 'onToggleFile' || name === 'onToggleViewedFile') {
          const action = JSON.parse(payloadJson) as FileAction;
          if (!this.fileIds.includes(action.fileId)) return;
          if (name === 'onToggleFile') {
            this.collapsedFiles = this.collapsedFiles.includes(action.fileId)
              ? this.collapsedFiles.filter((id: string) => id !== action.fileId)
              : this.collapsedFiles.concat([action.fileId]);
            bridge.setProp(instance, 'collapsedFileIdsJson', JSON.stringify(this.collapsedFiles));
          } else {
            this.viewedFiles = this.viewedFiles.includes(action.fileId)
              ? this.viewedFiles.filter((id: string) => id !== action.fileId)
              : this.viewedFiles.concat([action.fileId]);
            bridge.setProp(instance, 'viewedFileIdsJson', JSON.stringify(this.viewedFiles));
          }
        }
        this.refresh();
      });
    } catch (error) {
      if (this.active) this.errorText = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.active) this.loading = false;
    }
  }

  private async addComment(): Promise<void> {
    const row = this.commentRow;
    const environment = EnvironmentSession.current;
    if (row === null || environment === null || !this.commentText.trim() || this.savingComment) return;
    this.savingComment = true;
    try {
      const params = router.getParams() as Record<string, string>;
      const store = await DraftStore.open(getContext(this).filesDir, environment.descriptor.environmentId, params['threadId']);
      const existing = await store.load();
      const index = this.rows.filter((entry: DiffRow) => entry.fileId === row.fileId && entry.kind === 'line')
        .findIndex((entry: DiffRow) => entry.id === row.id);
      const section = this.scopes.find((item: DiffScope) => item.id === this.selectedId);
      const line: ReviewLine = { change: row.change, content: row.content, oldLineNumber: row.oldLineNumber, newLineNumber: row.newLineNumber };
      const comment = formatLineComment(this.selectedId === 'workspace' ? 'working-tree' : this.selectedId,
        section?.value ?? 'Diff', this.commentPath, index, line, this.commentText);
      await store.save(appendComment(existing, comment));
      if (this.active) router.back();
    } catch (error) {
      this.errorText = error instanceof Error ? error.message : String(error);
    } finally { this.savingComment = false; }
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

  private applyTypography(): void {
    if (this.instance === null) return;
    const metrics = codeMetrics(this.sizes.codeFontSize);
    const style: DiffFontStyle = { codeFontSize: metrics.fontSize, lineNumberFontSize: metrics.lineNumberFontSize,
      rowHeight: metrics.rowHeight, gutterWidth: metrics.gutterWidth, codePadding: metrics.codePadding,
      textVerticalInset: metrics.textVerticalInset, codeFontWeight: 'regular', lineNumberFontWeight: 'regular' };
    SwiftBridge.ensure().setProp(this.instance, 'styleJson', JSON.stringify(style));
  }
  private typographyChanged(): void { this.applyTypography(); this.refresh(); }

  private applyTheme(): void {
    if (this.instance === null) return;
    const theme = ThemeRuntime.palette(this.themeKey);
    const bridge = SwiftBridge.ensure();
    bridge.setProp(this.instance, 'appearanceScheme', theme.scheme);
    bridge.setProp(this.instance, 'themeJson', JSON.stringify(theme.diff));
  }
  private themeChanged(): void {
    this.applyTheme();
    this.refresh();
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
        Button('返回').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => {
          router.back();
        })
        Text('Diff').fontColor(this.color('foreground')).fontSize(this.font(18)).fontWeight(FontWeight.Medium).layoutWeight(1)
        Button('刷新').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.loading && this.commentRow === null).onClick(() => { this.load(); })
      }
      .width('100%')

      if (this.scopes.length > 0) {
        Select(this.scopes).font({ size: this.font(16) }).optionFont({ size: this.font(16) }).selectedOptionFont({ size: this.font(16) }).fontColor(this.color('foreground')).backgroundColor(this.color('input'))
          .value(this.scopes.find((item: DiffScope) => item.id === this.selectedId)?.value ?? '')
          .enabled(!this.loading && this.commentRow === null)
          .onSelect((index: number) => {
            this.selectedId = this.scopes[index].id;
            this.load();
          })
          .width('100%')
      }
      if (this.commentRow !== null) {
        Text(`${this.commentPath} · ${this.commentRow.newLineNumber ?? this.commentRow.oldLineNumber}`)
          .fontColor(this.color('foreground')).fontSize(this.font(14))
        Text(this.commentRow.content ?? '').fontColor(this.color('foreground-muted')).fontFamily('monospace').maxLines(4)
        TextArea({ text: this.commentText, placeholder: '输入对此行的评论' }).fontSize(this.font(16)).fontColor(this.color('foreground')).backgroundColor(this.color('input')).placeholderColor(this.color('placeholder'))
          .onChange((value: string) => { this.commentText = value; }).height(140)
        Row({ space: 12 }) {
          Button('取消评论').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.savingComment).onClick(() => { this.commentRow = null; this.commentText = ''; })
          Button('加入任务草稿').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.savingComment && this.commentText.trim().length > 0)
            .onClick(() => { this.addComment(); })
        }
      }
      if (this.loading) { Text('正在加载变更…').fontColor(this.color('foreground-muted')) }
      if (this.notice.length > 0) { Text(this.notice).fontColor(this.color('foreground-muted')).fontSize(this.font(13)) }
      if (this.errorText.length > 0) {
        Text(this.errorText).fontSize(this.font(13)).fontColor(this.color('danger-foreground'))
      } else if (this.ready && this.commentRow === null) {
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
    .backgroundColor(this.color('screen'))
  }
}
