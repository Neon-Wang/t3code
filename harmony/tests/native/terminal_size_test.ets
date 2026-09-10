import terminal from 'libt3terminal.so';
export function runTerminalSizeTest(): string {
  const handle = terminal.create(40, 4);
  let checks = 0;
  try {
    for (const width of [24, 30]) {
      terminal.resize(handle, 40, 4, width, 51);
      const actual = terminal.feed(handle, '\u001b[16t\u001b[14t\u001b[18t');
      const expected = `\u001b[6;51;${width}t\u001b[4;204;${width * 40}t\u001b[8;4;40t`;
      if (actual !== expected) throw new Error(`size mismatch ${JSON.stringify(actual)}`);
      checks++;
    }
    return `passed ${checks}`;
  } finally { terminal.destroy(handle); }
}
