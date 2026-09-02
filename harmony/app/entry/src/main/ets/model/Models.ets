/**
 * 数据模型与 WS 方法名（与 packages/contracts WS_METHODS 对齐，按需扩充）。
 * strict ArkTS：方法名集合用显式类常量（无 "as const"）。
 */

export class WS {
  static readonly serverGetConfig: string = 't3/server/get-config';
  static readonly serverProbe: string = 't3/server/probe';
  static readonly threadsList: string = 't3/threads/list';
  static readonly threadStartTurn: string = 't3/threads/start-turn';
  static readonly threadFeed: string = 't3/threads/feed';
  static readonly projectsListEntries: string = 't3/projects/list-entries';
  static readonly sourceControlLookupRepository: string = 't3/source-control/lookup-repository';
}

export interface ThreadShell {
  id: string;
  title: string | null;
  state: string;
  updatedAt: string | null;
}

export interface EnvironmentInfo {
  environmentId: string;
  label: string;
  capabilities: Record<string, string>;
}

export interface ServerConfig {
  environment: EnvironmentInfo;
}

export interface ProjectEntry {
  name: string;
  path: string;
}

export interface SavedSshEnvironment {
  alias: string;
  hostname: string;
  port: number;
  username: string;
  t3PackageSpec: string;
}
