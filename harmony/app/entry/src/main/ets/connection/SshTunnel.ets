/** SSH local forwarding, with an explicit existing-service mode and a separate remote launch path. */
import { SshBridge, SshExecResult } from '../bridge/NativeBridge';
import cryptoFramework from '@ohos.security.cryptoFramework';
import util from '@ohos.util';

export interface SshTarget {
  hostname: string;
  port: number;
  username: string;
  password: string;
  hostFingerprint: string;
  alias?: string;
  serverPort?: number;
  pairingToken?: string;
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
  const lines = stdout.trim().split('\n');
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
  try {
    const parsed = JSON.parse(lastLine) as LaunchResult;
    if (parsed !== null && Number.isInteger(parsed.remotePort) &&
      parsed.remotePort > 0 && parsed.remotePort <= 65535 &&
      (parsed.serverKind === 'managed' || parsed.serverKind === 'external')) {
      return parsed;
    }
  } catch (_) {}
  throw new Error('远端启动结果无效：需要有效端口和 serverKind');
}

export class SshEnvironment {

  static async ensure(target: SshTarget, t3PackageSpec: string,
    onStatus: (message: string) => void): Promise<SshEnvironmentBootstrap> {
    if (target.serverPort !== undefined && (!Number.isInteger(target.serverPort) ||
      target.serverPort < 1 || target.serverPort > 65535)) throw new Error('请输入有效的 T3 服务端口');
    const ssh = SshBridge.ensure();
    try {
      onStatus('连接 SSH 主机…');
      await ssh.connect(target.hostname, target.port, target.username, target.password, target.hostFingerprint);

      let parsed: LaunchResult = { remotePort: target.serverPort ?? DEFAULT_REMOTE_PORT, serverKind: 'external' };
      if (target.serverPort === undefined) {
        onStatus('启动/复用远端 T3 server…');
        const stateKey = await remoteStateKey(target);
        const launch: SshExecResult = await ssh.exec(`sh -l -s -- ${stateKey}`,
          launchScriptBody(stateKey, t3PackageSpec));
        if (launch.exitCode !== 0) throw new Error(`远端启动失败（exit ${launch.exitCode}）`);
        parsed = parseLaunchResult(launch.stdout);
      }

      onStatus('建立隧道…');
      const localPort = 20000 + Math.floor(Math.random() * 20000);
      await ssh.openForward(target.hostname, localPort, parsed.remotePort);

      const bootstrap: SshEnvironmentBootstrap = {
        remotePort: parsed.remotePort,
        serverKind: parsed.serverKind,
        localPort: localPort,
        httpBaseUrl: `http://127.0.0.1:${localPort}/`,
        wsBaseUrl: `ws://127.0.0.1:${localPort}/`,
        pairingToken: null
      };
      return bootstrap;
    } catch (error) {
      await ssh.disconnect();
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  static async issuePairingToken(): Promise<string | null> {
    const ssh = SshBridge.ensure();
    const result: SshExecResult = await ssh.exec('sh -l -s', pairingScriptBody());
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

  static async disconnect(_target: SshTarget): Promise<void> {
    await SshBridge.ensure().disconnect();
  }
}
