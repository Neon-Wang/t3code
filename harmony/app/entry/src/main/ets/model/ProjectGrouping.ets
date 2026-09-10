import { ProjectShell } from './Models';

export interface ProjectGroup {
  key: string;
  label: string;
  representativeId: string;
  projectIds: string[];
}

// Match the mobile client's physical path and repository-relative identity rules.
function normalizedPath(raw: string): string {
  let path = raw.trim();
  if (path !== '/' && path !== '\\' && !/^[a-zA-Z]:[/\\]$/.test(path)) {
    const trimmed = path.startsWith('/') ? path.replace(/\/+$/g, '') : path.replace(/[\\/]+$/g, '');
    if (trimmed) path = /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
  }
  return /^[a-zA-Z]:([/\\]|$)/.test(path) || path.startsWith('\\\\')
    ? path.replace(/\//g, '\\').toLowerCase() : path;
}
function freshness(project: ProjectShell): number {
  const updated = Date.parse(project.updatedAt ?? '');
  const created = Date.parse(project.createdAt ?? '');
  return Number.isFinite(updated) ? updated : Number.isFinite(created) ? created : 0;
}
function newest(projects: ProjectShell[]): ProjectShell {
  return projects.reduce((current: ProjectShell, candidate: ProjectShell): ProjectShell => {
    const delta = freshness(candidate) - freshness(current);
    return delta > 0 || (delta === 0 && candidate.id > current.id) ? candidate : current;
  });
}
function logicalKey(project: ProjectShell, physical: string, mode: string): string {
  const identity = project.repositoryIdentity;
  if (mode === 'separate' || !identity?.canonicalKey) return physical;
  let key = identity.canonicalKey;
  if (mode === 'repository_path') {
    const root = normalizedPath(identity.rootPath ?? '');
    const path = normalizedPath(project.workspaceRoot);
    const prefix = root + (root.includes('\\') ? '\\' : '/');
    if (root && path !== root && path.startsWith(prefix)) key += `::${path.substring(prefix.length).replace(/\\/g, '/')}`;
  }
  return key;
}
function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value: string) => value.trim()).filter((value: string) => value.length > 0)));
}
export function groupProjects(projects: ProjectShell[], environmentId: string, mode: string): ProjectGroup[] {
  const physical = new Map<string, ProjectShell[]>();
  for (const project of projects) {
    const key = `${environmentId}:${normalizedPath(project.workspaceRoot)}`;
    const members = physical.get(key) ?? [];
    members.push(project);
    physical.set(key, members);
  }
  const groups = new Map<string, ProjectGroup>();
  const winners = new Map<string, ProjectShell[]>();
  for (const key of Array.from(physical.keys())) {
    const members = physical.get(key)!;
    const winner = newest(members);
    const identified = members.filter((project: ProjectShell) => Boolean(project.repositoryIdentity));
    const source = winner.repositoryIdentity || identified.length === 0 ? winner : newest(identified);
    const logical = logicalKey(source, key, mode);
    let group = groups.get(logical);
    if (!group) {
      group = { key: logical, label: winner.title, representativeId: winner.id, projectIds: [] };
      groups.set(logical, group);
      winners.set(logical, []);
    }
    group.projectIds = group.projectIds.concat(members.map((project: ProjectShell) => project.id));
    winners.get(logical)!.push(winner);
  }
  for (const key of Array.from(groups.keys())) {
    const members = winners.get(key)!;
    if (members.length < 2) continue;
    const titles = unique(members.map((project: ProjectShell) => project.title));
    const displays = unique(members.map((project: ProjectShell) => project.repositoryIdentity?.displayName ?? ''));
    const names = unique(members.map((project: ProjectShell) => project.repositoryIdentity?.name ?? ''));
    groups.get(key)!.label = titles.length === 1 && !displays.includes(titles[0]) && !names.includes(titles[0])
      ? titles[0] : displays.length === 1 ? displays[0] : names.length === 1 ? names[0] : members[0].title;
  }
  return Array.from(groups.values());
}
