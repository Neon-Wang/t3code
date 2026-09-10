export interface SourceLineLabel { number: number; baseline: number; }
export interface SourceTargetRange { top: number; height: number; }

export function sourceTargetLine(line: number, count: number): number {
  return Number.isInteger(line) && line > 0 ? Math.min(line, count) : 0;
}

export function sourceText(contents: string): string { return contents.replace(/\r\n?/g, '\n'); }

export function sourceLineStarts(contents: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < contents.length; i++) if (contents[i] === '\n') starts.push(i + 1);
  return starts;
}

// Fallback glyph fonts have different ascents and can return no single-character rectangle.
export function sourceUsesBasicGlyphs(contents: string): boolean {
  return contents.length > 0 && /^[\t\n\x20-\x7e]*$/.test(contents);
}
