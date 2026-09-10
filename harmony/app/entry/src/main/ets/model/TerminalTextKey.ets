/** Text keys reaching ArkUI after the IME. Zero-Unicode events use the standard key labels. */
export function terminalTextKey(name: string, unicode: number, shift: boolean, capsLock: boolean): string {
  if (unicode !== 0) {
    if (!Number.isInteger(unicode) || unicode < 32 || unicode > 0x10ffff ||
      (unicode >= 127 && unicode <= 159) || (unicode >= 0xd800 && unicode <= 0xdfff)) return '';
    return String.fromCodePoint(unicode);
  }
  if (!name.startsWith('KEYCODE_')) return '';
  const key = name.slice(8);
  if (/^[A-Z]$/.test(key)) return shift !== capsLock ? key : key.toLowerCase();
  if (/^[0-9]$/.test(key)) return shift ? ')!@#$%^&*('.charAt(Number(key)) : key;
  let pair = '';
  switch (key) {
    case 'SPACE': return ' ';
    case 'COMMA': pair = ',<'; break;
    case 'PERIOD': pair = '.>'; break;
    case 'GRAVE': pair = '`~'; break;
    case 'MINUS': pair = '-_'; break;
    case 'EQUALS': pair = '=+'; break;
    case 'LEFT_BRACKET': pair = '[{'; break;
    case 'RIGHT_BRACKET': pair = ']}'; break;
    case 'BACKSLASH': pair = '\\|'; break;
    case 'SEMICOLON': pair = ';:'; break;
    case 'APOSTROPHE': pair = "'\""; break;
    case 'SLASH': pair = '/?'; break;
  }
  return pair ? pair.charAt(shift ? 1 : 0) : '';
}

/** Ctrl+V remains the Harmony paste shortcut. Other Ctrl keys follow terminal conventions. */
export function terminalControlKey(name: string, shift: boolean): string {
  const key = terminalTextKey(name, 0, shift, false).toLowerCase();
  if (key === 'v') return '';
  if (/^[a-z]$/.test(key)) return String.fromCharCode(key.charCodeAt(0) - 96);
  switch (key) {
    case ' ': case '@': return '\u0000';
    case '[': return '\u001b';
    case '\\': return '\u001c';
    case ']': return '\u001d';
    case '^': return '\u001e';
    case '_': case '-': return '\u001f';
    case '?': return '\u007f';
    default: return '';
  }
}
