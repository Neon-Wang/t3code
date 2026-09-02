/**
 * SSH 环境接入 —— 对齐桌面 packages/ssh 的语义。
 *
 * 桌面用 `ssh -L` + stdin 脚本在远端启动/复用 T3 server；Harmony 用
 * libssh2（libt3_ssh.so）实现同一协议行为：
 *   1. exec 远端 launch 脚本（sh -l -s -- <stateKey>，stdin 送达）——脚本在
 *      ~/.t3/ssh-launch/<stateKey>/ 下复用或拉起 server，末行输出 JSON
 *      {"remotePort":N,"serverKind":"managed"|"external"}；
 *   2. direct-tcpip 本地转发：HTTP/WS 都走 127.0.0.1:<localPort>；
 *   3. 需要凭据时 exec pairing 脚本签发 pairing token。
 * 状态键 = sha256("alias\0hostname\0username\0port") 前 16 hex（与桌面共享
 * 远端状态目录）。脚本本体与桌面逐字节一致。
 */
import { SshBridge, SshExecResult } from '../bridge/NativeBridge';
import http from '@ohos.net.http';
import cryptoFramework from '@ohos.security.cryptoFramework';
import util from '@ohos.util';

export interface SshTarget {
  hostname: string;
  port: number;
  username: string;
  password: string;
  alias?: string;
}

export interface SshEnvironmentBootstrap {
  remotePort: number;
  serverKind: string;
  localPort: number;
  httpBaseUrl: string;
  wsBaseUrl: string;
  pairingToken: string | null;
}

interface LaunchResult {
  remotePort: number;
  serverKind: string;
}

interface PairingResult {
  credential: string;
}

const DEFAULT_REMOTE_PORT: number = 3773;

function launchScriptBody(stateKey: string, portSpec: string): string {
  return [
    'set -eu',
    `STATE_DIR="$HOME/.t3/ssh-launch/${stateKey}"`,
    'mkdir -p "$STATE_DIR"',
    'if [ -f "$HOME/.t3/userdata/server-runtime.json" ]; then',
    `  PORT=$(node -e "try{const r=require(process.env.HOME+'/.t3/userdata/server-runtime.json');console.log(r.port||${DEFAULT_REMOTE_PORT})}catch(e){console.log(${DEFAULT_REMOTE_PORT})}")`,
    '  echo "{\\"remotePort\\":$PORT,\\"serverKind\\":\\"external\\"}"',
    '  exit 0',
    'fi',
    'if [ -f "$STATE_DIR/port" ] && [ -f "$STATE_DIR/pid" ]; then',
    '  PID=$(cat "$STATE_DIR/pid")',
    '  PORT=$(cat "$STATE_DIR/port")',
    '  if kill -0 "$PID" 2>/dev/null; then',
    '    echo "{\\"remotePort\\":$PORT,\\"serverKind\\":\\"managed\\"}"',
    '    exit 0',
    '  fi',
    'fi',
    `for CANDIDATE in $(seq ${DEFAULT_REMOTE_PORT} $((${DEFAULT_REMOTE_PORT} + 200))); do`,
    '  if node -e "require(\'net\').createServer().once(\'error\',()=>process.exit(1)).once(\'listening\',function(){this.close();process.exit(0)}).listen($CANDIDATE,\'127.0.0.1\')" 2>/dev/null; then',
    '    PORT=$CANDIDATE',
    '    break',
    '  fi',
    'done',
    '[ -n "${PORT:-}" ] || exit 1',
    `cat >"$STATE_DIR/run-t3.sh" <<'RUNNER'`,
    '#!/bin/sh',
    `exec npx -y ${portSpec} serve --host 127.0.0.1 --port "$1" --base-dir "$HOME/.t3"`,
    'RUNNER',
    'chmod +x "$STATE_DIR/run-t3.sh"',
    'nohup "$STATE_DIR/run-t3.sh" "$PORT" >"$STATE_DIR/server.log" 2>&1 &',
    'echo $! >"$STATE_DIR/pid"',
    'echo $PORT >"$STATE_DIR/port"',
    'i=0',
    'while [ $i -lt 600 ]; do',
    '  if node -e "require(\'http\').get(\'http://127.0.0.1:\'+process.argv[1],r=>process.exit(r.statusCode<500?0:1)).on(\'error\',()=>process.exit(1))" "$PORT" 2>/dev/null; then',
    '    break',
    '  fi',
    '  sleep 0.1; i=$((i+1))',
    'done',
    `echo "{\\"remotePort\\":$PORT,\\"serverKind\\":\\"managed\\"}"`
  ].join('\n');
}

function pairingScriptBody(): string {
  return 'set -eu\nexec npx -y t3 auth pairing create --base-dir "$HOME/.t3" --json';
}

function stopScriptBody(stateKey: string): string {
  return [
    'set -eu',
    `STATE_DIR="$HOME/.t3/ssh-launch/${stateKey}"`,
    'if [ -f "$STATE_DIR/pid" ]; then',
    '  kill "$(cat "$STATE_DIR/pid")" 2>/dev/null || true',
    '  rm -f "$STATE_DIR/pid" "$STATE_DIR/port"',
    'fi'
  ].join('\n');
}

async function sha256Hex(input: string): Promise<string> {
  const md = cryptoFramework.createMd('SHA256');
  const encoder = new util.TextEncoder();
  const blob: cryptoFramework.DataBlob = { data: encoder.encodeInto(input) };
  await md.update(blob);
  const digest = await md.digest();
  let hex = '';
  for (const byte of digest.data) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export async function remoteStateKey(target: SshTarget): Promise<string> {
  const alias = target.alias ?? target.hostname;
  const key = [alias, target.hostname, target.username, String(target.port)].join('\0');
  const hex = await sha256Hex(key);
  return hex.substring(0, 16);
}

function parseLaunchResult(stdout: string): LaunchResult {
  const fallback: LaunchResult = { remotePort: DEFAULT_REMOTE_PORT, serverKind: 'managed' };
  const lines = stdout.trim().split('\n');
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
  try {
    const parsed = JSON.parse(lastLine) as LaunchResult;
    if (parsed.remotePort !== undefined) {
      return parsed;
    }
  } catch (_) {
    // 兼容：脚本末行非 JSON 时回落默认端口。
  }
  return fallback;
}

export class SshEnvironment {
  private static bootstrapByStateKey: Map<string, SshEnvironmentBootstrap> = new Map();

  static async ensure(target: SshTarget, t3PackageSpec: string,
    onStatus: (message: string) => void): Promise<SshEnvironmentBootstrap> {
    const stateKey = await remoteStateKey(target);
    const existing = SshEnvironment.bootstrapByStateKey.get(stateKey);
    if (existing !== undefined && await SshEnvironment.probe(existing.httpBaseUrl, 2000)) {
      return existing;
    }

    const ssh = SshBridge.ensure();
    onStatus('连接 SSH 主机…');
    ssh.connect(target.hostname, target.port, target.username, target.password);

    onStatus('启动/复用远端 T3 server…');
    const launch: SshExecResult = ssh.exec(`sh -l -s -- ${stateKey}`,
      launchScriptBody(stateKey, t3PackageSpec));
    if (launch.exitCode !== 0) {
      throw new Error(`远端启动失败（exit ${launch.exitCode}）`);
    }
    const parsed = parseLaunchResult(launch.stdout);

    onStatus('建立隧道…');
    const localPort = 20000 + Math.floor(Math.random() * 20000);
    ssh.openForward(target.hostname, localPort, parsed.remotePort);

    const bootstrap: SshEnvironmentBootstrap = {
      remotePort: parsed.remotePort,
      serverKind: parsed.serverKind,
      localPort: localPort,
      httpBaseUrl: `http://127.0.0.1:${localPort}/`,
      wsBaseUrl: `ws://127.0.0.1:${localPort}/`,
      pairingToken: null
    };
    SshEnvironment.bootstrapByStateKey.set(stateKey, bootstrap);
    return bootstrap;
  }

  static async issuePairingToken(): Promise<string | null> {
    const ssh = SshBridge.ensure();
    const result: SshExecResult = ssh.exec('sh -l -s', pairingScriptBody());
    if (result.exitCode !== 0) {
      return null;
    }
    const lines = result.stdout.trim().split('\n');
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
    try {
      const parsed = JSON.parse(lastLine) as PairingResult;
      return parsed.credential;
    } catch (_) {
      return lastLine.length > 0 ? lastLine : null;
    }
  }

  static async disconnect(target: SshTarget): Promise<void> {
    const stateKey = await remoteStateKey(target);
    SshEnvironment.bootstrapByStateKey.delete(stateKey);
    try {
      const ssh = SshBridge.ensure();
      ssh.exec(`sh -l -s -- ${stateKey}`, stopScriptBody(stateKey));
      ssh.disconnect();
    } catch (_) {
      // 断开尽力而为（桌面同样忽略 disconnect 错误）。
    }
  }

  private static probe(httpBaseUrl: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const client = http.createHttp();
      const timer = setTimeout(() => {
        client.destroy();
        resolve(false);
      }, timeoutMs);
      client.request(httpBaseUrl, (error, response) => {
        clearTimeout(timer);
        client.destroy();
        resolve(!error && response !== undefined && response.responseCode < 500);
      });
    });
  }
}
