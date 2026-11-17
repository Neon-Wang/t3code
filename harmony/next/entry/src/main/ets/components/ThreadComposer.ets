import { setComposerText, threadFeedAction } from '../generated/core.js';

interface ComposerModel { key: string; label: string; disabled: boolean; }
interface ComposerChoice { id: string; label: string; }
interface ComposerOption { id: string; label: string; value: string; choices: ComposerChoice[]; }
interface ComposerAttachment { id: string; name: string; status: string; }
export class ComposerSnapshot {
  text: string = '';
  busy: boolean = false;
  writable: boolean = false;
  running: boolean = false;
  modelKey: string = '';
  models: ComposerModel[] = [];
  options: ComposerOption[] = [];
  attachments: ComposerAttachment[] = [];
}

@ComponentV2
export struct ThreadComposer {
  @Require @Param environmentId: string;
  @Require @Param threadId: string;
  @Require @Param snapshot: ComposerSnapshot;
  @Local error: string = '';
  @Local settings: boolean = false;
  private controller: RichEditorController = new RichEditorController();
  private ready: boolean = false;
  private editing: boolean = false;

  private editorText(): string {
    return this.controller.getSpans().map((span: RichEditorTextSpanResult | RichEditorImageSpanResult) => (span as RichEditorTextSpanResult).value ?? '').join('');
  }
  @Monitor('snapshot')
  restore(): void {
    if (!this.ready || this.editing || this.editorText() === this.snapshot.text) { return; }
    this.controller.deleteSpans();
    if (this.snapshot.text) { this.controller.addTextSpan(this.snapshot.text, { style: { fontColor: $r('app.color.foreground'), fontSize: 16 } }); }
  }
  private async action(action: string, value: string = ''): Promise<void> {
    this.error = '';
    try { await threadFeedAction(this.environmentId, this.threadId, `composer:${action}`, value); }
    catch (error) { this.error = (error as Error).message; }
  }
  @Builder
  modelSheet() {
    Scroll() {
      Column({ space: 12 }) {
        Text('模型和推理设置').fontSize(18).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
        ForEach(this.snapshot.models, (model: ComposerModel) => {
          Text(`${model.key === this.snapshot.modelKey ? '✓ ' : ''}${model.label}`)
            .fontSize(15).fontColor(model.disabled ? $r('app.color.foreground_muted') : $r('app.color.foreground'))
            .width('100%').padding(10).enabled(!model.disabled).onClick(() => { this.action('model', model.key); })
        }, (model: ComposerModel) => model.key)
        ForEach(this.snapshot.options, (option: ComposerOption) => {
          Column({ space: 6 }) {
            Text(option.label).fontSize(14).fontColor($r('app.color.foreground_muted'))
            Flex({ wrap: FlexWrap.Wrap }) {
              ForEach(option.choices, (choice: ComposerChoice) => {
                Button(`${option.value === choice.id ? '✓ ' : ''}${choice.label}`)
                  .margin(4).onClick(() => {
                    const value: string | boolean = choice.id === 'true' ? true : choice.id === 'false' ? false : choice.id;
                    this.action('option', JSON.stringify({ id: option.id, value }));
                  })
              }, (choice: ComposerChoice) => choice.id)
            }
          }.width('100%').alignItems(HorizontalAlign.Start)
        }, (option: ComposerOption) => `${option.id}:${option.value}`)
      }.padding(16).width('100%')
    }.width('100%')
  }
  build() {
    Column({ space: 6 }) {
      if (this.error) { Text(this.error).fontSize(13).fontColor($r('app.color.danger_foreground')).copyOption(CopyOptions.LocalDevice) }
      ForEach(this.snapshot.attachments, (attachment: ComposerAttachment) => {
        Row({ space: 8 }) {
          Text(`${attachment.name} · ${attachment.status === 'uploaded' ? '已上传' : attachment.status === 'uploading' ? '上传中' : '上传失败'}`)
            .fontSize(12).fontColor($r('app.color.foreground')).layoutWeight(1).maxLines(1)
          Button('移除').fontSize(12).enabled(!this.snapshot.busy).onClick(() => { this.action('remove', attachment.id); })
        }.width('100%')
      }, (attachment: ComposerAttachment) => `${attachment.id}:${attachment.status}`)
      RichEditor({ controller: this.controller })
        .id('threadComposer').height(100).placeholder('发送消息…').backgroundColor($r('app.color.grouped_card')).borderRadius(12)
        .enabled(this.snapshot.writable && !this.snapshot.busy)
        .onReady(() => { this.ready = true; this.restore(); })
        .onDidChange(() => {
          if (!this.ready) { return; }
          this.editing = true;
          setComposerText(this.environmentId, this.threadId, this.editorText());
          this.editing = false;
        })
      Row({ space: 8 }) {
        Button('模型').fontSize(12).onClick(() => { this.settings = true; this.action('models'); })
        Button('图片').fontSize(12).enabled(this.snapshot.writable && !this.snapshot.busy).onClick(() => { this.action('photo'); })
        Button('文件').fontSize(12).enabled(this.snapshot.writable && !this.snapshot.busy).onClick(() => { this.action('file'); })
        Blank()
        if (this.snapshot.running) {
          Button('中止').fontSize(12).enabled(!this.snapshot.busy && this.snapshot.writable).onClick(() => { this.action('stop'); })
        }
        Button(this.snapshot.busy ? '处理中' : this.snapshot.running ? '排队' : '发送').fontSize(12)
          .enabled(this.snapshot.writable && !this.snapshot.busy && (this.snapshot.text.trim().length > 0 || this.snapshot.attachments.length > 0))
          .onClick(() => { this.action(this.snapshot.running ? 'queue' : 'send'); })
      }.width('100%')
    }.width('100%').padding(12).backgroundColor($r('app.color.screen'))
      .bindSheet($$this.settings, this.modelSheet(), { height: SheetSize.LARGE, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}
