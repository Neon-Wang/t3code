import terminal, { TerminalFrame, TerminalCell } from 'libt3terminal.so';
function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function cell(frame: TerminalFrame, x: number): TerminalCell {
  const value = frame.cells.find((item: TerminalCell) => item.x === x && item.y === 0);
  if (value === undefined) throw new Error(`Missing cell ${x}`);
  return value;
}
export function runTerminalThemeTest(): string {
  const handle = terminal.create(40, 4);
  let checks = 0;
  try {
    let text = 'D';
    for (let i = 0; i < 16; i++) text += `\u001b[${i < 8 ? 30 + i : 90 + i - 8}m${String.fromCharCode(65 + i)}`;
    terminal.feed(handle, text + '\u001b[38;5;196mX\u001b[38;2;18;52;86mT\u001b[0m');
    const extended = cell(terminal.snapshot(handle), 17).foreground;
    const palette: number[] = [];
    for (let i = 0; i < 16; i++) palette.push(0x112200 + i * 0x010101);
    for (const foreground of [0x223344, 0xddeeff]) {
      for (let i = 0; i < 16; i++) palette[i] += 0x010000;
      terminal.setTheme(handle, foreground, 0x334455, 0x445566, palette);
      const frame = terminal.snapshot(handle);
      expect(frame.cols === 40 && frame.rows === 4 && frame.cursorX === 19, 'theme changed geometry');
      expect(cell(frame, 0).text === 'D' && cell(frame, 0).foreground === foreground, 'existing default text did not recolor');
      expect(frame.background === 0x334455 && cell(frame, 0).background === 0x334455, 'default background');
      expect(frame.cursorColor === 0x445566, 'cursor color');
      for (let i = 0; i < 16; i++) expect(cell(frame, i + 1).foreground === palette[i], `palette ${i}`);
      expect(cell(frame, 17).foreground === extended, 'extended palette changed');
      expect(cell(frame, 18).foreground === 0x123456, 'truecolor changed');
      checks += 22;
    }
    terminal.feed(handle, '\u001b]4;1;#abcdef\u0007\u001b]10;#102030\u0007\u001b]11;#203040\u0007\u001b]12;#304050\u0007');
    terminal.setTheme(handle, 0x667788, 0x778899, 0x8899aa, palette);
    let frame = terminal.snapshot(handle);
    expect(cell(frame, 0).foreground === 0x102030, 'OSC foreground override');
    expect(frame.background === 0x203040, 'OSC background override');
    expect(frame.cursorColor === 0x304050, 'OSC cursor override');
    expect(cell(frame, 2).foreground === 0xabcdef, 'OSC palette override');
    terminal.feed(handle, '\u001b]104;1\u0007\u001b]110\u0007\u001b]111\u0007\u001b]112\u0007');
    frame = terminal.snapshot(handle);
    expect(cell(frame, 0).foreground === 0x667788 && frame.background === 0x778899 && frame.cursorColor === 0x8899aa, 'OSC reset did not restore latest theme');
    expect(cell(frame, 2).foreground === palette[1], 'OSC palette reset');
    checks += 6;
    for (const invalid of [-1, 0x1000000, 1.5, Number.NaN]) {
      let rejected = false;
      try { terminal.setTheme(handle, invalid, 0, 0, palette); } catch (_) { rejected = true; }
      expect(rejected, 'invalid RGB accepted');
      expect(terminal.snapshot(handle).background === 0x778899, 'invalid RGB partially changed theme');
      checks += 2;
    }
    let rejected = false;
    try { terminal.setTheme(handle, 0, 0, 0, palette.slice(0, 15)); } catch (_) { rejected = true; }
    expect(rejected && terminal.snapshot(handle).background === 0x778899, 'invalid palette partially changed theme');
    checks++;
    const invalidPalette = palette.slice();
    invalidPalette[15] = Number.NaN;
    rejected = false;
    try { terminal.setTheme(handle, 0, 0, 0, invalidPalette); } catch (_) { rejected = true; }
    expect(rejected && terminal.snapshot(handle).background === 0x778899, 'invalid palette element partially changed theme');
    checks++;
    return JSON.stringify({ passed: true, checks });
  } finally { terminal.destroy(handle); }
}
