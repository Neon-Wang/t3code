/**
 * 环境连接编排 —— 隧道之上的远程认证序列（与 client-runtime
 * authorization/remote.ts 对齐）：
 *
 *   GET  /.well-known/t3/environment            → environmentId/label
 *   POST /oauth/token（RFC 8693 token-exchange）→ access_token
 *   POST /api/auth/websocket-ticket             → 短时 ticket
 *   WS   /ws?wsTicket=…&clientSurface=mobile…
 */
import http from '@ohos.net.http';
import util from '@ohos.util';
import { RpcClient } from './Rpc';
import { SshEnvironment, SshTarget } from './SshTunnel';
import { SavedEnvironment, SavedSshTarget, SshCredentials, saveEnvironment, saveSshEnvironment } from './EnvironmentStore';

export interface EnvironmentDescriptor {
  environmentId: string;
  label?: string;
}

class EnvironmentNetworkError extends Error {}

export class PreparedConnection {
  httpBaseUrl: string;
  socketUrl: string = '';
  rpc: RpcClient = new RpcClient();
  descriptor: EnvironmentDescriptor;
  private bearer: string;
  private method: string;
  private sshTarget: SshTarget | undefined;
  private connectionId: string;
  private closed: boolean = false;
  private transportVersion: number = 0;
  private recovering: Promise<void> | null = null;

  constructor(httpBaseUrl: string, descriptor: EnvironmentDescriptor, bearer: string, method: string,
    sshTarget?: SshTarget, connectionId: string = '') {
    this.httpBaseUrl = httpBaseUrl;
    this.descriptor = descriptor;
    this.bearer = bearer;
    this.method = method;
    this.sshTarget = sshTarget;
    this.connectionId = connectionId || (method === 'ssh' ? util.generateRandomUUID(true) : '');
  }

  matchesSaved(saved: SavedEnvironment): boolean {
    return saved.environmentId === this.descriptor.environmentId &&
      (this.method === 'ssh' ? saved.ssh !== undefined && saved.connectionId === this.connectionId : saved.ssh === undefined);
  }

  async openRpc(): Promise<RpcClient> {
    this.requireOpen();
    if (this.recovering !== null) await this.recovering;
    this.requireOpen();
    const base = this.httpBaseUrl;
    const version = this.transportVersion;
    let ticket: string;
    try { ticket = await issueWebSocketTicket(base, this.bearer); }
    catch (error) {
      if (!(error instanceof EnvironmentNetworkError) || this.sshTarget === undefined) throw new Error(error instanceof Error ? error.message : String(error));
      await this.recoverSsh(version);
      this.requireOpen();
      ticket = await issueWebSocketTicket(this.httpBaseUrl, this.bearer);
    }
    this.requireOpen();
    const wsBaseUrl = this.httpBaseUrl.replace(/^http/, 'ws');
    const socketUrl = socketUrlOf(wsBaseUrl, ticket, this.method);
    const rpc = new RpcClient();
    await rpc.connect(socketUrl);
    if (this.closed) { rpc.close(); this.requireOpen(); }
    this.socketUrl = socketUrl;
    return rpc;
  }

  private requireOpen(): void {
    if (this.closed) throw new Error('连接已关闭');
  }

  private async recoverSsh(version: number): Promise<void> {
    this.requireOpen();
    if (version !== this.transportVersion) return;
    if (this.recovering !== null) return await this.recovering;
    this.recovering = this.rebuildSsh();
    try { await this.recovering; }
    finally { this.recovering = null; }
  }

  private async rebuildSsh(): Promise<void> {
    const target = this.sshTarget;
    if (target === undefined) return;
    const bootstrap = await SshEnvironment.ensure(target, '', (_message: string) => {});
    try {
      this.requireOpen();
      const descriptor = await fetchDescriptor(bootstrap.httpBaseUrl);
      this.requireOpen();
      if (descriptor.environmentId !== this.descriptor.environmentId) throw new Error('环境 ID 不匹配，请重新配对');
      this.httpBaseUrl = bootstrap.httpBaseUrl;
      this.transportVersion++;
    } catch (error) {
      try { await SshEnvironment.disconnect(target); } catch (_) {}
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.rpc.close();
    try { await this.recovering; } catch (_) {}
    if (this.sshTarget !== undefined) await SshEnvironment.disconnect(this.sshTarget);
  }

  async save(): Promise<void> {
    if (this.sshTarget !== undefined) {
      const target = this.sshTarget;
      const ssh: SavedSshTarget = { hostname: target.hostname, port: target.port,
        username: target.username, hostFingerprint: target.hostFingerprint, serverPort: target.serverPort! };
      const saved: SavedEnvironment = { environmentId: this.descriptor.environmentId,
        connectionId: this.connectionId, httpBaseUrl: '', ssh: ssh,
        label: (this.descriptor.label ?? this.descriptor.environmentId) + ' · SSH', updatedAt: new Date().toISOString() };
      await saveSshEnvironment(saved, this.bearer, target.password);
      return;
    }
    const saved: SavedEnvironment = {
      environmentId: this.descriptor.environmentId, httpBaseUrl: this.httpBaseUrl,
      label: this.descriptor.label ?? this.descriptor.environmentId, updatedAt: new Date().toISOString()
    };
    await saveEnvironment(saved, this.bearer);
  }
}

export class EnvironmentSession {
  static current: PreparedConnection | null = null;
}

interface HttpJsonResult {
  status: number;
  json: object | null;
}

interface TokenResponse {
  access_token: string;
}

interface TicketResponse {
  ticket: string;
}

class TokenExchangeRequest {
  grant_type: string = 'urn:ietf:params:oauth:grant-type:token-exchange';
  subject_token: string;
  subject_token_type: string = 'urn:t3:params:oauth:token-type:environment-bootstrap';
  requested_token_type: string = 'urn:ietf:params:oauth:token-type:access_token';
  client_device_type: string = 'mobile';
  client_os: string = 'harmony';

  constructor(subjectToken: string) {
    this.subject_token = subjectToken;
  }
}

const TOKEN_EXCHANGE_GRANT: string = 'urn:ietf:params:oauth:grant-type:token-exchange';
const BOOTSTRAP_TOKEN_TYPE: string = 'urn:t3:params:oauth:token-type:environment-bootstrap';

function endpointOf(baseUrl: string, path: string): string {
  return baseUrl.endsWith('/') ? baseUrl + path.substring(1) : baseUrl + path;
}

function httpJson(method: http.RequestMethod, url: string, body: string | null,
  authorization: string | null, contentType: string = 'application/json'): Promise<HttpJsonResult> {
  return new Promise<HttpJsonResult>((resolve, reject) => {
    const client = http.createHttp();
    const header: Record<string, string> = { 'Content-Type': contentType };
    if (authorization !== null) {
      header['Authorization'] = authorization;
    }
    client.request(url, {
      method: method,
      header: header,
      extraData: body ?? undefined,
      connectTimeout: 10000,
      readTimeout: 10000
    }, (error, response) => {
      client.destroy();
      if (error) {
        reject(new EnvironmentNetworkError('网络请求失败，请检查环境地址和连接'));
        return;
      }
      if (response.responseCode < 200 || response.responseCode >= 300) {
        reject(new Error(`环境请求失败（HTTP ${response.responseCode}）`));
        return;
      }
      let parsed: object | null = null;
      try {
        parsed = JSON.parse(String(response.result));
      } catch (_) {
        parsed = null;
      }
      const result: HttpJsonResult = { status: response.responseCode, json: parsed };
      resolve(result);
    });
  });
}

async function fetchDescriptor(httpBaseUrl: string): Promise<EnvironmentDescriptor> {
  const response = await httpJson(http.RequestMethod.GET,
    endpointOf(httpBaseUrl, '/.well-known/t3/environment'), null, null);
  if (response.json === null || typeof (response.json as EnvironmentDescriptor).environmentId !== 'string') {
    throw new Error('环境描述符缺失');
  }
  const raw = response.json as EnvironmentDescriptor;
  const descriptor: EnvironmentDescriptor = {
    environmentId: raw.environmentId ?? '',
    label: raw.label
  };
  return descriptor;
}

async function bootstrapBearer(httpBaseUrl: string, pairingToken: string): Promise<string> {
  const fields = new TokenExchangeRequest(pairingToken);
  const body = `grant_type=${encodeURIComponent(fields.grant_type)}` +
    `&subject_token=${encodeURIComponent(fields.subject_token)}` +
    `&subject_token_type=${encodeURIComponent(fields.subject_token_type)}` +
    `&requested_token_type=${encodeURIComponent(fields.requested_token_type)}` +
    `&client_device_type=${fields.client_device_type}&client_os=${fields.client_os}`;
  const response = await httpJson(http.RequestMethod.POST,
    endpointOf(httpBaseUrl, '/oauth/token'), body, null, 'application/x-www-form-urlencoded');
  if (response.json === null) {
    throw new Error('token 交换失败');
  }
  const parsed = response.json as TokenResponse;
  if (typeof parsed.access_token !== 'string') {
    throw new Error('token 交换失败：响应缺少访问凭据');
  }
  return parsed.access_token;
}

async function issueWebSocketTicket(httpBaseUrl: string, bearer: string): Promise<string> {
  const response = await httpJson(http.RequestMethod.POST,
    endpointOf(httpBaseUrl, '/api/auth/websocket-ticket'), '{}', `Bearer ${bearer}`);
  if (response.json === null) {
    throw new Error('websocket ticket 失败');
  }
  const parsed = response.json as TicketResponse;
  if (typeof parsed.ticket !== 'string') {
    throw new Error('websocket ticket 失败：响应缺少票据');
  }
  return parsed.ticket;
}

function socketUrlOf(wsBaseUrl: string, ticket: string, method: string): string {
  const base = wsBaseUrl.endsWith('/') ? wsBaseUrl : wsBaseUrl + '/';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}ws${separator}wsTicket=${encodeURIComponent(ticket)}` +
    `&clientSurface=mobile&clientDeviceType=phone&clientOs=harmony&connectionMethod=${method}`;
}

export async function connectEnvironment(target: SshTarget, t3PackageSpec: string,
  onStatus: (message: string) => void): Promise<PreparedConnection> {
  if (target.serverPort !== undefined && !target.pairingToken?.trim()) {
    throw new Error('请输入该 T3 服务的配对令牌');
  }
  const bootstrap = await SshEnvironment.ensure(target, t3PackageSpec, onStatus);
  try {
    onStatus('读取环境…');
    const descriptor = await fetchDescriptor(bootstrap.httpBaseUrl);
    onStatus('认证…');
    let pairingToken = target.pairingToken?.trim() ?? '';
    if (!pairingToken) {
      onStatus('签发配对令牌…');
      pairingToken = await SshEnvironment.issuePairingToken() ?? '';
    }
    if (!pairingToken) throw new Error('无法签发配对令牌（检查远端 t3 可用性）');
    const bearer = await bootstrapBearer(bootstrap.httpBaseUrl, pairingToken);
    const connection = new PreparedConnection(bootstrap.httpBaseUrl, descriptor, bearer, 'ssh', {
      hostname: target.hostname, port: target.port, username: target.username, password: target.password,
      hostFingerprint: target.hostFingerprint, serverPort: bootstrap.remotePort
    });
    onStatus('建立会话…');
    connection.rpc = await connection.openRpc();
    return connection;
  } catch (error) {
    try { await SshEnvironment.disconnect(target); } catch (_) {}
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/** Connect to an existing environment through a LAN or Tailscale HTTPS endpoint. */
export async function connectDirectEnvironment(httpBaseUrl: string, pairingToken: string,
  onStatus: (message: string) => void): Promise<PreparedConnection> {
  const base = httpBaseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#@]+(?:\/[^?#]*)?$/.test(base)) {
    throw new Error('请输入环境的 HTTP 或 HTTPS 地址');
  }
  onStatus('读取环境…');
  const descriptor = await fetchDescriptor(base);
  onStatus('认证…');
  const bearer = await bootstrapBearer(base, pairingToken.trim());
  const connection = new PreparedConnection(base, descriptor, bearer, 'direct');
  onStatus('建立会话…');
  connection.rpc = await connection.openRpc();
  return connection;
}

export async function restoreDirectEnvironment(saved: SavedEnvironment, bearer: string,
  onStatus: (message: string) => void): Promise<PreparedConnection> {
  onStatus('恢复已保存连接…');
  const descriptor = await fetchDescriptor(saved.httpBaseUrl);
  if (descriptor.environmentId !== saved.environmentId) throw new Error('环境 ID 不匹配，请重新确认地址并配对');
  const connection = new PreparedConnection(saved.httpBaseUrl, descriptor, bearer, 'direct');
  connection.rpc = await connection.openRpc();
  return connection;
}


export async function restoreSshEnvironment(saved: SavedEnvironment, credentials: SshCredentials,
  onStatus: (message: string) => void): Promise<PreparedConnection> {
  const ssh = saved.ssh;
  if (ssh === undefined || !saved.connectionId) throw new Error('SSH 连接配置缺失，请重新连接');
  const target: SshTarget = { hostname: ssh.hostname, port: ssh.port, username: ssh.username,
    password: credentials.password, hostFingerprint: ssh.hostFingerprint, serverPort: ssh.serverPort };
  const bootstrap = await SshEnvironment.ensure(target, '', onStatus);
  try {
    onStatus('恢复已保存连接…');
    const descriptor = await fetchDescriptor(bootstrap.httpBaseUrl);
    if (descriptor.environmentId !== saved.environmentId) throw new Error('环境 ID 不匹配，请重新确认地址并配对');
    const connection = new PreparedConnection(bootstrap.httpBaseUrl, descriptor, credentials.bearer,
      'ssh', target, saved.connectionId);
    connection.rpc = await connection.openRpc();
    return connection;
  } catch (error) {
    try { await SshEnvironment.disconnect(target); } catch (_) {}
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
