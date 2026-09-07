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

function diffPath(value: string): string {
  let path = value.split('\t')[0];
  if (path.startsWith('"') && path.endsWith('"')) {
    try { path = JSON.parse(path) as string; } catch (_) {}
  }
  return path.replace(/^[ab]\//, '');
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
      header = { kind: 'file', id: id, fileId: id, filePath: '',
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
    else if (line.startsWith('rename to ')) header.filePath = diffPath(line.substring(10));
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
