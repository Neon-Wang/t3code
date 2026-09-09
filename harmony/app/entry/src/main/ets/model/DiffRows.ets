/** Unified git diff -> the upstream Swift review renderer's row contract. */
export interface DiffRow {
  kind: string;
  id: string;
  fileId: string;
  filePath?: string;
  changeType?: string;
  additions?: number;
  deletions?: number;
  text?: string;
  content?: string;
  change?: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

function diffPath(value: string, stripPrefix: boolean = true): string {
  let path = value.split('\t')[0];
  if (path.startsWith('"') && path.endsWith('"')) {
    const quoted = path.substring(1, path.length - 1);
    let encoded = '';
    const escapes: Record<string, string> = { 'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f', 'v': '\v', 'a': '\u0007' };
    for (let index = 0; index < quoted.length; index++) {
      const char = quoted[index];
      if (char !== '\\' || index + 1 >= quoted.length) {
        encoded += char === '%' ? '%25' : char;
        continue;
      }
      const octal = /^[0-7]{1,3}/.exec(quoted.substring(index + 1));
      if (octal !== null) {
        encoded += '%' + parseInt(octal[0], 8).toString(16).padStart(2, '0');
        index += octal[0].length;
      } else {
        const escaped = quoted[++index];
        encoded += escapes[escaped] ?? escaped;
      }
    }
    try { path = decodeURIComponent(encoded); } catch (_) { path = quoted; }
  }
  return stripPrefix ? path.replace(/^[ab]\//, '') : path;
}

export function parseDiffRows(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let header: DiffRow | null = null;
  let oldLine: number = 0;
  let newLine: number = 0;
  let inHunk: boolean = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const id = `file-${rows.length}`;
      const paths = /^diff --git ("(?:\\.|[^"\\])*"|a\/.*?) ("(?:\\.|[^"\\])*"|b\/.*)$/.exec(line);
      const filePath = paths === null ? '' : diffPath(paths[2]);
      header = { kind: 'file', id: id, fileId: id, filePath: filePath,
        changeType: 'modified', additions: 0, deletions: 0 };
      rows.push(header);
      inHunk = false;
      continue;
    }
    if (header === null) continue;
    if (!inHunk && line.startsWith('--- ')) header.filePath = diffPath(line.substring(4));
    else if (!inHunk && line.startsWith('+++ ') && line !== '+++ /dev/null') {
      header.filePath = diffPath(line.substring(4));
    } else if (line.startsWith('new file mode ')) header.changeType = 'added';
    else if (line.startsWith('deleted file mode ')) header.changeType = 'deleted';
    else if (line.startsWith('rename to ')) {
      header.filePath = diffPath(line.substring(10), false);
      header.changeType = 'renamed';
    }
    else if (line.startsWith('@@ ')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match === null) continue;
      oldLine = Number(match[1]); newLine = Number(match[2]); inHunk = true;
      const row: DiffRow = { kind: 'hunk', id: `row-${rows.length}`, fileId: header.id, text: line };
      rows.push(row);
    } else if (inHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      const change = line[0] === '+' ? 'add' : (line[0] === '-' ? 'delete' : 'context');
      const row: DiffRow = { kind: 'line', id: `row-${rows.length}`, fileId: header.id,
        content: line.substring(1), change: change };
      if (change !== 'add') row.oldLineNumber = oldLine++;
      if (change !== 'delete') row.newLineNumber = newLine++;
      if (change === 'add') header.additions = (header.additions ?? 0) + 1;
      if (change === 'delete') header.deletions = (header.deletions ?? 0) + 1;
      rows.push(row);
    } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      const row: DiffRow = { kind: 'notice', id: `row-${rows.length}`, fileId: header.id,
        text: '二进制文件发生变化' };
      rows.push(row);
    }
  }
  return rows;
}
