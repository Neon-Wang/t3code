import { answerQuestion, closeQuestion, translate } from '../generated/core.js';
import { Glyph } from './Glyph';
import { ClientState, InboxRow, InboxQuestion } from '../model/ClientState';

class InboxSection {
  key: string = '';
  title: string = '';
  urgent: boolean = false;
  rows: InboxRow[] = [];
}

/** Urgent questions read red and hands-on actions amber; plain decisions stay quiet (InboxItemIcon). */
function questionIcon(item: InboxQuestion): string {
  return item.urgent ? 'exclamationmark.circle' : item.kind === 'action' ? 'wrench.and.screwdriver' : 'questionmark.bubble';
}
function questionTint(item: InboxQuestion): ResourceColor {
  return item.urgent ? $r('app.color.danger_foreground')
    : item.kind === 'action' ? $r('app.color.warning_foreground') : $r('app.color.foreground_muted');
}

@ComponentV2
export struct Inbox {
  @Require @Param state: ClientState;
  // Settings-style groups as on Android: urgent first, then one group per project.
  @Computed
  get sections(): InboxSection[] {
    const sections: InboxSection[] = [];
    for (const row of this.state.inboxRows) {
      if (row.kind === 'question') {
        sections[sections.length - 1]?.rows.push(row);
      } else if (row.kind === 'urgent-header' || row.kind === 'project') {
        const section = new InboxSection();
        section.key = row.key;
        section.title = row.title;
        section.urgent = row.kind === 'urgent-header';
        sections.push(section);
      }
    }
    return sections.filter((section: InboxSection) => section.rows.length > 0);
  }
  @Builder
  questionRow(row: InboxRow, separated: boolean) {
    Row({ space: 12 }) {
      Row() { Glyph({ name: questionIcon(row.item), side: 20, tint: questionTint(row.item) }) }
        .width(24).height(24).justifyContent(FlexAlign.Center)
      Column({ space: 4 }) {
        Text(row.item.question).fontSize(16).lineHeight(23).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontColor($r('app.color.foreground'))
        Row({ space: 8 }) {
          Text(row.where).fontSize(14).maxLines(1).layoutWeight(1).textOverflow({ overflow: TextOverflow.Ellipsis })
            .fontColor($r('app.color.foreground_muted'))
          Text(row.timeLabel).fontSize(14).fontColor($r('app.color.foreground_muted')).fontFeature('"tnum" on')
        }.width('100%')
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      Glyph({ name: 'chevron.right', side: 16, tint: $r('app.color.chevron') })
    }.width('100%').constraintSize({ minHeight: 72 }).padding({ left: 16, right: 16, top: 12, bottom: 12 })
      .border(separated ? { width: { top: 1 }, color: $r('app.color.border_subtle') } : { width: 0 })
      .stateStyles({ pressed: { .backgroundColor($r('app.color.subtle_strong')) } })
      .onClick(() => { this.state.openQuestion(row.key); })
  }
  build() {
    Column() {
      Text(translate('inbox.title')).fontSize(21).fontWeight(FontWeight.Medium).fontColor($r('app.color.header_foreground'))
        .height(64).padding({ left: 20 }).width('100%')
      Scroll() {
        Column({ space: 24 }) {
          if (this.state.inboxStatus) {
            Text(this.state.inboxStatus).fontSize(14).fontColor($r('app.color.foreground_muted')).padding({ left: 16 })
          } else if (this.sections.length === 0) {
            Text(translate(this.state.environments.length === 0 ? 'inbox.noEnvironments' : 'inbox.empty'))
              .fontSize(16).fontColor($r('app.color.foreground_muted')).width('100%').textAlign(TextAlign.Center)
              .padding({ top: 48, bottom: 48 })
          }
          ForEach(this.sections, (section: InboxSection) => {
            Column({ space: 8 }) {
              Row({ space: 6 }) {
                if (section.urgent) { Glyph({ name: 'exclamationmark.circle', side: 14, tint: $r('app.color.danger_foreground') }) }
                Text(section.title).fontSize(14).fontColor($r('app.color.foreground_muted'))
              }.padding({ left: 16 })
              Column() {
                ForEach(section.rows, (row: InboxRow, index: number) => { this.questionRow(row, index > 0) }, (row: InboxRow) => row.key)
              }.width('100%').backgroundColor($r('app.color.grouped_card')).borderRadius(24).clip(true)
            }.alignItems(HorizontalAlign.Start).width('100%')
          }, (section: InboxSection) => `${section.key}:${section.rows.map((row: InboxRow) => row.key).join(',')}`)
        }.padding({ left: 20, right: 20, top: 16, bottom: 36 }).width('100%')
      }.layoutWeight(1).width('100%').align(Alignment.Top).scrollBar(BarState.Off)
        .backgroundColor($r('app.color.screen')).borderRadius({ topLeft: 28, topRight: 28 }).clip(true)
    }.width('100%').height('100%')
  }
}

@ComponentV2
export struct InboxPanel {
  @Require @Param state: ClientState;
  @Require @Param row: InboxRow;
  @Local busy: boolean = false;
  @Local error: string = '';

  private async submit(text: string, close: boolean): Promise<void> {
    const key = this.row.key;
    const environmentId = this.row.environmentId;
    const id = this.row.item.id;
    this.busy = true;
    this.error = '';
    try {
      if (close) { await closeQuestion(environmentId, id); }
      else { await answerQuestion(environmentId, id, text); }
      this.state.clearDraft(key);
    } catch (error) { this.error = translate(close ? 'inbox.closeFailed' : 'inbox.submitFailed'); }
    finally { this.busy = false; }
  }
  @Builder
  stepButton(icon: string, label: string, direction: number, enabled: boolean) {
    Row() { Glyph({ name: icon, side: 18, tint: $r('app.color.foreground_muted') }) }
      .width(32).height(32).borderRadius(16).justifyContent(FlexAlign.Center)
      .accessibilityText(label).opacity(enabled ? 1 : 0.3).enabled(enabled)
      .onClick(() => { this.error = ''; this.state.stepQuestion(direction); })
  }
  build() {
    Scroll() {
      Column({ space: 16 }) {
        // The question's thread as a grouped row; it opens the thread once details land (P2).
        Row({ space: 12 }) {
          Glyph({ name: 'bubble.left', side: 20, tint: $r('app.color.icon') })
          Column({ space: 2 }) {
            Text(this.row.sourceTitle).fontSize(16).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              .fontColor($r('app.color.foreground'))
            if (this.row.sourceCrumbs) {
              Text(this.row.sourceCrumbs).fontSize(14).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
                .fontColor($r('app.color.foreground_muted'))
            }
          }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          if (this.row.item.thread) { Glyph({ name: 'chevron.right', side: 16, tint: $r('app.color.chevron') }) }
        }.width('100%').constraintSize({ minHeight: 56 }).padding({ left: 16, right: 16, top: 12, bottom: 12 })
          .backgroundColor($r('app.color.grouped_card')).borderRadius(24)
        Row({ space: 6 }) {
          if (this.row.item.urgent || this.row.item.kind === 'action') {
            Glyph({ name: questionIcon(this.row.item), side: 14, tint: questionTint(this.row.item) })
            Text(translate(this.row.item.urgent ? 'inbox.urgent' : 'inbox.action')).fontSize(13).fontWeight(FontWeight.Medium)
              .fontColor(questionTint(this.row.item))
            if (this.row.item.agent) { Text('·').fontSize(13).fontColor($r('app.color.foreground_muted')) }
          }
          Text(this.row.item.agent).fontSize(13).maxLines(1).layoutWeight(1).fontColor($r('app.color.foreground_muted'))
          Text(this.row.timeLabel).fontSize(13).fontColor($r('app.color.foreground_muted')).fontFeature('"tnum" on')
          if (this.state.questionTotal() > 1) {
            Row({ space: 2 }) {
              this.stepButton('chevron.left', translate('inbox.back'), -1, !this.busy && this.state.questionPosition() > 1)
              Text(`${this.state.questionPosition()}/${this.state.questionTotal()}`).fontSize(13)
                .fontColor($r('app.color.foreground_muted')).fontFeature('"tnum" on')
              this.stepButton('chevron.right', translate('Next'), 1, !this.busy && this.state.questionPosition() < this.state.questionTotal())
            }.margin({ left: 4 })
          }
        }.width('100%')
        Text(this.row.item.question).fontSize(16).lineHeight(23).fontColor($r('app.color.foreground')).copyOption(CopyOptions.LocalDevice)
        if (this.row.item.urgent && this.row.urgentReasonText) {
          Text(this.row.urgentReasonText).fontSize(14).lineHeight(20).fontColor($r('app.color.danger_foreground'))
            .width('100%').padding({ left: 12, right: 12, top: 10, bottom: 10 }).borderRadius(12)
            .backgroundColor($r('app.color.danger')).border({ width: 1, color: $r('app.color.danger_border') })
        }
        if (this.row.item.context) {
          Text(this.row.item.context).fontSize(14).lineHeight(20).fontColor($r('app.color.foreground_muted'))
            .copyOption(CopyOptions.LocalDevice)
        }
        Column({ space: 8 }) {
          ForEach(this.row.item.options, (option: string) => {
            Row({ space: 12 }) {
              Text(option).fontSize(16).layoutWeight(1).fontColor($r('app.color.foreground'))
              if (option === this.row.item.recommend) {
                Text(translate('inbox.recommend')).fontSize(12).fontColor($r('app.color.foreground_muted'))
                  .padding({ left: 8, right: 8, top: 2, bottom: 2 }).borderRadius(10).backgroundColor($r('app.color.subtle_strong'))
              }
            }.width('100%').constraintSize({ minHeight: 48 }).padding({ left: 14, right: 14, top: 12, bottom: 12 })
              .borderRadius(16).backgroundColor($r('app.color.input')).border({ width: 1, color: $r('app.color.border') })
              .opacity(!this.busy && this.row.writable ? 1 : 0.5).enabled(!this.busy && this.row.writable)
              .stateStyles({ pressed: { .opacity(0.7) } })
              .onClick(() => { this.submit(option, false); })
          }, (option: string) => option)
        }
        TextArea({ text: this.state.answerDraft, placeholder: translate('inbox.answerPlaceholder') })
          .id('inboxAnswer').constraintSize({ minHeight: 48 }).fontSize(16).enabled(!this.busy && this.row.writable)
          .backgroundColor($r('app.color.input')).borderRadius(16).border({ width: 1, color: $r('app.color.input_border') })
          .placeholderColor($r('app.color.placeholder')).fontColor($r('app.color.foreground'))
          .onChange((value: string) => { this.state.saveDraft(this.row.key, value); })
        Button(translate('inbox.answer')).width('100%').height(48).fontSize(16)
          .enabled(!this.busy && this.row.writable && this.state.answerDraft.trim().length > 0)
          .backgroundColor(this.state.answerDraft.trim() ? $r('app.color.primary') : $r('app.color.secondary'))
          .fontColor(this.state.answerDraft.trim() ? $r('app.color.primary_foreground') : $r('app.color.secondary_foreground'))
          .onClick(() => { this.submit(this.state.answerDraft.trim(), false); })
        Button(translate('inbox.close')).width('100%').height(44).fontSize(16).backgroundColor(Color.Transparent)
          .fontColor($r('app.color.primary_text')).enabled(!this.busy && this.row.writable)
          .onClick(() => { this.submit('', true); })
        if (!this.row.writable) { Text(translate('inbox.readOnly')).fontSize(14).fontColor($r('app.color.foreground_muted')) }
        if (this.error) { Text(this.error).fontSize(14).fontColor($r('app.color.danger_foreground')) }
      }.padding({ left: 20, right: 20, top: 8, bottom: 40 }).width('100%').alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').align(Alignment.Top).scrollBar(BarState.Off)
  }
}
