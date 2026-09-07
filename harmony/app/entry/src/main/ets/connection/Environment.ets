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
import { RpcClient } from './Rpc';
import { SshEnvironment, SshTarget } from './SshTunnel';

export interface EnvironmentDescriptor {
  environmentId: string;
  label?: string;
}

export class PreparedConnection {
  httpBaseUrl: string;
  socketUrl: string = '';
  rpc: RpcClient = new RpcClient();
  descriptor: EnvironmentDescriptor;
  private bearer: string;
  private method: string;

  constructor(httpBaseUrl: string, descriptor: EnvironmentDescriptor, bearer: string, method: string) {
    this.httpBaseUrl = httpBaseUrl;
    this.descriptor = descriptor;
    this.bearer = bearer;
    this.method = method;
  }

  async openRpc(): Promise<RpcClient> {
    const ticket = await issueWebSocketTicket(this.httpBaseUrl, this.bearer);
    const wsBaseUrl = this.httpBaseUrl.replace(/^http/, 'ws');
    const socketUrl = socketUrlOf(wsBaseUrl, ticket, this.method);
    const rpc = new RpcClient();
    await rpc.connect(socketUrl);
    this.socketUrl = socketUrl;
    return rpc;
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
        reject(new Error('网络请求失败，请检查环境地址和连接'));
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
  const bootstrap = await SshEnvironment.ensure(target, t3PackageSpec, onStatus);

  onStatus('读取环境…');
  const descriptor = await fetchDescriptor(bootstrap.httpBaseUrl);

  onStatus('认证…');
  onStatus('签发配对令牌…');
  const pairingToken = await SshEnvironment.issuePairingToken();
  if (pairingToken === null) {
    throw new Error('无法签发配对令牌（检查远端 t3 可用性）');
  }
  const bearer = await bootstrapBearer(bootstrap.httpBaseUrl, pairingToken);

  const connection = new PreparedConnection(bootstrap.httpBaseUrl, descriptor, bearer, 'ssh');
  onStatus('建立会话…');
  connection.rpc = await connection.openRpc();
  return connection;
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
