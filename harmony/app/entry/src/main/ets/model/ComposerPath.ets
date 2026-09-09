export interface ComposerPathTrigger { query: string; start: number; end: number; }
export interface ComposerPathInsertion { text: string; cursor: number; }

export function composerPathTrigger(text: string, start: number, end: number): ComposerPathTrigger | null {
  if (start !== end) return null;
  const cursor = Number.isFinite(end) ? Math.max(0, Math.min(text.length, Math.floor(end))) : text.length;
  let before = cursor - 1;
  while (before >= 0 && !/[ \n\t\r]/.test(text.charAt(before))) before--;
  const token = text.substring(before + 1, cursor);
  return token.startsWith('@') ? { query: token.substring(1), start: before + 1, end: cursor } : null;
}

export function insertComposerPath(text: string, trigger: ComposerPathTrigger, path: string): ComposerPathInsertion {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const label = path.substring(separator + 1).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const destination = encodeURI(path).replace(/\(/g, '%28').replace(/\)/g, '%29')
    .replace(/#/g, '%23').replace(/\?/g, '%3F').replace(/\\/g, '%5C');
  const replacement = `[${label}](${destination}) `;
  return { text: text.substring(0, trigger.start) + replacement + text.substring(trigger.end), cursor: trigger.start + replacement.length };
}
