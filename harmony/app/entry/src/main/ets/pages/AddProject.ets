import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import router from '@ohos.router';
import util from '@ohos.util';
import { EnvironmentSession } from '../connection/Environment';
import { DraftStore } from '../connection/DraftStore';
import { EmptyPayload, RpcClient, RpcRemoteError } from '../connection/Rpc';
import { ProjectShell, ShellState, ShellItem, WS } from '../model/Models';
import { ProjectCreateCommand, projectPath, projectCreateCommand, readProjectCreateCommand } from '../model/ProjectCreation';

interface FolderEntry { name: string; fullPath: string; }
interface BrowseInput { partialPath: string; }
interface BrowseResult { parentPath: string; entries: FolderEntry[]; }

@Entry
@Component
struct AddProject {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @State path: string = '';
  @State directory: string = '';
  @State entries: FolderEntry[] = [];
  @State projects: ProjectShell[] = [];
  @State busy: boolean = false;
  @State ready: boolean = false;
  @State error: string = '';
  @State result: string = '';
  @State pending: ProjectCreateCommand | null = null;
  private rpc: RpcClient | null = null;
  private store: DraftStore | null = null;
  private shell: ShellState = new ShellState();
  private active: boolean = true;

  aboutToAppear(): void { this.connect(); }
  aboutToDisappear(): void { this.active = false; this.rpc?.close(); }

  private async connect(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.ready = false;
    this.error = '';
    this.rpc?.close();
    const connection = EnvironmentSession.current;
    try {
      if (connection === null) throw new Error('请先连接环境');
      this.store = await DraftStore.open(getContext(this).filesDir, connection.descriptor.environmentId, 'project-create');
      this.pending = readProjectCreateCommand(await this.store.load());
      if (this.pending !== null) this.path = this.pending.workspaceRoot;
      const rpc = await connection.openRpc();
      if (!this.active) { rpc.close(); return; }
      this.rpc = rpc;
      this.shell = new ShellState();
      rpc.callStream(WS.threadsList, new EmptyPayload(), (values: object[]) => {
        if (!this.active || this.rpc !== rpc) return;
        for (const value of values) this.shell.apply(value as ShellItem);
        this.projects = this.shell.projects;
        this.ready = true;
      }).catch((error: Error) => {
        if (!this.active || this.rpc !== rpc) return;
        this.ready = false;
        this.error = error.message;
      });
      if (!this.path) {
        const home = await rpc.call<BrowseResult>('filesystem.browse', { partialPath: '~/' } as BrowseInput);
        if (!this.active) return;
        this.path = home.parentPath;
        this.directory = home.parentPath;
        this.entries = home.entries;
      }
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; }
  }

  private async resolvePath(path: string): Promise<string> {
    const value = path.trim();
    if ((value === '~' || value.startsWith('~/')) && this.rpc !== null) {
      const home = await this.rpc.call<BrowseResult>('filesystem.browse', { partialPath: '~/' } as BrowseInput);
      return projectPath(value, home.parentPath);
    }
    return projectPath(value);
  }

  private async browse(path: string): Promise<void> {
    if (this.busy || !this.ready || this.pending !== null || this.rpc === null) return;
    this.busy = true;
    this.error = '';
    try {
      const root = await this.resolvePath(path);
      const result = await this.rpc.call<BrowseResult>('filesystem.browse', { partialPath: root.endsWith('/') ? root : root + '/' } as BrowseInput);
      if (!this.active) return;
      this.path = result.parentPath;
      this.directory = result.parentPath;
      this.entries = result.entries;
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; }
  }

  private async create(): Promise<void> {
    if (this.busy || !this.ready || this.rpc === null || this.store === null) return;
    this.busy = true;
    this.error = '';
    try {
      const path = this.pending !== null ? this.pending.workspaceRoot : await this.resolvePath(this.path);
      const existing = this.projects.find((project: ProjectShell) => projectPath(project.workspaceRoot) === path);
      if (existing !== undefined) {
        await this.store.save('');
        this.pending = null;
        this.result = `项目已存在：${existing.title}`;
        return;
      }
      const command = this.pending ?? projectCreateCommand(path, util.generateRandomUUID(true),
        util.generateRandomUUID(true), new Date().toISOString());
      await this.store.save(JSON.stringify(command));
      this.pending = command;
      this.path = command.workspaceRoot;
      await this.rpc.call(WS.threadStartTurn, command);
      await this.store.save('');
      this.pending = null;
      this.result = `项目已添加：${command.title}`;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      if (error instanceof RpcRemoteError && error.definitivelyRejected) {
        try { await this.store.save(''); this.pending = null; }
        catch (_) { this.error += '；创建记录仍保留，请重试'; }
      }
    } finally { this.busy = false; }
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Button('返回').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.busy).onClick(() => { router.back(); })
        Text('添加项目').fontSize(this.font(20)).fontColor(this.color('foreground')).layoutWeight(1).margin({ left: 12 })
      }.width('100%')
      if (this.result) {
        Text(this.result).fontSize(this.font(18)).fontColor(this.color('primary')).width('100%')
        Text(this.path).fontColor(this.color('foreground-secondary')).width('100%')
        Button('返回项目列表').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { router.back(); })
      } else {
        Text('选择环境中的文件夹，或输入新目录路径').fontSize(this.font(14)).fontColor(this.color('foreground-secondary')).width('100%')
        TextInput({ text: this.path, placeholder: '~/project 或绝对目录路径' }).fontSize(this.font(16)).fontColor(this.color('foreground')).backgroundColor(this.color('input')).placeholderColor(this.color('placeholder'))
          .enabled(!this.busy && this.pending === null).onChange((value: string) => { this.path = value; })
        if (this.error) { Text(this.error).fontColor(this.color('danger-foreground')).fontSize(this.font(13)).width('100%') }
        if (!this.ready && !this.busy) { Button('重新连接').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.connect(); }) }
        if (this.pending !== null) {
          Text('创建结果待确认，将先核对已有项目再重试').fontColor(this.color('danger-foreground')).fontSize(this.font(13)).width('100%')
        }
        Row({ space: 8 }) {
          Button('浏览目录').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(this.ready && !this.busy && this.pending === null).onClick(() => { this.browse(this.path); })
          Button(this.pending === null ? '添加项目' : '核对并重试').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary'))
            .enabled(this.ready && !this.busy && this.path.trim().length > 0).onClick(() => { this.create(); })
        }.width('100%')
        Text('新目录不存在时将由环境创建').fontColor(this.color('foreground-muted')).fontSize(this.font(12)).width('100%')
        if (this.busy) { Text('处理中…').fontColor(this.color('foreground-muted')) }
        if (this.directory) {
          Text(this.directory).fontColor(this.color('foreground-secondary')).fontSize(this.font(13)).width('100%')
          if (this.directory !== '/') {
            Button('上级目录').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.busy && this.pending === null)
              .onClick(() => { this.browse(this.directory + '/..'); })
          }
        }
        List({ space: 6 }) {
          ForEach(this.entries, (entry: FolderEntry) => {
            ListItem() {
              Text(entry.name).fontColor(this.color('foreground')).fontSize(this.font(15)).width('100%').padding(14)
                .backgroundColor(this.color('card')).borderRadius(8)
                .onClick(() => { this.browse(entry.fullPath); })
            }
          }, (entry: FolderEntry) => entry.fullPath)
        }.layoutWeight(1).width('100%')
      }
    }.padding(16).width('100%').height('100%').backgroundColor(this.color('screen'))
  }
}
