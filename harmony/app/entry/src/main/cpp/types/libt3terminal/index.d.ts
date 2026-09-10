export interface TerminalCell {
  x: number; y: number; text: string; foreground: number; background: number; flags: number;
}
export interface TerminalFrame {
  cols: number; rows: number; cursorX: number; cursorY: number; cursorVisible: number;
  cursorColor: number; background: number; cells: TerminalCell[];
}
export interface TerminalNative {
  create(cols: number, rows: number): object;
  destroy(handle: object): void;
  setTheme(handle: object, foreground: number, background: number, cursor: number, palette: number[]): void;
  selectWord(handle: object, x: number, y: number): void;
  selectRange(handle: object, startX: number, startY: number, endX: number, endY: number): void;
  selectAll(handle: object): void;
  clearSelection(handle: object): void;
  selectionText(handle: object): string;
  encodePaste(handle: object, data: string): string;
  feed(handle: object, data: string): string;
  resize(handle: object, cols: number, rows: number, cellWidth: number, cellHeight: number): string;
  scroll(handle: object, rows: number): void;
  scrollToBottom(handle: object): void;
  snapshot(handle: object): TerminalFrame;
}
declare const terminal: TerminalNative;
export default terminal;
