import terminal from 'libt3terminal.so';
function equal(actual: string, expected: string): void { if (actual !== expected) throw new Error(`selection ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`); }
export function runTerminalSelectionTest(): string {
  const handle = terminal.create(10, 4);
  try {
    terminal.feed(handle, 'alpha beta\r\n中文🙂Z\r\n1234567890ABC');
    terminal.selectWord(handle, 2, 0);equal(terminal.selectionText(handle), 'alpha');
    if (!terminal.snapshot(handle).cells.some(cell => (cell.flags & 32) !== 0)) throw new Error('missing highlight');
    terminal.selectRange(handle, 0, 1, 5, 1);equal(terminal.selectionText(handle), '中文🙂');
    terminal.selectRange(handle, 0, 2, 2, 3);equal(terminal.selectionText(handle), '1234567890ABC');
    terminal.selectRange(handle, 2, 3, 0, 2);equal(terminal.selectionText(handle), '1234567890ABC');
    terminal.selectAll(handle);equal(terminal.selectionText(handle), 'alpha beta\n中文🙂Z\n1234567890ABC');
    terminal.clearSelection(handle);equal(terminal.selectionText(handle), '');
    if (terminal.snapshot(handle).cells.some(cell => (cell.flags & 32) !== 0)) throw new Error('stale highlight');
    terminal.feed(handle, '\r\nlast');terminal.scroll(handle, -1);
    terminal.selectWord(handle, 2, 0);equal(terminal.selectionText(handle), 'alpha');
    return 'passed 9';
  } finally { terminal.destroy(handle); }
}
