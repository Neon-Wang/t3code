export interface FileEntry {
  path: string;
  kind: string;
}

export function fileErrorText(message: string): string {
  if (message.includes('"failure":"binary_file"')) return '此文件不是文本，无法在文本预览中打开。';
  if (message.includes('RPC connection') || message.includes('RPC is not connected')) return '连接已断开，请刷新重试。';
  if (message.startsWith('RPC ')) return '无法加载项目文件，请刷新重试。';
  return message;
}

function wordContainsAbbreviation(word: string, token: string): boolean {
  let index = 0;
  for (let offset = 0; offset < word.length; offset++) {
    if (word[offset] === token[index]) index++;
    if (index === token.length) return true;
  }
  return false;
}

function matchesPathSearch(path: string, query: string, tokens: string[]): boolean {
  if (path.toLowerCase().includes(query)) return true;
  const segments = path.toLowerCase().split('/');
  const words = path.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/).filter((word: string) => word.length > 0).map((word: string) => word.toLowerCase());
  return tokens.every((token: string) => segments.some((segment: string) => segment.includes(token)) ||
    words.some((word: string) => wordContainsAbbreviation(word, token)));
}

export function directoryEntries(entries: FileEntry[], directory: string, search: string): FileEntry[] {
  const result: Map<string, FileEntry> = new Map();
  const prefix = directory ? directory + '/' : '';
  const query = search.trim().toLowerCase();
  const tokens = query.split(/[\s/\\._-]+/).filter((token: string) => token.length > 0);
  for (const entry of entries) {
    if (entry.path.startsWith('/') || entry.path.split('/').some((part: string) => part === '..' || part === '')) continue;
    if (query && tokens.length > 0) {
      if (matchesPathSearch(entry.path, query, tokens)) result.set(entry.path, entry);
      continue;
    }
    if (!entry.path.startsWith(prefix)) continue;
    const remainder = entry.path.substring(prefix.length);
    const slash = remainder.indexOf('/');
    const row: FileEntry = slash < 0 ? entry : { path: prefix + remainder.substring(0, slash), kind: 'directory' };
    result.set(row.path, row);
  }
  const rows: FileEntry[] = [];
  result.forEach((entry: FileEntry) => { rows.push(entry); });
  return rows.sort((a: FileEntry, b: FileEntry) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}
