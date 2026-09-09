export interface ReviewLine { change?: string; content?: string; oldLineNumber?: number; newLineNumber?: number; }
function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function formatLineComment(sectionId: string, sectionTitle: string, filePath: string,
  index: number, line: ReviewLine, comment: string): string {
  const removed = line.change === 'delete';
  const range = `${removed ? 'old' : 'new'} line ${removed ? line.oldLineNumber : (line.newLineNumber ?? line.oldLineNumber)}`;
  const diff = `${removed ? '-' : line.change === 'add' ? '+' : ' '}${line.content ?? ''}`;
  let fenceLength = 3;
  for (const run of diff.match(/`+/g) ?? []) fenceLength = Math.max(fenceLength, run.length + 1);
  const fence = '`'.repeat(fenceLength);
  return `<review_comment sectionId="${attribute(sectionId)}" sectionTitle="${attribute(sectionTitle)}" filePath="${attribute(filePath)}" startIndex="${index}" endIndex="${index}" rangeLabel="${attribute(range)}">\n${comment.trim()}\n${fence}diff\n${diff}\n${fence}\n</review_comment>`;
}
export function appendComment(existing: string, comment: string): string {
  return existing + (existing.trim().length > 0 && !existing.endsWith('\n') ? '\n\n' : '') + comment;
}

export interface CommentSegment {
  kind: string;
  text: string;
  filePath?: string;
  rangeLabel?: string;
  diff?: string;
}
function decodeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
export function parseCommentMessage(value: string): CommentSegment[] {
  const parts: CommentSegment[] = [];
  const pattern = /<review_comment\b([^>]*)>\s*([\s\S]*?)<\/review_comment>/g;
  let cursor = 0;
  let match = pattern.exec(value);
  while (match !== null) {
    const attributes: Record<string, string> = {};
    const attrPattern = /([a-zA-Z][a-zA-Z0-9_-]*)="([^"]*)"/g;
    let attr = attrPattern.exec(match[1]);
    while (attr !== null) {
      attributes[attr[1]] = decodeAttribute(attr[2]);
      attr = attrPattern.exec(match[1]);
    }
    const fencePattern = /(`{3,})([^\s`]*)[^\n]*\n([\s\S]*?)\n\1/g;
    let code = fencePattern.exec(match[2]);
    let lastCode: RegExpExecArray | null = null;
    while (code !== null) { lastCode = code; code = fencePattern.exec(match[2]); }
    if (attributes['filePath'] && attributes['sectionId'] &&
      /^\d+$/.test(attributes['startIndex'] ?? '') && /^\d+$/.test(attributes['endIndex'] ?? '') && lastCode !== null) {
      if (match.index > cursor) parts.push({ kind: 'text', text: value.substring(cursor, match.index) });
      parts.push({ kind: 'comment', filePath: attributes['filePath'], rangeLabel: attributes['rangeLabel'] ?? '',
        text: match[2].substring(0, lastCode.index).trim(), diff: lastCode[3] });
      cursor = match.index + match[0].length;
    }
    match = pattern.exec(value);
  }
  if (cursor < value.length) parts.push({ kind: 'text', text: value.substring(cursor) });
  return parts;
}
