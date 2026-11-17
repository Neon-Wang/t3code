import { subscribeThread, threadFeedAction, translate } from '../generated/core.js';

export interface ThreadRoute { environmentId: string; threadId: string; }
interface ThreadSnapshot {
  title: string;
  project: string;
  environment: string;
  status: string;
  error: string;
  rows: FeedRow[];
  hasMore: boolean;
  loadingHistory: boolean;
  historyError: string;
}
interface FeedActivity { id: string; title: string; expandable: boolean; expanded: boolean; detail: string; error: string; failed: boolean; }
interface FeedImage { path: string; url: string; status: string; }
interface FeedRow { id: string; type: string; text: string; role: string; expanded: boolean; activities: FeedActivity[]; images: FeedImage[]; }

@ComponentV2
export struct ThreadDetail {
  @Require @Param route: ThreadRoute;
  @Local title: string = '';
  @Local project: string = '';
  @Local environment: string = '';
  @Local status: string = 'empty';
  @Local error: string = '';
  @Local rows: FeedRow[] = [];
  @Local hasMore: boolean = false;
  @Local loadingHistory: boolean = false;
  @Local historyError: string = '';
  @Local actionError: string = '';
  private scroller: Scroller = new Scroller();
  private reachedEnd: boolean = false;
  private release: () => void = () => {};

  private subscribe(): void {
    this.release();
    this.release = subscribeThread(this.route.environmentId, this.route.threadId, (json: string) => {
      const snapshot = JSON.parse(json) as ThreadSnapshot;
      this.title = snapshot.title;
      this.project = snapshot.project;
      this.environment = snapshot.environment;
      this.status = snapshot.status;
      this.error = snapshot.error;
      this.rows = snapshot.rows;
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
  aboutToDisappear(): void { this.release(); }
  @Builder
  heading() {
    Column({ space: 2 }) {
      Text(this.title).fontSize(17).fontWeight(FontWeight.Medium).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).fontColor($r('app.color.foreground'))
      Text([this.project, this.environment].filter((value: string) => value.length > 0).join(' · '))
        .fontSize(12).maxLines(1).fontColor($r('app.color.foreground_muted'))
    }.alignItems(HorizontalAlign.Start)
  }

  build() {
    NavDestination() {
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
            .onScrollIndex((_start: number, end: number) => { if (end >= this.rows.length) { this.reachedEnd = true; } })
            .onReachStart(() => { if (this.reachedEnd && this.hasMore && !this.loadingHistory && !this.historyError) { this.action('earlier'); } })
        }
      }.width('100%').height('100%')
    }.title(this.heading()).backgroundColor($r('app.color.screen'))
      .onShown(() => { this.subscribe(); }).onHidden(() => { this.release(); })
  }
}

@ComponentV2
struct ThreadFeedRow {
  @Require @Param row: FeedRow;
  @Event choose: (action: string, id: string) => void = () => {};
  build() {
    Column({ space: 8 }) {
      if (this.row.type === 'message') {
        Text(this.row.text).fontSize(16).fontColor($r('app.color.foreground')).copyOption(CopyOptions.LocalDevice)
          .padding(this.row.role === 'user' ? 12 : 0).borderRadius(16)
          .backgroundColor(this.row.role === 'user' ? $r('app.color.grouped_card') : Color.Transparent)
      } else if (this.row.type === 'run-fold' || this.row.type === 'work-toggle') {
        Text(`${this.row.expanded ? '⌄' : '›'} ${this.row.text}`).fontSize(13).fontColor($r('app.color.foreground_muted'))
          .padding({ top: 8, bottom: 8 }).onClick(() => { this.choose('toggle', this.row.id); })
      } else if (this.row.type === 'activity-group') {
        ForEach(this.row.activities, (activity: FeedActivity) => {
          Column({ space: 6 }) {
            Text(`${activity.expandable ? (activity.expanded ? '⌄ ' : '› ') : ''}${activity.title}`)
              .fontSize(13).fontColor(activity.failed ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
              .onClick(() => { if (activity.expandable) { this.choose('activity', activity.id); } })
            if (activity.expanded && activity.detail) {
              Text(activity.detail).fontSize(12).fontFamily('monospace').fontColor($r('app.color.foreground'))
                .copyOption(CopyOptions.LocalDevice).width('100%').padding(12).backgroundColor($r('app.color.grouped_card')).borderRadius(8)
            }
            if (activity.error) { Text(activity.error).fontSize(12).fontColor($r('app.color.danger_foreground')) }
          }.alignItems(HorizontalAlign.Start).width('100%')
        }, (activity: FeedActivity) => activity.id)
      } else if (this.row.type === 'viewed-images') {
        ForEach(this.row.images, (item: FeedImage) => {
          if (item.url) { Image(item.url).width('100%').height(220).objectFit(ImageFit.Contain).accessibilityText(item.path) }
          else { Text(item.status === 'Failure' ? `${item.path} · 图片加载失败` : item.path).fontSize(12).fontColor($r('app.color.foreground_muted')) }
        }, (item: FeedImage) => item.path)
      } else {
        Text(this.row.text).fontSize(13).fontColor($r('app.color.foreground_muted')).copyOption(CopyOptions.LocalDevice)
      }
    }.width('100%').alignItems(this.row.role === 'user' ? HorizontalAlign.End : HorizontalAlign.Start).padding({ left: 16, right: 16, top: 8, bottom: 8 })
  }
}
