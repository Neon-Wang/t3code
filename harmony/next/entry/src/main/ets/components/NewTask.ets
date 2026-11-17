import { subscribeNewTask, newTaskAction } from '../generated/core.js';
import { ThreadRoute } from './ThreadDetail';
interface TaskChoice { key: string; label: string; disabled: boolean; }
interface TaskRef { name: string; }
class TaskSnapshot {
  text: string = '';
  busy: boolean = false;
  loaded: boolean = false;
  error: string = '';
  projectKey: string = '';
  modelKey: string = '';
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
@ComponentV2
export struct NewTask {
  @Event opened: (route: ThreadRoute) => void = () => {};
  @Local state: TaskSnapshot = new TaskSnapshot();
  @Local actionError: string = '';
  private controller: RichEditorController = new RichEditorController();
  private ready: boolean = false;
  private editing: boolean = false;
  private restoring: boolean = false;
  private release: () => void = () => {};
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
  @Builder
  choices(items: TaskChoice[], current: string, action: string) {
    Menu() {
      ForEach(items, (choice: TaskChoice) => {
        MenuItem({ content: `${choice.key === current ? '✓ ' : ''}${choice.label}` }).enabled(!choice.disabled)
          .onClick(() => { this.action(action, choice.key); })
      }, (choice: TaskChoice) => choice.key)
    }
  }
  @Builder
  branches() {
    Menu() { ForEach(this.state.refs, (ref: TaskRef) => { MenuItem({ content: ref.name }).onClick(() => { this.action('branch', ref.name); }) }, (ref: TaskRef) => ref.name) }
  }
  build() {
    NavDestination() {
      Scroll() {
        Column({ space: 14 }) {
          Button(this.state.projects.find((choice: TaskChoice) => choice.key === this.state.projectKey)?.label ?? '选择环境和项目')
            .width('100%').enabled(!this.state.busy).bindMenu(this.choices(this.state.projects, this.state.projectKey, 'project'))
          Button(this.state.models.find((choice: TaskChoice) => choice.key === this.state.modelKey)?.label ?? '选择模型')
            .width('100%').enabled(!this.state.busy).bindMenu(this.choices(this.state.models, this.state.modelKey, 'model'))
          Button(this.state.modes.find((choice: TaskChoice) => choice.key === this.state.runtimeMode)?.label ?? '运行权限')
            .enabled(!this.state.busy).bindMenu(this.choices(this.state.modes, this.state.runtimeMode, 'runtimeMode'))
          if (this.state.isRepo) {
            Row({ space: 12 }) {
              Button(this.state.mode === 'worktree' ? '✓ Worktree' : '当前目录').enabled(!this.state.busy)
                .onClick(() => { this.action('mode', this.state.mode === 'worktree' ? 'local' : 'worktree'); })
              Button(this.state.branch || '选择分支').enabled(!this.state.busy).bindMenu(this.branches())
            }
          }
          RichEditor({ controller: this.controller }).id('newTaskComposer').height(220).placeholder('描述任务…')
            .backgroundColor($r('app.color.grouped_card')).borderRadius(12).enabled(!this.state.busy)
            .onReady(() => { this.ready = true; if (this.state.text) { this.controller.addTextSpan(this.state.text); } })
            .onDidChange(() => {
              if (!this.ready || this.restoring) { return; }
              this.editing = true;
              const text = this.controller.getSpans().map((span: RichEditorTextSpanResult | RichEditorImageSpanResult) => (span as RichEditorTextSpanResult).value ?? '').join('');
              this.action('text', text);
              this.editing = false;
            })
          if (this.state.error || this.actionError) {
            Column({ space: 8 }) {
              Text('无法启动任务').fontSize(16).fontColor($r('app.color.danger_foreground'))
              Text(this.state.error || this.actionError).fontSize(14).fontColor($r('app.color.foreground')).copyOption(CopyOptions.LocalDevice)
              Text('首条消息已保留，可修改后重试。').fontSize(13).fontColor($r('app.color.foreground_muted'))
              if (!this.state.loaded) { Button('重新加载项目').onClick(() => { this.action('reload'); }) }
            }.padding(12).width('100%').backgroundColor($r('app.color.grouped_card')).borderRadius(12)
          }
          Button(this.state.busy ? '处理中…' : '开始任务').id('startTask').width('100%').enabled(this.state.canSend)
            .onClick(() => { this.action('send'); })
        }.padding(16).width('100%')
      }.width('100%').height('100%')
    }.title('新建任务').backgroundColor($r('app.color.screen'))
  }
}
