import { MarkdownText } from './MarkdownText';
interface CardButton { action: string; value: string; label: string; disabled: boolean; }
interface QuestionChoice { value: string; label: string; detail: string; selected: boolean; }
interface CardQuestion { id: string; title: string; text: string; custom: string; allowCustom: boolean; disabled: boolean; choices: QuestionChoice[]; }
export interface ThreadCard { id: string; type: string; title: string; detail: string; questions: CardQuestion[]; buttons: CardButton[]; }

@ComponentV2
export struct ThreadCardView {
  @Require @Param card: ThreadCard;
  @Event choose: (action: string, payload: string) => void = () => {};
  private act(action: string, value: string, questionId: string = ''): void {
    this.choose(`card:${action}`, JSON.stringify({ id: this.card.id, value, questionId }));
  }
  build() {
    Column({ space: 10 }) {
      Text(this.card.title).fontSize(16).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
      if (this.card.detail) { MarkdownText({ text: this.card.detail }) }
      ForEach(this.card.questions, (question: CardQuestion) => {
        Column({ space: 8 }) {
          Text(question.title).fontSize(14).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
          MarkdownText({ text: question.text })
          ForEach(question.choices, (choice: QuestionChoice) => {
            Text(`${choice.selected ? '✓ ' : ''}${choice.label}${choice.detail ? '\n' + choice.detail : ''}`)
              .fontSize(14).fontColor($r('app.color.foreground')).padding(12).width('100%').borderRadius(8)
              .backgroundColor(choice.selected ? $r('app.color.tab_indicator') : $r('app.color.screen'))
              .enabled(!question.disabled).onClick(() => { this.act('choice', choice.value, question.id); })
          }, (choice: QuestionChoice) => `${choice.value}:${choice.selected}`)
          if (question.allowCustom) {
            TextArea({ text: question.custom, placeholder: '自定义回答' }).height(90).enabled(!question.disabled)
              .onChange((value: string) => { this.act('custom', value, question.id); })
          }
        }.width('100%').alignItems(HorizontalAlign.Start)
      }, (question: CardQuestion) => question.id)
      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(this.card.buttons, (button: CardButton) => {
          Button(button.label).fontSize(13).margin(4).enabled(!button.disabled).onClick(() => { this.act(button.action, button.value); })
        }, (button: CardButton) => `${button.action}:${button.value}:${button.disabled}`)
      }
    }.width('100%').alignItems(HorizontalAlign.Start).padding(14).borderRadius(16).backgroundColor($r('app.color.grouped_card'))
  }
}
