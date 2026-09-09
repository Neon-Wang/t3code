export interface SshExecResult { stdout: string; exitCode: number; }
export interface SshNative {
  connect(host: string, port: number, username: string, password: string, hostFingerprint: string): Promise<boolean>;
  openForward(host: string, localPort: number, remotePort: number): Promise<number>;
  exec(command: string, stdinText: string): Promise<SshExecResult>;
  disconnect(): Promise<boolean>;
}
declare const ssh: SshNative;
export default ssh;
