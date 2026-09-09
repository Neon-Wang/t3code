import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { RequestDrafts } from '../model/RequestDrafts';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import { PendingRequest, ApprovalOption, InputQuestion, InputOption, AnswerDraft, questionAnswers } from '../model/Models';

@Component
export struct RequestCard {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @Prop request: PendingRequest = { requestId: '', kind: '', title: '', detail: '', options: [], questions: [] };
  @Prop busy: boolean = false;
  @Prop environmentId: string = '';
  @Prop threadId: string = '';
  @State drafts: AnswerDraft[] = [];
  onRespond: (decision: string, answers: Record<string, string | string[]>) => void = () => {};

  aboutToAppear(): void {
    this.drafts = RequestDrafts.read(this.environmentId, this.threadId, this.request.requestId);
  }

  private draftFor(id: string): AnswerDraft {
    return this.drafts.find((draft: AnswerDraft) => draft.questionId === id) ?? { questionId: id, selected: [], custom: '' };
  }

  private save(draft: AnswerDraft): void {
    this.drafts = this.drafts.filter((entry: AnswerDraft) => entry.questionId !== draft.questionId).concat([draft]);
    RequestDrafts.save(this.environmentId, this.threadId, this.request.requestId, this.drafts);
  }

  private select(question: InputQuestion, label: string): void {
    const prior = this.draftFor(question.id);
    const selected = question.multiSelect
      ? (prior.selected.includes(label) ? prior.selected.filter((value: string) => value !== label) : prior.selected.concat([label]))
      : [label];
    const draft: AnswerDraft = { questionId: question.id, selected: selected, custom: '' };
    this.save(draft);
  }

  build() {
    Column({ space: 10 }) {
      Text(this.request.kind === 'approval' ? '需要授权' : '需要你的回答').fontSize(this.font(18)).fontColor(this.color('foreground'))
      Text(this.request.title).fontSize(this.font(14)).fontColor(this.color('foreground-secondary')).width('100%')
      if (this.request.detail) {
        Text(this.request.detail).fontSize(this.font(14)).fontColor(this.color('foreground')).width('100%').copyOption(CopyOptions.LocalDevice)
      }
      if (this.request.kind === 'approval') {
        ForEach(this.request.options, (option: ApprovalOption) => {
          Button(option.label).fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.busy).onClick(() => { this.onRespond(option.decision, {}); })
        }, (option: ApprovalOption) => option.decision)
      } else {
        ForEach(this.request.questions, (question: InputQuestion) => {
          Column({ space: 8 }) {
            Text(question.header).fontSize(this.font(16)).fontColor(this.color('foreground')).width('100%')
            Text(question.question).fontSize(this.font(14)).fontColor(this.color('foreground')).width('100%')
            if (question.multiSelect) { Text('可选择多项').fontSize(this.font(12)).fontColor(this.color('foreground-muted')) }
            ForEach(question.options, (option: InputOption) => {
              Button(`${this.draftFor(question.id).selected.includes(option.label) ? '✓ ' : ''}${option.label}`).fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary'))
                .enabled(!this.busy).onClick(() => { this.select(question, option.label); })
              if (option.description) { Text(option.description).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%') }
            }, (option: InputOption) => option.label)
            TextInput({ text: this.draftFor(question.id).custom, placeholder: '或输入自定义回答' }).fontSize(this.font(16)).fontColor(this.color('foreground')).backgroundColor(this.color('input')).placeholderColor(this.color('placeholder'))
              .enabled(!this.busy).onChange((value: string) => {
                const draft: AnswerDraft = { questionId: question.id, selected: [], custom: value };
                this.save(draft);
              })
          }.width('100%')
        }, (question: InputQuestion) => question.id)
        Button(this.busy ? '提交中…' : '提交回答').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary'))
          .enabled(!this.busy && questionAnswers(this.request.questions, this.drafts) !== null)
          .onClick(() => {
            const answers = questionAnswers(this.request.questions, this.drafts);
            if (answers !== null) this.onRespond('', answers);
          })
      }
    }.width('100%').padding(14).borderRadius(14).backgroundColor(this.color('card-alt'))
  }
}
