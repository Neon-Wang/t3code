import { MarkdownNode } from 'libt3markdown.so';

export interface MarkdownRun { text: string; bold: boolean; italic: boolean; strike: boolean; code: boolean; href: string; }
export interface MarkdownCell { runs: MarkdownRun[]; header: boolean; align: string; }
export interface MarkdownRow { cells: MarkdownCell[]; }
export interface MarkdownBlock { kind: string; runs: MarkdownRun[]; level: number; depth: number; marker: string; language: string; rows: MarkdownRow[]; }
// Match the iOS nativeMarkdownText entity handling; code retains source bytes.
function decodeEntities(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 2; pass++) {
    const next = decoded.replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|apos|gt|lt|nbsp|quot);/gi,
      (entity: string, decimal: string, hexadecimal: string): string => {
        if (decimal || hexadecimal) {
          const point = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
          return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
        }
        switch (entity.toLowerCase()) {
          case '&amp;': return '&';
          case '&apos;': return "'";
          case '&gt;': return '>';
          case '&lt;': return '<';
          case '&nbsp;': return '\u00a0';
          case '&quot;': return '"';
          default: return entity;
        }
      });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}
function run(text: string): MarkdownRun { return { text: text, bold: false, italic: false, strike: false, code: false, href: '' }; }
function inline(node: MarkdownNode, parent: MarkdownRun = run('')): MarkdownRun[] {
  const style: MarkdownRun = { text: '', bold: parent.bold || node.type === 'bold',
    italic: parent.italic || node.type === 'italic', strike: parent.strike || node.type === 'strikethrough',
    code: parent.code || node.type === 'code_inline' || node.type === 'code_block', href: node.href ?? parent.href };
  const result: MarkdownRun[] = [];
  if (node.type === 'line_break') style.text = '\n';
  else if (node.type === 'soft_break') style.text = ' ';
  else style.text = node.content ?? '';
  if (node.type === 'image') style.text = node.alt ?? node.title ?? '';
  if (!style.code) style.text = decodeEntities(style.text);
  if (style.text) result.push(style);
  for (const child of node.children) result.push(...inline(child, style));
  return result;
}
function block(node: MarkdownNode, depth: number, marker: string = ''): MarkdownBlock {
  return { kind: node.type, runs: inline(node), level: node.level ?? 0, depth: depth,
    marker: marker, language: node.language ?? '', rows: [] };
}
function tableRows(node: MarkdownNode): MarkdownRow[] {
  if (node.type === 'table_row') return [{ cells: node.children.map((cell: MarkdownNode): MarkdownCell =>
    ({ runs: inline(cell), header: cell.isHeader ?? false, align: cell.align ?? '' })) }];
  const rows: MarkdownRow[] = [];
  for (const child of node.children) rows.push(...tableRows(child));
  return rows;
}
export function markdownBlocks(node: MarkdownNode, depth: number = 0): MarkdownBlock[] {
  const result: MarkdownBlock[] = [];
  if (node.type === 'document') {
    for (const child of node.children) result.push(...markdownBlocks(child, depth));
  } else if (node.type === 'list') {
    let index = node.start ?? 1;
    for (const item of node.children) {
      const marker = item.type === 'task_list_item' ? (item.checked ? '☑' : '☐') : (node.ordered ? `${index}.` : '•');
      let first = true;
      let pending: MarkdownNode[] = [];
      const flushInline = (): void => {
        if (!pending.length) return;
        result.push(block({ type: 'paragraph', children: pending }, depth, first ? marker : ''));
        first = false;
        pending = [];
      };
      for (const child of item.children) {
        if (['text', 'bold', 'italic', 'strikethrough', 'link', 'image', 'code_inline',
          'math_inline', 'html_inline', 'soft_break', 'line_break'].includes(child.type)) {
          pending.push(child);
          continue;
        }
        flushInline();
        if (child.type === 'list') result.push(...markdownBlocks(child, depth + 1));
        else {
          const nested = markdownBlocks(child, depth);
          if (first && nested.length) nested[0].marker = marker;
          result.push(...nested);
          if (nested.length) first = false;
        }
      }
      flushInline();
      index++;
    }
  } else if (node.type === 'blockquote') {
    for (const child of node.children) {
      const nested = markdownBlocks(child, depth + 1);
      for (const entry of nested) { if (!entry.marker) entry.marker = '│'; result.push(entry); }
    }
  } else if (node.type === 'table') {
    const entry = block(node, depth); entry.runs = []; entry.rows = tableRows(node); result.push(entry);
  } else { result.push(block(node, depth)); }
  return result;
}
