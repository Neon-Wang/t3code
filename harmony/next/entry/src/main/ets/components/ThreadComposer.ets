import { LengthMetrics } from '@kit.ArkUI';
import { setComposerText, threadFeedAction, translate } from '../generated/core.js';
import { Glyph } from './Glyph';
import { providerIcon } from './ProviderIcon';

interface ComposerModel { key: string; label: string; group: string; provider: string; disabled: boolean; }
interface ComposerChoice { id: string; label: string; }
interface ComposerOption { id: string; label: string; value: string; choices: ComposerChoice[]; }
interface ComposerAttachment { id: string; name: string; status: string; }
export class ComposerSnapshot {
  text: string = '';
  busy: boolean = false;
  writable: boolean = false;
  running: boolean = false;
  modelKey: string = '';
  provider: string = '';
  models: ComposerModel[] = [];
  options: ComposerOption[] = [];
  attachments: ComposerAttachment[] = [];
}

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|heic|bmp)$/i;

/** The Android composer pill: "+" attachment menu, editor, model icon, and a round send or stop button. */
@ComponentV2
export struct ThreadComposer {
  @Require @Param environmentId: string;
  @Require @Param threadId: string;
  @Require @Param snapshot: ComposerSnapshot;
  @Param placeholder: string = '';
  @Local error: string = '';
  @Local settings: boolean = false;
  @Local attachOpen: boolean = false;
  private controller: RichEditorController = new RichEditorController();
  private ready: boolean = false;
  private editing: boolean = false;
  private restoring: boolean = false;

  private editorText(): string {
    return this.controller.getSpans().map((span: RichEditorTextSpanResult | RichEditorImageSpanResult) => (span as RichEditorTextSpanResult).value ?? '').join('');
  }
  @Monitor('snapshot')
  restore(): void {
    if (!this.ready || this.editing || this.editorText() === this.snapshot.text) { return; }
    this.restoring = true;
    this.controller.deleteSpans();
    if (this.snapshot.text) { this.controller.addTextSpan(this.snapshot.text, { style: { fontColor: $r('app.color.foreground'), fontSize: 16 } }); }
    this.restoring = false;
  }
  private async action(action: string, value: string = ''): Promise<void> {
    this.error = '';
    try { await threadFeedAction(this.environmentId, this.threadId, `composer:${action}`, value); }
    catch (error) { this.error = (error as Error).message; }
  }
  private hasDraft(): boolean { return this.snapshot.text.trim().length > 0 || this.snapshot.attachments.length > 0; }
  private failed(attachment: ComposerAttachment): boolean { return attachment.status !== 'uploaded' && attachment.status !== 'uploading'; }
  private canEdit(): boolean { return this.snapshot.writable && !this.snapshot.busy; }

  @Builder
  attachMenu() {
    Column() {
      this.attachMenuRow('photo', translate('mobile.attachments.photoLibrary'), 'photo')
      this.attachMenuRow('folder', translate('mobile.attachments.chooseFiles'), 'file')
    }.width(200).padding({ top: 4, bottom: 4 })
  }
  @Builder
  attachMenuRow(icon: string, label: string, action: string) {
    Row({ space: 12 }) {
      Glyph({ name: icon, side: 20, tint: $r('app.color.foreground') })
      Text(label).fontSize(15).fontColor($r('app.color.foreground'))
    }.width('100%').height(48).padding({ left: 16, right: 16 })
      .stateStyles({ pressed: { .backgroundColor($r('app.color.row_hover')) } })
      .onClick(() => { this.attachOpen = false; this.action(action); })
  }
  @Builder
  modelSheet() {
    Scroll() {
      Column({ space: 16 }) {
        Column() {
          ForEach(this.snapshot.models, (model: ComposerModel, index: number) => {
            Row({ space: 12 }) {
              Image(providerIcon(model.provider)).width(20).height(20)
              Column({ space: 2 }) {
                Text(model.label).fontSize(15).fontColor($r('app.color.foreground')).maxLines(1)
                Text(model.group).fontSize(12).fontColor($r('app.color.foreground_muted')).maxLines(1)
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              if (model.key === this.snapshot.modelKey) { Glyph({ name: 'checkmark', side: 18, tint: $r('app.color.primary_text') }) }
            }.width('100%').padding({ left: 16, right: 16, top: 10, bottom: 10 })
              .opacity(model.disabled ? 0.5 : 1).enabled(!model.disabled)
              .border({ width: { top: index === 0 ? 0 : 0.5 }, color: $r('app.color.border') })
              .onClick(() => { this.action('model', model.key); })
          }, (model: ComposerModel) => `${model.key}:${model.key === this.snapshot.modelKey}`)
        }.width('100%').borderRadius(20).backgroundColor($r('app.color.grouped_card')).clip(true)
        ForEach(this.snapshot.options, (option: ComposerOption) => {
          Column({ space: 8 }) {
            Text(option.label).fontSize(13).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground_muted')).padding({ left: 4 })
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
              ForEach(option.choices, (choice: ComposerChoice) => {
                Text(choice.label).fontSize(14).fontWeight(FontWeight.Medium)
                  .fontColor(option.value === choice.id ? $r('app.color.primary_text') : $r('app.color.foreground_secondary'))
                  .height(36).padding({ left: 14, right: 14 }).borderRadius(18)
                  .backgroundColor(option.value === choice.id ? $r('app.color.update') : $r('app.color.input'))
                  .border({ width: 1, color: option.value === choice.id ? $r('app.color.primary') : $r('app.color.border') })
                  .onClick(() => {
                    const value: string | boolean = choice.id === 'true' ? true : choice.id === 'false' ? false : choice.id;
                    this.action('option', JSON.stringify({ id: option.id, value }));
                  })
              }, (choice: ComposerChoice) => choice.id)
            }
          }.width('100%').alignItems(HorizontalAlign.Start)
        }, (option: ComposerOption) => `${option.id}:${option.value}`)
      }.padding({ left: 16, right: 16, top: 4, bottom: 24 }).width('100%')
    }.width('100%').height('100%').align(Alignment.Top)
  }
  @Builder
  attachmentTile(attachment: ComposerAttachment) {
    Stack({ alignContent: Alignment.TopEnd }) {
      Column({ space: 4 }) {
        Glyph({ name: IMAGE_NAME.test(attachment.name) ? 'photo' : 'folder', side: 22, tint: $r('app.color.icon_muted') })
        Text(this.failed(attachment) ? '上传失败' : attachment.name).fontSize(12).maxLines(2).textAlign(TextAlign.Center)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontColor(this.failed(attachment) ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
      }.width(72).height(72).padding(6).borderRadius(16).justifyContent(FlexAlign.Center)
        .backgroundColor($r('app.color.subtle_strong')).opacity(attachment.status === 'uploading' ? 0.55 : 1)
      if (attachment.status === 'uploading') {
        LoadingProgress().width(20).height(20).color($r('app.color.foreground_muted')).position({ x: 26, y: 26 })
      }
      Row() { Glyph({ name: 'xmark', side: 10, tint: Color.White }) }
        .width(22).height(22).borderRadius(11).justifyContent(FlexAlign.Center).backgroundColor('#8c000000')
        .margin({ top: 4, right: 4 }).enabled(!this.snapshot.busy).accessibilityText('移除')
        .onClick(() => { this.action('remove', attachment.id); })
    }
  }
  @Builder
  sendButton() {
    if (this.snapshot.running && !this.hasDraft()) {
      Row() {
        Row() { Glyph({ name: 'stop.fill', side: 16, tint: $r('app.color.danger_foreground') }) }
          .width(30).height(30).borderRadius(15).justifyContent(FlexAlign.Center).backgroundColor($r('app.color.danger'))
      }.width(44).height(44).justifyContent(FlexAlign.Center).accessibilityText(translate('mobile.threads.stop'))
        .enabled(this.canEdit()).onClick(() => { this.action('stop'); })
    } else {
      Row() {
        Stack() {
          Circle().width(30).height(30).fill(this.canEdit() && this.hasDraft() ? $r('app.color.primary') : $r('app.color.foreground'))
            .opacity(this.canEdit() && this.hasDraft() ? 1 : 0.12)
          Glyph({ name: this.snapshot.running ? 'list.number' : 'arrow.up', side: 16,
            tint: this.canEdit() && this.hasDraft() ? $r('app.color.primary_foreground') : $r('app.color.foreground') })
            .opacity(this.canEdit() && this.hasDraft() ? 1 : 0.38)
        }
      }.width(44).height(44).justifyContent(FlexAlign.Center)
        .accessibilityText(this.snapshot.running ? translate('mobile.threads.queued') : '发送')
        .enabled(this.canEdit() && this.hasDraft())
        .onClick(() => { this.action(this.snapshot.running ? 'queue' : 'send'); })
    }
  }
  build() {
    Column({ space: 6 }) {
      if (this.error) { Text(this.error).fontSize(13).fontColor($r('app.color.danger_foreground')).copyOption(CopyOptions.LocalDevice).padding({ left: 8, right: 8 }) }
      Column() {
        if (this.snapshot.attachments.length > 0) {
          Scroll() {
            Row({ space: 10 }) {
              ForEach(this.snapshot.attachments, (attachment: ComposerAttachment) => { this.attachmentTile(attachment) },
                (attachment: ComposerAttachment) => `${attachment.id}:${attachment.status}`)
            }
          }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%').align(Alignment.Start)
            .padding({ left: 14, right: 14, top: 8, bottom: 4 })
        }
        Row() {
          Row() { Glyph({ name: 'plus', side: 20, tint: $r('app.color.icon_subtle') }) }
            .width(44).height(44).justifyContent(FlexAlign.Center).borderRadius(22)
            .accessibilityText(translate('mobile.attachments.addAttachment'))
            .enabled(this.canEdit()).opacity(this.canEdit() ? 1 : 0.5)
            .onClick(() => { this.attachOpen = true; })
            .bindMenu(this.attachOpen, this.attachMenu(), { placement: Placement.TopLeft, onDisappear: () => { this.attachOpen = false; } })
          RichEditor({ controller: this.controller })
            .id('threadComposer').layoutWeight(1).constraintSize({ minHeight: 44, maxHeight: 128 })
            .placeholder(this.placeholder || translate('mobile.threadDetailScreen.askAnything'), { fontColor: $r('app.color.placeholder'), font: { size: 16 } })
            .backgroundColor(Color.Transparent).padding({ top: 10, bottom: 10, left: 0, right: 4 })
            .caretColor($r('app.color.primary')).enabled(this.canEdit())
            .onReady(() => { this.ready = true; this.restore(); })
            .onDidChange(() => {
              if (!this.ready || this.restoring) { return; }
              this.editing = true;
              setComposerText(this.environmentId, this.threadId, this.editorText());
              this.editing = false;
            })
          Row({ space: 6 }) {
            Image(providerIcon(this.snapshot.provider)).width(16).height(16)
            Glyph({ name: 'chevron.down', side: 10, tint: $r('app.color.icon_subtle') })
          }.height(44).padding({ left: 8, right: 8 }).borderRadius(10.5)
            .stateStyles({ pressed: { .backgroundColor($r('app.color.subtle_strong')) } })
            .accessibilityText('模型和推理设置').onClick(() => { this.settings = true; this.action('models'); })
          this.sendButton()
        }.width('100%').alignItems(VerticalAlign.Bottom)
      }.width('100%').padding({ top: 2, bottom: 2 }).borderRadius(27)
        .backgroundColor($r('app.color.composer_surface')).border({ width: 1, color: $r('app.color.composer_border') })
    }.width('100%').padding({ left: 12, right: 12, top: 6, bottom: 6 }).backgroundColor($r('app.color.composer_panel'))
      .bindSheet($$this.settings, this.modelSheet(), { height: SheetSize.LARGE, title: { title: '模型和推理设置' }, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}
