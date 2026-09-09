import terminal from 'libt3terminal.so';
function equal(actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`paste mismatch: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
export function runTerminalPasteTest(): string {
  const handle = terminal.create(40, 4);
  try {
    equal(terminal.encodePaste(handle, '中文\n🙂'), '中文\r🙂');
    terminal.feed(handle, '\u001b[?2004h');
    equal(terminal.encodePaste(handle, '中文\n🙂'), '\u001b[200~中文\n🙂\u001b[201~');
    terminal.feed(handle, '\u001b[?2004l');
    equal(terminal.encodePaste(handle, 'a\nb'), 'a\rb');
    terminal.feed(handle, '\u001b[?2004h');
    equal(terminal.encodePaste(handle, '\u001b[201~\u0000\u007f'), '\u001b[200~ [201~  \u001b[201~');
    const long = 'a'.repeat(65535) + '🙂中' + 'b'.repeat(65536);
    equal(terminal.encodePaste(handle, long), '\u001b[200~' + long + '\u001b[201~');
    terminal.feed(handle, '\u001bc');
    equal(terminal.encodePaste(handle, 'a\nb'), 'a\rb');
    return 'passed 6';
  } finally { terminal.destroy(handle); }
}
