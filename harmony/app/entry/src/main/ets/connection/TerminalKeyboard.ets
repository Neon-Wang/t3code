import inputMethod from '@ohos.inputMethod';

/** The remote PTY owns editable text; the IME supplies committed input only. */
export class TerminalKeyboard {
  private controller: inputMethod.InputMethodController = inputMethod.getInputMethodController();
  private attached: boolean = false;
  private generation: number = 0;
  private insert: (text: string) => void;
  private eraseLeft: (length: number) => void;
  private eraseRight: (length: number) => void;
  private enter: (key: inputMethod.FunctionKey) => void;
  private move: (direction: inputMethod.Direction) => void;
  private leftText: (length: number) => string = (_length: number) => '';
  private rightText: (length: number) => string = (_length: number) => '';
  private index: () => number = () => 0;

  constructor(write: (text: string) => void, paste: (text: string) => void) {
    // Enter has its own IME event; embedded newlines are committed text, not key presses.
    this.insert = (text: string) => { if (/[\r\n]/.test(text)) paste(text); else write(text); };
    this.eraseLeft = (length: number) => { write('\u007f'.repeat(Math.max(0, Math.min(length, 1024)))); };
    this.eraseRight = (length: number) => { write('\u001b[3~'.repeat(Math.max(0, Math.min(length, 1024)))); };
    this.enter = (_key: inputMethod.FunctionKey) => { write('\r'); };
    this.move = (direction: inputMethod.Direction) => {
      if (direction === inputMethod.Direction.CURSOR_UP) write('\u001b[A');
      else if (direction === inputMethod.Direction.CURSOR_DOWN) write('\u001b[B');
      else if (direction === inputMethod.Direction.CURSOR_LEFT) write('\u001b[D');
      else if (direction === inputMethod.Direction.CURSOR_RIGHT) write('\u001b[C');
    };
  }

  async show(): Promise<void> {
    const generation = this.generation;
    if (!this.attached) {
      await this.controller.attach(false, { inputAttribute: {
        textInputType: inputMethod.TextInputType.TEXT, enterKeyType: inputMethod.EnterKeyType.NEWLINE
      } });
      if (generation !== this.generation) { await this.controller.detach(); return; }
      this.attached = true;
      this.controller.on('insertText', this.insert);
      this.controller.on('deleteLeft', this.eraseLeft);
      this.controller.on('deleteRight', this.eraseRight);
      this.controller.on('sendFunctionKey', this.enter);
      this.controller.on('moveCursor', this.move);
      this.controller.on('getLeftTextOfCursor', this.leftText);
      this.controller.on('getRightTextOfCursor', this.rightText);
      this.controller.on('getTextIndexAtCursor', this.index);
    }
    await this.controller.showTextInput();
  }

  async close(): Promise<void> {
    this.generation++;
    if (!this.attached) return;
    this.attached = false;
    this.controller.off('insertText', this.insert);
    this.controller.off('deleteLeft', this.eraseLeft);
    this.controller.off('deleteRight', this.eraseRight);
    this.controller.off('sendFunctionKey', this.enter);
    this.controller.off('moveCursor', this.move);
    this.controller.off('getLeftTextOfCursor', this.leftText);
    this.controller.off('getRightTextOfCursor', this.rightText);
    this.controller.off('getTextIndexAtCursor', this.index);
    await this.controller.detach();
  }
}
