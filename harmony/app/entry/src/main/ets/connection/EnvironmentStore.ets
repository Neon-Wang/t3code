import asset from '@ohos.security.asset';
import util from '@ohos.util';
import { BusinessError } from '@ohos.base';

export interface SavedSshTarget {
  hostname: string;
  port: number;
  username: string;
  hostFingerprint: string;
  serverPort: number;
}

export interface SshCredentials {
  bearer: string;
  password: string;
}

export interface SavedEnvironment {
  connectionId?: string;
  ssh?: SavedSshTarget;
  environmentId: string;
  httpBaseUrl: string;
  label: string;
  updatedAt: string;
}

function bytes(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value); }
function decode(value: asset.Value | undefined): string {
  if (!(value instanceof Uint8Array)) throw new Error('已保存连接的数据格式错误');
  return util.TextDecoder.create('utf-8').decodeToString(value);
}
function queryFor(id: string = '', ssh: boolean = false): asset.AssetMap {
  const query: asset.AssetMap = new Map();
  query.set(asset.Tag.DATA_LABEL_NORMAL_2, bytes(ssh ? 't3-ssh-environment-v1' : 't3-direct-environment-v1'));
  if (id) query.set(asset.Tag.ALIAS, bytes((ssh ? 't3-ssh:' : 't3-environment:') + id));
  return query;
}

export async function saveEnvironment(environment: SavedEnvironment, bearer: string): Promise<void> {
  await saveAsset(environment, bearer, environment.environmentId, false);
}

export async function saveSshEnvironment(environment: SavedEnvironment, bearer: string, password: string): Promise<void> {
  if (!environment.connectionId || !environment.ssh) throw new Error('SSH 连接配置缺失');
  const credentials: SshCredentials = { bearer: bearer, password: password };
  await saveAsset(environment, JSON.stringify(credentials), environment.connectionId, true);
}

async function saveAsset(environment: SavedEnvironment, secret: string, id: string, ssh: boolean): Promise<void> {
  const attributes = queryFor(id, ssh);
  attributes.set(asset.Tag.SECRET, bytes(secret));
  attributes.set(asset.Tag.DATA_LABEL_NORMAL_1, bytes(JSON.stringify(environment)));
  attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
  attributes.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
  attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
  await asset.add(attributes);
}

export async function loadEnvironments(): Promise<SavedEnvironment[]> {
  const direct = await loadSaved(false);
  const ssh = await loadSaved(true);
  return direct.concat(ssh).sort((a: SavedEnvironment, b: SavedEnvironment) => b.updatedAt.localeCompare(a.updatedAt));
}

async function loadSaved(ssh: boolean): Promise<SavedEnvironment[]> {
  const query = queryFor('', ssh);
  query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ATTRIBUTES);
  let assets: asset.AssetMap[];
  try { assets = await asset.query(query); }
  catch (error) {
    if ((error as BusinessError).code === asset.ErrorCode.NOT_FOUND) return [];
    throw new Error('无法读取已保存连接，请解锁手机后重试');
  }
  return assets.map((item: asset.AssetMap): SavedEnvironment =>
    JSON.parse(decode(item.get(asset.Tag.DATA_LABEL_NORMAL_1))) as SavedEnvironment);
}

export async function readBearer(id: string): Promise<string> {
  return readSecret(id, false);
}

export async function readSshCredentials(id: string): Promise<SshCredentials> {
  return JSON.parse(await readSecret(id, true)) as SshCredentials;
}

async function readSecret(id: string, ssh: boolean): Promise<string> {
  const query = queryFor(id, ssh);
  query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
  const items = await asset.query(query);
  if (items.length !== 1) throw new Error('已保存凭据不存在，请重新配对');
  return decode(items[0].get(asset.Tag.SECRET));
}

export async function forgetEnvironment(id: string, ssh: boolean = false): Promise<void> {
  await asset.remove(queryFor(id, ssh));
}
