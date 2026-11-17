import { subscribeNewTask, newTaskAction, translate } from '../generated/core.js';
import { ThreadRoute } from './ThreadDetail';
import { Glyph } from './Glyph';
import { ActionButton } from './ActionButton';
import { providerIcon } from './ProviderIcon';
interface TaskChoice { key: string; label: string; disabled: boolean; title?: string; environment?: string; provider?: string; }
interface TaskRef { name: string; }
class TaskSnapshot {
  text: string = '';
  busy: boolean = false;
  loaded: boolean = false;
  error: string = '';
  projectKey: string = '';
  modelKey: string = '';
  provider: string = '';
  mode: string = 'local';
  runtimeMode: string = '';
  branch: string = '';
  isRepo: boolean = false;
  canSend: boolean = false;
  projects: TaskChoice[] = [];
  models: TaskChoice[] = [];
  modes: TaskChoice[] = [];
  refs: TaskRef[] = [];
}

/** The Android new-thread draft: a centered "What should we build in <project>?" hero over the composer. */
@ComponentV2
export struct NewTask {
  @Event opened: (route: ThreadRoute) => void = () => {};
  @Local state: TaskSnapshot = new TaskSnapshot();
  @Local actionError: string = '';
  @Local settings: boolean = false;
  private controller: RichEditorController = new RichEditorController();
  private ready: boolean = false;
  private editing: boolean = false;
  private restoring: boolean = false;
  private release: () => void = () => {};
  private stack: NavPathStack | undefined = undefined;
  aboutToAppear(): void {
    this.release = subscribeNewTask((json: string) => {
      this.state = JSON.parse(json) as TaskSnapshot;
      if (this.ready && !this.editing) {
        const text = this.controller.getSpans().map((span: RichEditorTextSpanResult | RichEditorImageSpanResult) => (span as RichEditorTextSpanResult).value ?? '').join('');
        if (text !== this.state.text) { this.restoring = true; this.controller.deleteSpans(); if (this.state.text) { this.controller.addTextSpan(this.state.text); } this.restoring = false; }
      }
    });
  }
  aboutToDisappear(): void { this.release(); }
  private async action(action: string, value: string = ''): Promise<void> {
    this.actionError = '';
    try {
      const result = await newTaskAction(action, value);
      if (result) { this.opened(JSON.parse(result) as ThreadRoute); }
    } catch (error) { this.actionError = (error as Error).message; }
  }
  private project(): TaskChoice | undefined { return this.state.projects.find((choice: TaskChoice) => choice.key === this.state.projectKey); }
  @Builder
  choices(items: TaskChoice[], current: string, action: string) {
    Menu() {
      ForEach(items, (choice: TaskChoice) => {
        MenuItem({ content: choice.label }).enabled(!choice.disabled).selected(choice.key === current)
          .selectIcon(true).onClick(() => { this.action(action, choice.key); })
      }, (choice: TaskChoice) => `${choice.key}:${choice.key === current}`)
    }
  }
  @Builder
  branches() {
    Menu() {
      ForEach(this.state.refs, (ref: TaskRef) => {
        MenuItem({ content: ref.name }).selected(ref.name === this.state.branch).selectIcon(true)
          .onClick(() => { this.action('branch', ref.name); })
      }, (ref: TaskRef) => `${ref.name}:${ref.name === this.state.branch}`)
    }
  }
  // ComposerInlineControl: a 44vp rounded control with an icon, a medium label and an optional chevron.
  @Builder
  inlineControl(icon: string, label: string, chevron: boolean) {
    Row({ space: 6 }) {
      Glyph({ name: icon, side: 16, tint: $r('app.color.icon_subtle') })
      Text(label).fontSize(14).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground')).maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis }).constraintSize({ maxWidth: 200 })
      if (chevron) { Glyph({ name: 'chevron.right', side: 11, tint: $r('app.color.icon_subtle') }) }
    }.height(44).padding({ left: 7, right: 7 }).borderRadius(10.5)
      .stateStyles({ pressed: { .backgroundColor($r('app.color.subtle_strong')) } })
  }
  @Builder
  settingsSheet() {
    Scroll() {
      Column({ space: 16 }) {
        Column({ space: 8 }) {
          Text('运行权限').fontSize(13).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground_muted')).padding({ left: 4 })
          Column() {
            ForEach(this.state.modes, (mode: TaskChoice, index: number) => {
              Row() {
                Text(mode.label).fontSize(15).fontColor($r('app.color.foreground')).layoutWeight(1)
                if (mode.key === this.state.runtimeMode) { Glyph({ name: 'checkmark', side: 18, tint: $r('app.color.primary_text') }) }
              }.width('100%').padding({ left: 16, right: 16, top: 12, bottom: 12 })
                .opacity(mode.disabled ? 0.5 : 1).enabled(!mode.disabled)
                .border({ width: { top: index === 0 ? 0 : 0.5 }, color: $r('app.color.border') })
                .onClick(() => { this.action('runtimeMode', mode.key); })
            }, (mode: TaskChoice) => `${mode.key}:${mode.key === this.state.runtimeMode}`)
          }.width('100%').borderRadius(20).backgroundColor($r('app.color.grouped_card')).clip(true)
        }.width('100%').alignItems(HorizontalAlign.Start)
        Column() {
          ForEach(this.state.models, (model: TaskChoice, index: number) => {
            Row({ space: 12 }) {
              Image(providerIcon(model.provider ?? '')).width(20).height(20)
              Text(model.label).fontSize(15).fontColor($r('app.color.foreground')).layoutWeight(1).maxLines(1)
              if (model.key === this.state.modelKey) { Glyph({ name: 'checkmark', side: 18, tint: $r('app.color.primary_text') }) }
            }.width('100%').padding({ left: 16, right: 16, top: 12, bottom: 12 })
              .opacity(model.disabled ? 0.5 : 1).enabled(!model.disabled)
              .border({ width: { top: index === 0 ? 0 : 0.5 }, color: $r('app.color.border') })
              .onClick(() => { this.action('model', model.key); })
          }, (model: TaskChoice) => `${model.key}:${model.key === this.state.modelKey}`)
        }.width('100%').borderRadius(20).backgroundColor($r('app.color.grouped_card')).clip(true)
      }.padding({ left: 16, right: 16, top: 4, bottom: 24 }).width('100%')
    }.width('100%').height('100%').align(Alignment.Top)
  }
  @Builder
  hero() {
    Column({ space: 14 }) {
      Column({ space: 4 }) {
        Text(translate('mobile.newTaskDraftScreen.whatShouldWeBuild')).fontSize(26).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.foreground')).textAlign(TextAlign.Center)
        Row() {
          Text(translate('mobile.newTaskDraftScreen.inProject')).fontSize(26).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
          Text(this.project()?.title ?? '选择项目').fontSize(26).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).constraintSize({ maxWidth: 250 })
            .border({ width: { bottom: 1 }, color: $r('app.color.foreground_muted') })
            .enabled(!this.state.busy).bindMenu(this.choices(this.state.projects, this.state.projectKey, 'project'))
          Text('？').fontSize(26).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
        }.justifyContent(FlexAlign.Center)
      }
      if (this.project()?.environment) {
        Row({ space: 6 }) {
          Glyph({ name: 'desktopcomputer', side: 16, tint: $r('app.color.foreground_muted') })
          Text(this.project()?.environment ?? '').fontSize(14).fontColor($r('app.color.foreground_muted'))
          Glyph({ name: 'chevron.right', side: 11, tint: $r('app.color.foreground_muted') })
        }.padding({ left: 10, right: 10, top: 7, bottom: 7 }).borderRadius(10.5)
          .enabled(!this.state.busy).bindMenu(this.choices(this.state.projects, this.state.projectKey, 'project'))
      }
    }.width('100%').padding({ left: 21, right: 21 })
  }
  build() {
    NavDestination() {
      Column() {
        Row() {
          Row() { Glyph({ name: 'arrow.left', side: 24, tint: $r('app.color.header_foreground') }) }
            .width(48).height(48).justifyContent(FlexAlign.Center).borderRadius(24).accessibilityText('返回')
            .onClick(() => { this.stack?.pop(); })
          Text(translate('mobile.components.newThread')).fontSize(20).fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.header_foreground')).padding({ left: 4 })
        }.width('100%').height(64).padding({ left: 4, right: 4, bottom: 4 })
        Column() {
          Column() { this.hero() }.layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)
          if (this.state.error || this.actionError) {
            Column({ space: 8 }) {
              Text('无法启动任务').fontSize(16).fontWeight(FontWeight.Bold).fontColor($r('app.color.danger_foreground'))
              Text(this.state.error || this.actionError).fontSize(14).fontColor($r('app.color.foreground_secondary')).copyOption(CopyOptions.LocalDevice)
              Text('首条消息已保留，可修改后重试。').fontSize(13).fontColor($r('app.color.foreground_muted'))
              if (!this.state.loaded) { ActionButton({ label: '重新加载项目', tone: 'secondary', tap: () => { this.action('reload'); } }) }
            }.width('100%').alignItems(HorizontalAlign.Start).padding(14).borderRadius(20).margin({ left: 12, right: 12, bottom: 8 })
              .border({ width: 1, color: $r('app.color.danger_border') }).backgroundColor($r('app.color.danger'))
          }
          if (this.state.isRepo) {
            Row({ space: 4 }) {
              Row() { this.inlineControl('folder', this.state.mode === 'worktree' ? 'Worktree' : '当前目录', false) }.enabled(!this.state.busy).onClick(() => { this.action('mode', this.state.mode === 'worktree' ? 'local' : 'worktree'); })
              Row() { this.inlineControl('arrow.triangle.branch', this.state.branch || '选择分支', true) }
                .enabled(!this.state.busy)
                // Grow rightward from the control so the menu stays inside the detail pane on tablets.
                .bindMenu(this.branches(), { placement: Placement.TopLeft })
            }.width('100%').padding({ left: 19, right: 19, bottom: 4 })
          }
          Column() {
          Column() {
            Row() {
              RichEditor({ controller: this.controller }).id('newTaskComposer').layoutWeight(1)
                .constraintSize({ minHeight: 44, maxHeight: 160 })
                .placeholder(translate('mobile.threadDetailScreen.askAnything'), { fontColor: $r('app.color.placeholder'), font: { size: 16 } })
                .backgroundColor(Color.Transparent).padding({ top: 10, bottom: 10, left: 16, right: 4 })
                .caretColor($r('app.color.primary')).enabled(!this.state.busy)
                .onReady(() => { this.ready = true; if (this.state.text) { this.controller.addTextSpan(this.state.text); } })
                .onDidChange(() => {
                  if (!this.ready || this.restoring) { return; }
                  this.editing = true;
                  const text = this.controller.getSpans().map((span: RichEditorTextSpanResult | RichEditorImageSpanResult) => (span as RichEditorTextSpanResult).value ?? '').join('');
                  this.action('text', text);
                  this.editing = false;
                })
              Row({ space: 6 }) {
                Image(providerIcon(this.state.provider)).width(16).height(16)
                Glyph({ name: 'chevron.down', side: 10, tint: $r('app.color.icon_subtle') })
              }.height(44).padding({ left: 8, right: 8 }).borderRadius(10.5).accessibilityText('模型和运行权限')
                .enabled(!this.state.busy).onClick(() => { this.settings = true; })
              Row() {
                if (this.state.busy) { LoadingProgress().width(24).height(24).color($r('app.color.foreground_muted')) }
                else {
                  Stack() {
                    Circle().width(30).height(30).fill(this.state.canSend ? $r('app.color.primary') : $r('app.color.foreground'))
                      .opacity(this.state.canSend ? 1 : 0.12)
                    Glyph({ name: 'arrow.up', side: 16, tint: this.state.canSend ? $r('app.color.primary_foreground') : $r('app.color.foreground') })
                      .opacity(this.state.canSend ? 1 : 0.38)
                  }
                }
              }.id('startTask').width(44).height(44).justifyContent(FlexAlign.Center).accessibilityText('开始任务')
                .enabled(this.state.canSend).onClick(() => { this.action('send'); })
            }.width('100%').alignItems(VerticalAlign.Bottom)
          }.width('100%').padding({ top: 2, bottom: 2 }).borderRadius(27)
            .backgroundColor($r('app.color.composer_surface')).border({ width: 1, color: $r('app.color.composer_border') })
          }.width('100%').padding({ left: 12, right: 12, top: 2, bottom: 6 })
        }.width('100%').layoutWeight(1).backgroundColor($r('app.color.thread_canvas'))
          .borderRadius({ topLeft: 28, topRight: 28 }).clip(true)
      }.width('100%').height('100%')
    }.hideTitleBar(true).backgroundColor($r('app.color.app_bar'))
      .onReady((context: NavDestinationContext) => { this.stack = context.pathStack; })
      .bindSheet($$this.settings, this.settingsSheet(), { height: SheetSize.MEDIUM, title: { title: '模型和运行权限' }, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}
