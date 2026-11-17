import { MarkdownText } from './MarkdownText';
import { ActionButton } from './ActionButton';
import { Glyph } from './Glyph';
import { translate } from '../generated/core.js';
interface CardButton { action: string; value: string; label: string; disabled: boolean; }
interface QuestionChoice { value: string; label: string; detail: string; selected: boolean; }
interface CardQuestion { id: string; title: string; text: string; custom: string; allowCustom: boolean; disabled: boolean; choices: QuestionChoice[]; }
export interface ThreadCard { id: string; type: string; title: string; detail: string; questions: CardQuestion[]; buttons: CardButton[]; }

// Android button tones per card action (PendingApprovalCard, PendingUserInputCard, queue and limit cards).
function buttonTone(button: CardButton): string {
  switch (button.action) {
    case 'approval': return button.value === 'accept' ? 'primary' : button.value === 'decline' ? 'danger' : 'secondary';
    case 'answer': return button.disabled ? 'secondary' : 'primary';
    case 'dismiss': case 'cancel-queue': return 'text';
    case 'recovery': return button.value === 'resume' ? 'primary' : 'secondary';
    default: return 'secondary';
  }
}
function eyebrow(type: string): string {
  switch (type) {
    case 'approval': return translate('mobile.threads.approvalNeeded');
    case 'question': return translate('mobile.threads.userInputNeeded');
    default: return '';
  }
}

/** The Android pending-request card: bordered, eyebrow over a bold title, then full-width actions. */
@ComponentV2
export struct ThreadCardView {
  @Require @Param card: ThreadCard;
  @Event choose: (action: string, payload: string) => void = () => {};
  @Local collapsed: boolean = false;
  private act(action: string, value: string, questionId: string = ''): void {
    this.choose(`card:${action}`, JSON.stringify({ id: this.card.id, value, questionId }));
  }
  @Builder
  heading() {
    Row() {
      Column({ space: 2 }) {
        if (eyebrow(this.card.type)) {
          Text(eyebrow(this.card.type)).fontSize(12).fontWeight(FontWeight.Bold).letterSpacing(1.1)
            .fontColor($r('app.color.foreground_secondary'))
        }
        Text(this.card.type === 'question' ? translate('mobile.threads.fillInThePendingAnswers') : this.card.title)
          .fontSize(18).lineHeight(23).fontWeight(FontWeight.Bold).fontColor($r('app.color.foreground'))
      }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      if (this.card.type === 'question') {
        Row() { Glyph({ name: 'chevron.down', side: 13, tint: $r('app.color.icon_subtle') }) }
          .width(28).height(28).borderRadius(14).justifyContent(FlexAlign.Center).backgroundColor($r('app.color.subtle_strong'))
          .accessibilityText(translate('mobile.threads.collapseUserInput')).onClick(() => { this.collapsed = true; })
      }
    }.width('100%').alignItems(VerticalAlign.Top)
  }
  build() {
    if (this.collapsed) {
      // Collapsed question: a pill that reopens the card.
      Row({ space: 8 }) {
        Text(eyebrow(this.card.type)).fontSize(12).fontWeight(FontWeight.Bold).letterSpacing(1.1).fontColor($r('app.color.foreground_secondary'))
        Text(`${this.card.questions.length} ${translate('mobile.threads.question')}`).fontSize(13).fontColor($r('app.color.foreground_muted')).layoutWeight(1)
        Row() { Glyph({ name: 'chevron.up', side: 12, tint: $r('app.color.icon_subtle') }) }.width(32).height(32).justifyContent(FlexAlign.Center)
      }.width('100%').padding({ left: 14, right: 6, top: 5, bottom: 5 }).borderRadius(22)
        .border({ width: 1, color: $r('app.color.border') }).backgroundColor($r('app.color.card_alt'))
        .onClick(() => { this.collapsed = false; })
    } else {
      Column({ space: 9 }) {
        this.heading()
        if (this.card.detail) {
          Text(this.card.detail).fontSize(14).lineHeight(19).fontColor($r('app.color.foreground_secondary')).copyOption(CopyOptions.LocalDevice)
        }
        Repeat<CardQuestion>(this.card.questions).each((item: RepeatItem<CardQuestion>) => {
          ThreadQuestionView({ question: this.card.questions[item.index], choose: (action: string, value: string) => { this.act(action, value, item.item.id); } })
        }).key((question: CardQuestion) => question.id)
        Column({ space: 7 }) {
          ForEach(this.card.buttons, (button: CardButton) => {
            ActionButton({ label: button.label, tone: buttonTone(button), active: !button.disabled, tap: () => { this.act(button.action, button.value); } })
          }, (button: CardButton) => `${button.action}:${button.value}:${button.disabled}:${button.label}`)
        }.width('100%').margin({ top: 4 })
      }.width('100%').alignItems(HorizontalAlign.Start).padding(14).borderRadius(20)
        .border({ width: 1, color: $r('app.color.border') }).backgroundColor($r('app.color.card_alt'))
    }
  }
}

@ComponentV2
struct ThreadQuestionView {
  @Require @Param question: CardQuestion;
  @Event choose: (action: string, value: string) => void = () => {};
  build() {
    Column({ space: 7 }) {
      if (this.question.title) {
        Text(this.question.title.toUpperCase()).fontSize(13).fontWeight(FontWeight.Bold).letterSpacing(1)
          .fontColor($r('app.color.foreground_muted'))
      }
      MarkdownText({ text: this.question.text })
      ForEach(this.question.choices, (choice: QuestionChoice) => {
        Column({ space: 2 }) {
          Text(choice.label).fontSize(14).fontWeight(FontWeight.Bold)
            .fontColor(choice.selected ? $r('app.color.foreground') : $r('app.color.foreground_secondary'))
          if (choice.detail) { Text(choice.detail).fontSize(14).lineHeight(20).fontColor($r('app.color.foreground_muted')) }
        }.width('100%').constraintSize({ minHeight: 42 }).padding({ left: 12, right: 12, top: 10, bottom: 10 })
          .justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Start).borderRadius(14)
          .border({ width: 1, color: choice.selected ? $r('app.color.primary') : $r('app.color.border') })
          .backgroundColor(choice.selected ? $r('app.color.update') : $r('app.color.input'))
          .opacity(this.question.disabled ? 0.5 : 1).enabled(!this.question.disabled)
          .onClick(() => { this.choose('choice', choice.value); })
      }, (choice: QuestionChoice) => `${choice.value}:${choice.selected}`)
      if (this.question.allowCustom) {
        TextArea({ text: this.question.custom, placeholder: translate('mobile.threads.orTypeACustomAnswer') })
          .constraintSize({ minHeight: 54 }).fontSize(16).placeholderColor($r('app.color.placeholder'))
          .fontColor($r('app.color.foreground')).caretColor($r('app.color.primary'))
          .padding({ left: 12, right: 12, top: 10, bottom: 10 }).borderRadius(14)
          .backgroundColor($r('app.color.input')).border({ width: 1, color: $r('app.color.input_border') })
          .enabled(!this.question.disabled)
          .onChange((value: string) => { this.choose('custom', value); })
      }
    }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: 3 })
  }
}
