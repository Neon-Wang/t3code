import { subscribeThread } from '../generated/core.js';

export interface ThreadRoute { environmentId: string; threadId: string; }
interface ThreadSnapshot {
  title: string;
  project: string;
  environment: string;
  status: string;
  error: string;
}

@ComponentV2
export struct ThreadDetail {
  @Require @Param route: ThreadRoute;
  @Local title: string = '';
  @Local project: string = '';
  @Local environment: string = '';
  @Local status: string = 'empty';
  @Local error: string = '';
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
    });
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
      }.width('100%').height('100%').padding(16)
    }.title(this.heading()).backgroundColor($r('app.color.screen'))
      .onShown(() => { this.subscribe(); }).onHidden(() => { this.release(); })
  }
}
