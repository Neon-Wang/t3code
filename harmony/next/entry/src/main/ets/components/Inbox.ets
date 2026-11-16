import { answerQuestion, closeQuestion, translate } from '../generated/core.js';
import { ClientState, InboxRow } from '../model/ClientState';

@ComponentV2
export struct Inbox {
  @Require @Param state: ClientState;
  build() {
    Column({ space: 8 }) {
      if (this.state.inboxStatus) { Text(this.state.inboxStatus).padding(16) }
      if (this.state.inboxCount === 0 && !this.state.inboxStatus) {
        Text(translate('inbox.empty')).padding(16).fontColor($r('app.color.foreground_muted'))
      }
      List({ space: 8 }) {
        Repeat<InboxRow>(this.state.inboxRows.filter((row: InboxRow) => row.kind !== 'thread' && (row.kind !== 'environment' || this.state.environments.length > 1))).each((entry: RepeatItem<InboxRow>) => {
          ListItem() {
            if (entry.item.kind === 'question') {
              Column({ space: 8 }) {
                Text(`${entry.item.item.urgent ? '! ' : '? '}${entry.item.title}`)
                  .fontColor(entry.item.item.urgent ? $r('app.color.danger_foreground') : $r('app.color.foreground'))
                Text(entry.item.item.thread?.title ?? entry.item.item.workspace).fontSize(14).maxLines(1)
                  .fontColor($r('app.color.foreground_muted'))
                Text(`${entry.item.item.agent} · ${entry.item.timeLabel}`).fontSize(12).fontColor($r('app.color.foreground_muted'))
              }.width('100%').padding(16).alignItems(HorizontalAlign.Start)
                .backgroundColor($r('app.color.grouped_card')).borderRadius(12)
                .onClick(() => { this.state.openQuestion(entry.item.key); })
            } else {
              Text(entry.item.title).fontSize(entry.item.kind === 'project' ? 18 : 14).padding(8)
                .fontColor(entry.item.kind === 'urgent-header' ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
            }
          }
        }).key((row: InboxRow) => row.key).virtualScroll()
      }.layoutWeight(1)
    }.width('100%').height('100%').padding(16).foregroundColor($r('app.color.foreground'))
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
  build() {
    Scroll() {
      Column({ space: 16 }) {
        Row() {
          Button('‹').accessibilityText(translate('inbox.back')).enabled(!this.busy)
            .onClick(() => { this.error = ''; this.state.stepQuestion(-1); })
          Text(this.row.item.thread?.title ?? this.row.item.workspace).maxLines(2).layoutWeight(1).padding(8)
          Button('›').enabled(!this.busy).onClick(() => { this.error = ''; this.state.stepQuestion(1); })
        }.width('100%')
        Text(`${this.row.item.urgent ? translate('inbox.urgent') + ' · ' : ''}${this.row.item.agent} · ${this.row.timeLabel}`)
          .fontSize(12).fontColor(this.row.item.urgent ? $r('app.color.danger_foreground') : $r('app.color.foreground_muted'))
        Text(this.row.item.question).fontSize(20).copyOption(CopyOptions.LocalDevice)
        if (this.row.item.urgentReason) {
          Text(this.row.item.urgentReason).fontColor($r('app.color.danger_foreground'))
        }
        if (this.row.item.context) { Text(this.row.item.context).fontSize(14).copyOption(CopyOptions.LocalDevice) }
        ForEach(this.row.item.options, (option: string) => {
          Button(`${option}${option === this.row.item.recommend ? ' · ' + translate('inbox.recommend') : ''}`)
            .width('100%').enabled(!this.busy && this.row.writable)
            .onClick(() => { this.submit(option, false); })
        }, (option: string) => option)
        TextArea({ text: this.state.answerDraft, placeholder: translate('inbox.answerPlaceholder') })
          .id('inboxAnswer').height(100).enabled(!this.busy && this.row.writable)
          .onChange((value: string) => { this.state.saveDraft(this.row.key, value); })
        if (!this.row.writable) { Text(translate('inbox.readOnly')).fontSize(14) }
        if (this.error) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
        Button(translate('inbox.answer')).enabled(!this.busy && this.row.writable && this.state.answerDraft.trim().length > 0)
          .onClick(() => { this.submit(this.state.answerDraft, false); })
        Button(translate('inbox.close')).enabled(!this.busy && this.row.writable)
          .onClick(() => { this.submit('', true); })
      }.padding(24).width('100%').alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').foregroundColor($r('app.color.foreground'))
  }
}
