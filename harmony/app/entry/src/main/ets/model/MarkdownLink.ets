export interface MarkdownFileTarget { path: string; line?: number; }
export function markdownFileLink(href: string, cwd: string, baseDir: string = ''): MarkdownFileTarget | null {
  if (!cwd.startsWith('/')) return null;
  let value = href.trim();
  if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
  if (value.startsWith('file:///')) value = value.slice(7);
  const hash = value.indexOf('#');
  let fragment = hash < 0 ? '' : value.slice(hash);
  value = hash < 0 ? value : value.slice(0, hash);
  const query = value.indexOf('?');
  if (query >= 0) value = value.slice(0, query);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/:\d+(?::\d+)?$/.test(value)) return null;
  try { value = decodeURIComponent(value); fragment = decodeURIComponent(fragment); } catch (_) { return null; }
  const suffix = value.match(/:(\d+)(?::\d+)?$/);
  const position = suffix ?? fragment.match(/^#L(\d+)(?:C\d+)?$/i);
  const line = position ? Number(position[1]) : 0;
  if (suffix) value = value.slice(0, value.length - suffix[0].length);
  if (!value || value.includes('\0') || value.includes('\\') || value.includes('://')) return null;
  const root = cwd.replace(/\/+$/, '');
  if (value.startsWith('/')) {
    if (!value.startsWith(root + '/')) return null;
    value = value.slice(root.length + 1);
  } else if (baseDir) value = baseDir + '/' + value;
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (parts.length === 0) return null; parts.pop(); }
    else parts.push(part);
  }
  if (parts.length === 0) return null;
  return Number.isInteger(line) && line > 0 ? { path: parts.join('/'), line: line } : { path: parts.join('/') };
}
