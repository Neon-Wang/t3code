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

export interface PreparedConnection {
  httpBaseUrl: string;
  socketUrl: string;
  rpc: RpcClient;
  descriptor: EnvironmentDescriptor;
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
  requested_token_type: string = 'access_token';
  client_device_type: string = 'phone';
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
  authorization: string | null): Promise<HttpJsonResult> {
  return new Promise<HttpJsonResult>((resolve, reject) => {
    const client = http.createHttp();
    const header: Record<string, string> = { 'Content-Type': 'application/json' };
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
        reject(new Error(`http ${url}: ${JSON.stringify(error)}`));
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
  if (response.json === null) {
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
  const body = JSON.stringify(new TokenExchangeRequest(pairingToken));
  const response = await httpJson(http.RequestMethod.POST,
    endpointOf(httpBaseUrl, '/oauth/token'), body, null);
  if (response.json === null) {
    throw new Error('token 交换失败');
  }
  const parsed = response.json as TokenResponse;
  if (typeof parsed.access_token !== 'string') {
    throw new Error(`token 交换失败：${JSON.stringify(response.json)}`);
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
    throw new Error(`websocket ticket 失败：${JSON.stringify(response.json)}`);
  }
  return parsed.ticket;
}

function socketUrlOf(wsBaseUrl: string, ticket: string): string {
  const base = wsBaseUrl.endsWith('/') ? wsBaseUrl : wsBaseUrl + '/';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}ws${separator}wsTicket=${encodeURIComponent(ticket)}` +
    `&clientSurface=mobile&clientDeviceType=phone&clientOs=harmony&connectionMethod=ssh`;
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

  const ticket = await issueWebSocketTicket(bootstrap.httpBaseUrl, bearer);
  const socketUrl = socketUrlOf(bootstrap.wsBaseUrl, ticket);

  onStatus('建立会话…');
  const rpc = new RpcClient();
  await rpc.connect(socketUrl);

  const connection: PreparedConnection = {
    httpBaseUrl: bootstrap.httpBaseUrl,
    socketUrl: socketUrl,
    rpc: rpc,
    descriptor: descriptor
  };
  return connection;
}
