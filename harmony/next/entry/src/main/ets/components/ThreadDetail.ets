import { FrameCallback } from '@ohos.arkui.UIContext';
import { ThreadCard, ThreadCardView } from './ThreadCards';
import { subscribeThread, threadFeedAction, translate } from '../generated/core.js';
import { ThreadComposer, ComposerSnapshot } from './ThreadComposer';
import { MarkdownText, copyText } from './MarkdownText';
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
  workingSince: string;
}
interface FeedActivity {
  plan: string; id: string; icon: string; reasoning: boolean; title: string; expandable: boolean; expanded: boolean;
  command: string; lines: string[]; output: string; exit: string; detail: string; error: string; failed: boolean; retryRunId: string;
}
interface FeedImage { path: string; url: string; status: string; }
interface FeedRow { id: string; type: string; text: string; role: string; time: string; meta: boolean; expanded: boolean; activities: FeedActivity[]; images: FeedImage[]; files: string[]; }

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
  @Local workingSince: string = '';
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
      this.workingSince = snapshot.workingSince;
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
        Stack({ alignContent: Alignment.Bottom }) {
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
              // Room for the working pill so it never covers the last reply.
              ListItem() { Column().width("100%").height(this.workingSince ? 56 : 8) }
            }.width('100%').height('100%').maintainVisibleContentPosition(true)
              .padding({ left: this.wide ? 20 : 16, right: this.wide ? 20 : 16, top: 8 })
              .onDidScroll(() => { this.followLatest = this.scroller.isAtEnd(); })
              .onScrollIndex((_start: number, end: number) => { if (end >= this.rows.length) { this.reachedEnd = true; } })
              .onReachStart(() => { if (this.reachedEnd && this.hasMore && !this.loadingHistory && !this.historyError) { this.action('earlier'); } })
          }
          if (this.workingSince) { WorkingPill({ since: this.workingSince }).margin({ bottom: 8 }) }
        }.width('100%').layoutWeight(1)
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


// Glyphs for ThreadFeedActivity icons, following workRowSymbolName in thread-work-log.tsx.
function activityGlyph(icon: string): string {
  switch (icon) {
    case 'brain': return 'brain';
    case 'agent': return 'robot';
    case 'alert': return 'exclamationmark.circle';
    case 'browser': case 'globe': return 'globe';
    case 'check': return 'checkmark';
    case 'command': return 'terminal';
    case 'computer': return 'desktopcomputer';
    case 'code': return 'chevron.left.forwardslash.chevron.right';
    case 'edit': return 'square.and.pencil';
    case 'eye': return 'eye';
    case 'search': return 'magnifyingglass';
    case 'stop': return 'stop.fill';
    case 'hammer': return 'hammer';
    case 'lock': return 'lock';
    case 'message': return 'bubble.left';
    case 'warning': return 'xmark';
    case 'zap': return 'bolt';
    default: return 'wrench.and.screwdriver';
  }
}

// Android formatWorkingDuration: seconds, then "Mm SSs", then hours.
function workingDuration(since: string, now: number): string {
  const started = Date.parse(since);
  const total = Number.isFinite(started) && now > started ? Math.floor((now - started) / 1000) : 0;
  if (total < 60) { return `${total}s`; }
  const minutes = Math.floor(total / 60);
  if (total >= 3600) { return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
}

/** The floating "working" capsule above the composer; its label ticks once a second while visible. */
@ComponentV2
struct WorkingPill {
  @Require @Param since: string;
  @Local now: number = Date.now();
  private timer: number = -1;
  aboutToAppear(): void { this.timer = setInterval(() => { this.now = Date.now(); }, 1000); }
  aboutToDisappear(): void { clearInterval(this.timer); }
  build() {
    Row() {
      Text(`${translate('mobile.threads.working')}${workingDuration(this.since, this.now)}`)
        .fontSize(13).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground')).maxLines(1)
        .fontFeature('"tnum" on')
    }.height(38.5).padding({ left: 14, right: 14 }).borderRadius(19.25)
      .backgroundColor($r('app.color.glass_fallback')).border({ width: 1, color: $r('app.color.border') })
      .shadow({ radius: 8, color: '#1a000000', offsetY: 2 })
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
  @Builder
  image(item: FeedImage, width: Length, height: number) {
    if (item.url) { Image(item.url).width(width).height(height).objectFit(ImageFit.Cover).borderRadius(14).accessibilityText(item.path) }
    else { Text(item.status === 'Failure' ? `${item.path} · 图片加载失败` : item.path).fontSize(12).fontColor($r('app.color.foreground_muted')) }
  }
  @Builder
  copyButton(side: number, icon: number) {
    Row() { Glyph({ name: 'doc.on.doc', side: icon, tint: $r('app.color.icon_subtle') }) }
      .width(side).height(side).justifyContent(FlexAlign.Center).borderRadius(side / 2).accessibilityText('复制消息')
      .stateStyles({ pressed: { .backgroundColor($r('app.color.row_hover')) } })
      .onClick(() => { copyText(this.getUIContext(), this.row.text); })
  }
  @Builder
  userMessage() {
    Column() {
      Column({ space: 7 }) {
        if (this.row.text) {
          Text(this.row.text).fontSize(16).lineHeight(23).fontColor($r('app.color.user_bubble_foreground')).copyOption(CopyOptions.LocalDevice)
        }
        ForEach(this.row.files, (name: string) => {
          Row({ space: 6 }) {
            Glyph({ name: 'folder', side: 16, tint: $r('app.color.user_bubble_foreground_muted') })
            Text(name).fontSize(14).fontColor($r('app.color.user_bubble_foreground')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          }
        }, (name: string) => name)
        ForEach(this.row.images, (item: FeedImage) => { this.image(item, 180, 140) }, (item: FeedImage) => `${item.path}:${item.status}:${item.url}`)
      }.padding({ left: 12, right: 12, top: 9, bottom: 9 }).borderRadius(20).backgroundColor($r('app.color.user_bubble'))
        .alignItems(HorizontalAlign.Start).constraintSize({ maxWidth: '85%' })
      Row({ space: 4 }) {
        Text(this.row.time).fontSize(13).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground_secondary')).fontFeature('"tnum" on')
        this.copyButton(28, 13)
      }.margin({ top: 4 })
    }.width('100%').alignItems(HorizontalAlign.End).margin({ bottom: 17 })
  }
  @Builder
  assistantMessage() {
    Column({ space: 8 }) {
      if (this.row.text) { MarkdownText({ text: this.row.text }) }
      ForEach(this.row.files, (name: string) => { Text(name).fontSize(14).fontColor($r('app.color.foreground')) }, (name: string) => name)
      ForEach(this.row.images, (item: FeedImage) => { this.image(item, '100%', 180) }, (item: FeedImage) => `${item.path}:${item.status}:${item.url}`)
      if (this.row.meta) {
        Row({ space: 4 }) {
          this.copyButton(40, 16)
          Text(this.row.time).fontSize(13).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground_secondary')).fontFeature('"tnum" on')
        }.margin({ left: -8 })
      }
    }.width('100%').alignItems(HorizontalAlign.Start).padding({ left: 3, right: 3 }).margin({ bottom: this.row.meta ? 17 : 4 })
  }
  build() {
    Column() {
      if (this.row.type === 'message' && this.row.role === 'user') { this.userMessage() }
      else if (this.row.type === 'message') { this.assistantMessage() }
      else if (this.row.type === 'run-fold') {
        // "Worked for 3m": a medium label, a chevron that turns down when open, and a hairline under it.
        Row({ space: 7 }) {
          Text(this.row.text).fontSize(14).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground_muted')).fontFeature('"tnum" on')
          Glyph({ name: 'chevron.right', side: 15, tint: $r('app.color.foreground_muted') }).rotate({ angle: this.row.expanded ? 90 : 0 })
        }.width('100%').height(42).padding({ left: 8, right: 8 }).margin({ bottom: 4 })
          .border({ width: { bottom: 0.5 }, color: $r('app.color.border') })
          .onClick(() => { this.choose('toggle', this.row.id); })
      } else if (this.row.type === 'work-toggle') {
        WorkRow({ icon: 'wrench.and.screwdriver', label: this.row.text, expandable: true, expanded: this.row.expanded, failed: false })
          .onClick(() => { this.choose('toggle', this.row.id); })
      } else if (this.row.type === 'thinking') {
        WorkRow({ icon: 'brain', label: this.row.text, expandable: false, expanded: false, failed: false })
      } else if (this.row.type === 'activity-group') {
        Repeat<FeedActivity>(this.row.activities).each((item: RepeatItem<FeedActivity>) => {
          ThreadActivityRow({ activity: this.row.activities[item.index], choose: this.choose, savePlan: (id: string) => { this.planActivity = id; this.planSheet = true; } })
        }).key((activity: FeedActivity) => activity.id)
      } else if (this.row.type === 'viewed-images') {
        ForEach(this.row.images, (item: FeedImage) => { this.image(item, '100%', 220) }, (item: FeedImage) => `${item.path}:${item.status}:${item.url}`)
      } else {
        WorkRow({ icon: 'globe', label: this.row.text, expandable: false, expanded: false, failed: false })
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
      .bindSheet($$this.planSheet, this.savePlanSheet(), { height: SheetSize.MEDIUM, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}

/** One work-log line (work-log-layout.tsx): a 14vp icon in a 21vp slot, a muted label, and a chevron. */
@ComponentV2
struct WorkRow {
  @Require @Param icon: string;
  @Require @Param label: string;
  @Param expandable: boolean = false;
  @Param expanded: boolean = false;
  @Param failed: boolean = false;
  build() {
    Row({ space: 5 }) {
      Row() { Glyph({ name: this.icon, side: 14, tint: this.failed ? $r('app.color.danger_foreground') : $r('app.color.icon_subtle') }) }
        .width(21).height(21).justifyContent(FlexAlign.Center)
      Text(this.label).fontSize(14).layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        .fontWeight(this.failed ? FontWeight.Medium : FontWeight.Normal)
        .fontColor(this.failed ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
      if (this.expandable) {
        Row() { Glyph({ name: 'chevron.down', side: 11, tint: $r('app.color.icon_subtle') }) }
          .width(14).height(14).justifyContent(FlexAlign.Center).rotate({ angle: this.expanded ? 180 : 0 })
      }
    }.width('100%').constraintSize({ minHeight: 28 }).padding({ left: 2, right: 2 }).borderRadius(5)
      .stateStyles({ pressed: { .backgroundColor($r('app.color.subtle_strong')) } })
  }
}

@ComponentV2
struct ThreadActivityRow {
  @Require @Param activity: FeedActivity;
  @Event choose: (action: string, id: string) => void = () => {};
  @Event savePlan: (id: string) => void = () => {};
  build() {
    Column({ space: 2 }) {
      WorkRow({ icon: activityGlyph(this.activity.icon), label: this.activity.title, expandable: this.activity.expandable,
        expanded: this.activity.expanded, failed: this.activity.failed })
        .onClick(() => { if (this.activity.expandable) { this.choose('activity', this.activity.id); } })
      if (this.activity.plan) {
        MarkdownText({ text: this.activity.plan })
        Button('保存到工作目录').fontSize(13).onClick(() => { this.savePlan(this.activity.id); })
      }
      if (!this.activity.plan && this.activity.expanded) {
        if (this.activity.reasoning && this.activity.detail) {
          Column() { MarkdownText({ text: this.activity.detail }) }.padding({ left: 24, top: 4, bottom: 4 })
        } else {
          // Expanded tool detail: monospace call, then muted output and a failing exit code, capped at 210vp.
          Scroll() {
            Column({ space: 6 }) {
              if (this.activity.command) { this.mono(this.activity.command, $r('app.color.foreground')) }
              ForEach(this.activity.lines, (line: string) => { this.mono(line, $r('app.color.foreground')) }, (line: string, index: number) => `${index}:${line}`)
              if (this.activity.detail) { this.mono(this.activity.detail, $r('app.color.foreground_muted')) }
              if (this.activity.output) { this.mono(this.activity.output, $r('app.color.foreground_muted')) }
              if (this.activity.exit) { this.mono(this.activity.exit, $r('app.color.danger_foreground')) }
            }.width('100%').alignItems(HorizontalAlign.Start).padding({ right: 8 })
          }.width('100%').constraintSize({ maxHeight: 210 }).align(Alignment.TopStart).nestedScroll({
            scrollForward: NestedScrollMode.SELF_FIRST, scrollBackward: NestedScrollMode.SELF_FIRST })
            .padding({ left: 26, top: 2, bottom: 4 })
        }
      }
      if (this.activity.error) { Text(this.activity.error).fontSize(12).fontColor($r('app.color.danger_foreground')).padding({ left: 26 }) }
      if (this.activity.retryRunId) { Button('重试创建工作目录').fontSize(13).onClick(() => { this.choose('retry-workspace', this.activity.retryRunId); }) }
    }.alignItems(HorizontalAlign.Start).width('100%')
  }
  @Builder
  mono(text: string, color: ResourceColor) {
    Text(text).fontSize(12).lineHeight(18).fontFamily('monospace').fontColor(color).copyOption(CopyOptions.LocalDevice).width('100%')
  }
}
