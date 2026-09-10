export interface ProjectCreateCommand {
  type: string;
  commandId: string;
  projectId: string;
  title: string;
  workspaceRoot: string;
  createWorkspaceRootIfMissing: boolean;
  createdAt: string;
}

export function projectPath(raw: string, home: string = ''): string {
  let value = raw.trim();
  if (value === '~' || value.startsWith('~/')) {
    if (!home) throw new Error('无法解析环境主目录，请重新连接后重试');
    value = projectPath(home) + value.substring(1);
  }
  if (!value.startsWith('/') || value.includes('\u0000') || value.includes('\\')) {
    throw new Error('请输入环境中的绝对目录路径');
  }
  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return '/' + segments.join('/');
}

export function projectCreateCommand(path: string, commandId: string, projectId: string,
  createdAt: string): ProjectCreateCommand {
  const root = projectPath(path);
  return { type: 'project.create', commandId: commandId, projectId: projectId,
    title: root.substring(root.lastIndexOf('/') + 1) || '/', workspaceRoot: root,
    createWorkspaceRootIfMissing: true, createdAt: createdAt };
}

export function readProjectCreateCommand(raw: string): ProjectCreateCommand | null {
  if (!raw) return null;
  const command = JSON.parse(raw) as ProjectCreateCommand;
  if (command === null || command.type !== 'project.create' ||
    typeof command.commandId !== 'string' || !command.commandId ||
    typeof command.projectId !== 'string' || !command.projectId ||
    typeof command.title !== 'string' || !command.title.trim() ||
    typeof command.workspaceRoot !== 'string' || projectPath(command.workspaceRoot) !== command.workspaceRoot ||
    command.createWorkspaceRootIfMissing !== true ||
    typeof command.createdAt !== 'string' || !Number.isFinite(Date.parse(command.createdAt))) {
    throw new Error('项目创建记录无效，已保留原记录');
  }
  return command;
}
