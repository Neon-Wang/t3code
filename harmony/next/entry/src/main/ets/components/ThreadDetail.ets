import { FrameCallback } from '@ohos.arkui.UIContext';
import { ThreadCard, ThreadCardView } from './ThreadCards';
import { subscribeThread, threadFeedAction, translate } from '../generated/core.js';
import { ThreadComposer, ComposerSnapshot } from './ThreadComposer';
import { MarkdownText } from './MarkdownText';
import { Glyph } from './Glyph';

export interface ThreadRoute { environmentId: string; threadId: string; }
interface ThreadSnapshot {
  cards: ThreadCard[];
  composer: ComposerSnapshot;
  title: string;
  project: string;
  environment: string;
  workspace: boolean;
  status: string;
  error: string;
  rows: FeedRow[];
  hasMore: boolean;
  loadingHistory: boolean;
  historyError: string;
}
interface FeedActivity { plan: string; id: string; title: string; expandable: boolean; expanded: boolean; detail: string; error: string; failed: boolean; retryRunId: string; }
interface FeedImage { path: string; url: string; status: string; }
interface FeedRow { id: string; type: string; text: string; role: string; expanded: boolean; activities: FeedActivity[]; images: FeedImage[]; files: string[]; }

class FollowLatestFrame extends FrameCallback {
  private callback: () => void;
  constructor(callback: () => void) { super(); this.callback = callback; }
  onIdle(_remaining: number): void { this.callback(); }
}

@ComponentV2
export struct ThreadDetail {
  @Require @Param route: ThreadRoute;
  @Param wide: boolean = false;
  @Local cards: ThreadCard[] = [];
  @Local composer: ComposerSnapshot = new ComposerSnapshot();
  @Local title: string = '';
  @Local project: string = '';
  @Local environment: string = '';
  @Local workspace: boolean = false;
  @Local status: string = 'empty';
  @Local error: string = '';
  @Local rows: FeedRow[] = [];
  @Local hasMore: boolean = false;
  @Local loadingHistory: boolean = false;
  @Local historyError: string = '';
  @Local actionError: string = '';
  private scroller: Scroller = new Scroller();
  private reachedEnd: boolean = false;
  private followLatest: boolean = true;
  private framePending: boolean = false;
  private lastMessage: string = '';
  private visible: boolean = false;
  private release: () => void = () => {};
  private stack: NavPathStack | undefined = undefined;

  private subscribe(): void {
    this.release();
    this.visible = true;
    this.release = subscribeThread(this.route.environmentId, this.route.threadId, (json: string) => {
      const snapshot = JSON.parse(json) as ThreadSnapshot;
      this.cards = snapshot.cards;
      this.composer = snapshot.composer;
      this.title = snapshot.title;
      this.project = snapshot.project;
      this.environment = snapshot.environment;
      this.workspace = snapshot.workspace;
      this.status = snapshot.status;
      this.error = snapshot.error;
      let lastMessage = '';
      for (let index = snapshot.rows.length - 1; index >= 0; index--) {
        if (snapshot.rows[index].type === 'message') { lastMessage = snapshot.rows[index].id + snapshot.rows[index].text; break; }
      }
      const changed = lastMessage !== this.lastMessage || snapshot.rows.length !== this.rows.length;
      this.lastMessage = lastMessage;
      this.rows = snapshot.rows;
      if (changed && this.followLatest && !this.framePending) {
        this.framePending = true;
        this.getUIContext().postFrameCallback(new FollowLatestFrame(() => {
          this.framePending = false;
          if (this.visible && this.followLatest) { this.scroller.scrollEdge(Edge.Bottom); }
        }));
      }
      this.hasMore = snapshot.hasMore;
      this.loadingHistory = snapshot.loadingHistory;
      this.historyError = snapshot.historyError;
    });
  }
  private async action(action: string, id: string = ''): Promise<void> {
    this.actionError = '';
    try { await threadFeedAction(this.route.environmentId, this.route.threadId, action, id); }
    catch (error) { this.actionError = translate('mobile.connectionTone.connectionFailed'); }
  }
  aboutToDisappear(): void { this.visible = false; this.release(); }
  // Files, git and terminal open P3 screens; until then the icons only say so, gated like Android.
  @Builder
  headerAction(icon: string, label: string) {
    Row() { Glyph({ name: icon, side: 24, tint: $r('app.color.header_foreground') }) }
      .width(48).height(48).justifyContent(FlexAlign.Center).borderRadius(24).accessibilityText(label)
      .stateStyles({ pressed: { .backgroundColor($r('app.color.row_hover')) } })
      .onClick(() => { this.getUIContext().getPromptAction().showToast({ message: `${label}将在后续版本提供`, duration: 1500 }); })
  }
  // The Android thread app bar: back arrow, title over "project · environment", then files, git, terminal.
  @Builder
  header() {
    Row() {
      if (!this.wide) {
        Row() { Glyph({ name: 'arrow.left', side: 24, tint: $r('app.color.header_foreground') }) }
          .width(48).height(48).justifyContent(FlexAlign.Center).borderRadius(24).accessibilityText('返回')
          .stateStyles({ pressed: { .backgroundColor($r('app.color.row_hover')) } })
          .onClick(() => { this.stack?.pop(); })
      }
      Column() {
        Text(this.title).fontSize(20).lineHeight(26).fontWeight(FontWeight.Medium).maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis }).fontColor($r('app.color.header_foreground'))
        Text([this.project, this.environment].filter((value: string) => value.length > 0).join(' · '))
          .fontSize(13).lineHeight(17).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).fontColor($r('app.color.foreground_muted'))
      }.layoutWeight(1).alignItems(HorizontalAlign.Start).padding({ left: this.wide ? 12 : 4, right: 4 })
      if (this.workspace) { this.headerAction('folder', '文件') }
      this.headerAction('point.topleft.down.curvedto.point.bottomright.up', 'Git')
      if (this.workspace) { this.headerAction('terminal', '终端') }
    }.width('100%').height(64).padding({ left: 4, right: 4, bottom: 4 })
  }

  build() {
    NavDestination() {
      Column() {
        this.header()
        Column() {
        if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
        if (this.status === 'empty' || this.status === 'synchronizing') { LoadingProgress().width(32).height(32) }
        if (this.status === 'deleted') { Text('会话已删除').fontColor($r('app.color.foreground_muted')) }
        if (this.historyError || this.actionError) { Text(this.historyError || this.actionError).fontSize(13).fontColor($r('app.color.danger_foreground')) }
        if (this.rows.length > 0) {
          List({ scroller: this.scroller, initialIndex: this.rows.length }) {
            ListItem() {
              if (this.hasMore) {
                Text(this.loadingHistory ? '正在加载…' : '加载更早消息').fontSize(13).fontColor($r('app.color.primary_text'))
                  .padding(12).enabled(!this.loadingHistory).onClick(() => { this.action('earlier'); })
              }
            }
            Repeat<FeedRow>(this.rows).each((item: RepeatItem<FeedRow>) => {
              ListItem() { ThreadFeedRow({ row: item.item, choose: (action: string, id: string) => { this.action(action, id); } }) }
            }).key((row: FeedRow) => row.id).virtualScroll()
          }.layoutWeight(1).width('100%').maintainVisibleContentPosition(true)
            .onDidScroll(() => { this.followLatest = this.scroller.isAtEnd(); })
            .onScrollIndex((_start: number, end: number) => { if (end >= this.rows.length) { this.reachedEnd = true; } })
            .onReachStart(() => { if (this.reachedEnd && this.hasMore && !this.loadingHistory && !this.historyError) { this.action('earlier'); } })
        } else { Blank().layoutWeight(1) }
        if (this.cards.length > 0) {
          Scroll() {
            Column({ space: 8 }) {
              Repeat<ThreadCard>(this.cards).each((item: RepeatItem<ThreadCard>) => {
                ThreadCardView({ card: this.cards[item.index], choose: (action: string, payload: string) => { this.action(action, payload); } })
              }).key((card: ThreadCard) => card.id)
            }.padding(12)
          }.constraintSize({ maxHeight: '45%' }).width('100%')
        }
        ThreadComposer({ environmentId: this.route.environmentId, threadId: this.route.threadId, snapshot: this.composer })
        }.width('100%').layoutWeight(1).backgroundColor($r('app.color.thread_canvas'))
          .borderRadius({ topLeft: 28, topRight: 28 }).clip(true)
      }.width('100%').height('100%')
    }.hideTitleBar(true).backgroundColor($r('app.color.app_bar'))
      .onReady((context: NavDestinationContext) => { this.stack = context.pathStack; })
      .onShown(() => { this.subscribe(); }).onHidden(() => { this.visible = false; this.release(); })
  }
}

@ComponentV2
struct ThreadFeedRow {
  @Require @Param row: FeedRow;
  @Event choose: (action: string, id: string) => void = () => {};
  @Local planPath: string = 'plan.md';
  @Local planActivity: string = '';
  @Local planSheet: boolean = false;
  @Builder
  savePlanSheet() {
    Column({ space: 16 }) {
      Text('保存计划到工作目录').fontSize(18).fontColor($r('app.color.foreground'))
      TextInput({ text: this.planPath, placeholder: '相对路径' }).onChange((value: string) => { this.planPath = value; })
      Text('同名文件会被覆盖。').fontSize(14).fontColor($r('app.color.foreground_muted'))
      Button('保存').enabled(this.planPath.trim().length > 0).onClick(() => {
        this.choose('plan-save', JSON.stringify({ activityId: this.planActivity, path: this.planPath.trim() }));
        this.planSheet = false;
      })
    }.padding(20)
  }
  build() {
    Column({ space: 8 }) {
      if (this.row.type === 'message') {
        Column({ space: 8 }) {
          if (this.row.text) { MarkdownText({ text: this.row.text }) }
          ForEach(this.row.files, (name: string) => { Text(name).fontSize(13).fontColor($r('app.color.foreground')) }, (name: string) => name)
          ForEach(this.row.images, (item: FeedImage) => {
            if (item.url) { Image(item.url).width('100%').height(180).objectFit(ImageFit.Contain).accessibilityText(item.path) }
            else { Text(item.status === 'Failure' ? `${item.path} · 图片加载失败` : item.path).fontSize(12).fontColor($r('app.color.foreground_muted')) }
          }, (item: FeedImage) => `${item.path}:${item.status}:${item.url}`)
        }
          .padding(this.row.role === 'user' ? 12 : 0).borderRadius(16)
          .backgroundColor(this.row.role === 'user' ? $r('app.color.grouped_card') : Color.Transparent)
      } else if (this.row.type === 'run-fold' || this.row.type === 'work-toggle') {
        Text(`${this.row.expanded ? '⌄' : '›'} ${this.row.text}`).fontSize(13).fontColor($r('app.color.foreground_muted'))
          .padding({ top: 8, bottom: 8 }).onClick(() => { this.choose('toggle', this.row.id); })
      } else if (this.row.type === 'activity-group') {
        Repeat<FeedActivity>(this.row.activities).each((item: RepeatItem<FeedActivity>) => {
          ThreadActivityRow({ activity: this.row.activities[item.index], choose: this.choose, savePlan: (id: string) => { this.planActivity = id; this.planSheet = true; } })
        }).key((activity: FeedActivity) => activity.id)
      } else if (this.row.type === 'viewed-images') {
        ForEach(this.row.images, (item: FeedImage) => {
          if (item.url) { Image(item.url).width('100%').height(220).objectFit(ImageFit.Contain).accessibilityText(item.path) }
          else { Text(item.status === 'Failure' ? `${item.path} · 图片加载失败` : item.path).fontSize(12).fontColor($r('app.color.foreground_muted')) }
        }, (item: FeedImage) => `${item.path}:${item.status}:${item.url}`)
      } else {
        Text(this.row.text).fontSize(13).fontColor($r('app.color.foreground_muted')).copyOption(CopyOptions.LocalDevice)
      }
    }.width('100%').alignItems(this.row.role === 'user' ? HorizontalAlign.End : HorizontalAlign.Start).padding({ left: 16, right: 16, top: 8, bottom: 8 })
      .bindSheet($$this.planSheet, this.savePlanSheet(), { height: SheetSize.MEDIUM, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}

@ComponentV2
struct ThreadActivityRow {
  @Require @Param activity: FeedActivity;
  @Event choose: (action: string, id: string) => void = () => {};
  @Event savePlan: (id: string) => void = () => {};
  build() {
    Column({ space: 6 }) {
      Text(`${this.activity.expandable ? (this.activity.expanded ? '⌄ ' : '› ') : ''}${this.activity.title}`)
        .fontSize(13).fontColor(this.activity.failed ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
        .onClick(() => { if (this.activity.expandable) { this.choose('activity', this.activity.id); } })
      if (this.activity.plan) {
        MarkdownText({ text: this.activity.plan })
        Button('保存到工作目录').fontSize(13).onClick(() => { this.savePlan(this.activity.id); })
      }
      if (!this.activity.plan && this.activity.expanded && this.activity.detail) {
        Text(this.activity.detail).fontSize(12).fontFamily('monospace').fontColor($r('app.color.foreground'))
          .copyOption(CopyOptions.LocalDevice).width('100%').padding(12).backgroundColor($r('app.color.grouped_card')).borderRadius(8)
      }
      if (this.activity.error) { Text(this.activity.error).fontSize(12).fontColor($r('app.color.danger_foreground')) }
      if (this.activity.retryRunId) { Button('重试创建工作目录').fontSize(13).onClick(() => { this.choose('retry-workspace', this.activity.retryRunId); }) }
    }.alignItems(HorizontalAlign.Start).width('100%')
  }
}
