import { NewTask } from './NewTask';
import { ProjectIcon } from './ProjectIcon';
import { AppIcon } from './AppIcon';
import { AppearanceStore } from '../connection/AppearanceStore';
import { ProjectGroup, groupProjects } from '../model/ProjectGrouping';
import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import router from '@ohos.router';
import util from '@ohos.util';
import { connectEnvironment, connectDirectEnvironment, restoreDirectEnvironment, restoreSshEnvironment, EnvironmentSession, PreparedConnection } from '../connection/Environment';
import { SavedEnvironment, SshCredentials, loadEnvironments, readBearer, readSshCredentials, forgetEnvironment } from '../connection/EnvironmentStore';
import { SshTarget } from '../connection/SshTunnel';
import { ThreadShell, ProjectShell, ShellSnapshot, ShellState, ShellItem, WS, visibleThreads, searchArchivedThreads } from '../model/Models';
import { EmptyPayload, RpcClient } from '../connection/Rpc';
import { ReconnectingRpc } from '../connection/ReconnectingRpc';

interface ThreadRow {
  id: string;
  title: string;
  state: string;
  projectTitle: string;
  branch: string;
  faviconPath: string;
  cwd: string;
  archived: boolean;
  settled: boolean;
}

interface TaskActionCommand {
  type: string;
  commandId: string;
  threadId: string;
  title?: string;
  reason?: string;
}

@Entry
@Component
struct Index {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @StorageLink('fontError') fontError: string = '';
  @StorageLink('windowError') windowError: string = '';
  @StorageLink('themeError') themeError: string = '';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @State direct: boolean = true;
  @State environmentUrl: string = '';
  @State pairingToken: string = '';
  private shell: ShellState = new ShellState();
  @State hostname: string = '';
  @State port: string = '22';
  @State username: string = '';
  @State password: string = '';
  @State hostFingerprint: string = '';
  @State packageSpec: string = 't3@nightly';
  @State existingSshServer: boolean = true;
  @State serverPort: string = '3773';
  @State status: string = '';
  @State connecting: boolean = false;
  @State connected: PreparedConnection | null = null;
  @State threads: ThreadRow[] = [];
  @State selectedThreadId: string = '';
  @State projects: ProjectShell[] = [];
  @State projectId: string = '';
  @State composerOpen: boolean = false;
  @State composerCloseRequest: number = 0;
  @State projectsOpen: boolean = false;
  @State projectQuery: string = '';
  @State projectGroups: ProjectGroup[] = [];
  @State groupingError: string = '';
  private groupingMode: string = 'repository';
  @State query: string = '';
  @State filterIndex: number = 0;
  @State renamingId: string = '';
  @State renameTitle: string = '';
  @State actionBusy: boolean = false;
  @State loadingArchive: boolean = false;
  @State archiveOrder: string = 'newest';
  private archivedSnapshot: ShellSnapshot = { snapshotSequence: 0, projects: [], threads: [] };
  @State saved: SavedEnvironment[] = [];
  @State live: boolean = false;
  private subscription: ReconnectingRpc | null = null;
  private homeNavigationId: string = '';
  @State managingEnvironments: boolean = false;

  aboutToAppear(): void {
    if (this.connected === null && !this.connecting) this.restoreLast();
  }

  private openComposerAfterSwitch: boolean = false;

  private async selectComposerMachine(id: string, openComposer: boolean): Promise<void> {
    const saved = (await loadEnvironments()).find((entry: SavedEnvironment) => (entry.connectionId ?? entry.environmentId) === id);
    if (saved === undefined) { this.status = '机器连接已移除，请重新连接'; return; }
    this.openComposerAfterSwitch = openComposer;
    if (this.connected?.matchesSaved(saved)) { this.managingEnvironments = false; this.openComposerAfterSwitch = false; if (openComposer) this.newTask(); return; }
    await this.restore(saved);
    if (!this.connected?.matchesSaved(saved)) this.openComposerAfterSwitch = false;
  }

  onPageShow(): void {
    this.loadGrouping();
    const params = (router.getParams() ?? {}) as Record<string, string>;
    if (params.homeRequest && params.homeRequest !== this.homeNavigationId) {
      this.homeNavigationId = params.homeRequest;
      if (params.view === 'connections') {
        this.managingEnvironments = true;
        this.reloadSaved();
        if (params.selectConnection) this.selectComposerMachine(params.selectConnection, params.openComposer === 'true').catch((error: Error) => { this.openComposerAfterSwitch = false; this.status = error.message; });
      }
      if (params.view === 'archive' && this.connected?.descriptor.environmentId === params.environmentId) {
        this.managingEnvironments = false;
        this.projectId = '';
        this.query = '';
        this.renamingId = '';
        this.filterIndex = 3;
        this.archiveOrder = 'newest';
        this.refreshThreads();
        this.loadArchive();
      }
    }
    if (this.connected !== null && !this.live) this.subscription?.start();
  }

  private async loadGrouping(): Promise<void> {
    try {
      this.groupingMode = await (await AppearanceStore.open(getContext(this))).projectGroupingMode();
      this.groupingError = '';
      this.refreshThreads();
    } catch (_) { this.groupingError = '项目分组读取失败，请在设置中重试'; }
  }

  private async restoreLast(): Promise<void> {
    this.connecting = true;
    try {
      this.saved = await loadEnvironments();
      this.connecting = false;
      if (this.saved.length > 0) await this.restore(this.saved[0]);
    } catch (error) { this.status = error instanceof Error ? error.message : '无法读取已保存连接'; }
    finally { this.connecting = false; }
  }

  private async reloadSaved(): Promise<void> {
    try { this.saved = await loadEnvironments(); }
    catch (error) { this.status = error instanceof Error ? error.message : '无法读取已保存连接'; }
  }

  private async remember(connection: PreparedConnection): Promise<void> {
    try {
      await connection.save();
      this.saved = await loadEnvironments();
    } catch (_) { this.status = '已连接，但无法保存凭据；下次可能需要重新配对'; }
  }

  private async restore(saved: SavedEnvironment): Promise<void> {
    if (this.connecting) return;
    if (this.connected?.matchesSaved(saved)) { this.managingEnvironments = false; return; }
    this.connecting = true;
    this.direct = saved.ssh === undefined;
    this.environmentUrl = saved.httpBaseUrl;
    try {
      const onStatus = (message: string): void => { this.status = message; };
      const credentials: SshCredentials | null = saved.ssh !== undefined ? await readSshCredentials(saved.connectionId ?? '') : null;
      const bearer = credentials === null ? await readBearer(saved.environmentId) : '';
      if (this.connected !== null) await this.disconnect();
      const connection = credentials !== null
        ? await restoreSshEnvironment(saved, credentials, onStatus)
        : await restoreDirectEnvironment(saved, bearer, onStatus);
      EnvironmentSession.current = connection;
      this.connected = connection;
      this.pairingToken = '';
      this.password = '';
      this.managingEnvironments = false;
      this.shell = new ShellState();
      this.status = `已连接：${connection.descriptor.label ?? connection.descriptor.environmentId}`;
      await this.loadThreads();
      await this.remember(connection);
    } catch (error) { this.status = `恢复失败：${error instanceof Error ? error.message : String(error)}`; }
    finally { this.connecting = false; }
  }

  private forget(saved: SavedEnvironment): void {
    if (this.connecting) return;
    AlertDialog.show({ title: '忘记连接', message: `从此手机移除 ${saved.label}（${saved.ssh !== undefined ? saved.ssh.hostname + ':' + saved.ssh.port.toString() : saved.httpBaseUrl}）的访问凭据。再次连接需要重新配对。`,
      primaryButton: { value: '取消', action: () => {} },
      secondaryButton: { value: '忘记', action: async () => {
        if (this.connecting) return;
        this.connecting = true;
        try {
          if (this.connected?.matchesSaved(saved)) await this.disconnect();
          await forgetEnvironment(saved.connectionId ?? saved.environmentId, saved.ssh !== undefined); this.saved = await loadEnvironments(); }
        catch (_) { this.status = '无法删除已保存连接，请重试'; }
        finally { this.connecting = false; }
      } }
    });
  }

  private makeTarget(): SshTarget {
    const target: SshTarget = {
      hostname: this.hostname,
      port: Number(this.port),
      username: this.username,
      password: this.password,
      hostFingerprint: this.hostFingerprint.trim()
    };
    if (this.existingSshServer) {
      target.serverPort = Number(this.serverPort);
      target.pairingToken = this.pairingToken;
    }
    return target;
  }

  private async connect(): Promise<void> {
    if (this.connecting) return;
    const direct = this.direct;
    const url = this.environmentUrl;
    const token = this.pairingToken;
    const target = direct ? null : this.makeTarget();
    const packageSpec = this.packageSpec;
    this.connecting = true;
    this.status = '准备…';
    try {
      const onStatus = (message: string): void => { this.status = message; };
      if (this.connected !== null) await this.disconnect();
      const connection = target === null
        ? await connectDirectEnvironment(url, token, onStatus)
        : await connectEnvironment(target, packageSpec, onStatus);
      EnvironmentSession.current = connection;
      this.connected = connection;
      this.pairingToken = '';
      this.password = '';
      this.managingEnvironments = false;
      this.status = `已连接：${connection.descriptor.label ?? connection.descriptor.environmentId}`;
      await this.loadThreads();
      await this.remember(connection);
    } catch (error) {
      this.status = `连接失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.connecting = false;
    }
  }

  private async loadThreads(): Promise<void> {
    const connection = this.connected;
    if (connection === null) {
      return;
    }
    this.subscription?.stop();
    let initial: RpcClient | null = connection.rpc;
    this.subscription = new ReconnectingRpc(async (): Promise<RpcClient> => {
      if (initial !== null) {
        const rpc = initial;
        initial = null;
        return rpc;
      }
      return await connection.openRpc();
    }, (rpc: RpcClient): Promise<void> => {
      connection.rpc = rpc;
      return rpc.callStream(WS.threadsList, new EmptyPayload(), (values: object[]) => {
        if (this.connected !== connection) return;
        const restored = !this.live;
        this.subscription?.healthy();
        this.live = true;
        this.status = `已连接：${connection.descriptor.label ?? connection.descriptor.environmentId}`;
        for (const value of values) this.shell.apply(value as ShellItem);
        this.projects = this.shell.projects;
        if (this.openComposerAfterSwitch && this.projects.length > 0) { this.openComposerAfterSwitch = false; this.projectId = ''; this.newTask(); }
        this.refreshThreads();
        if (restored && this.filterIndex === 3) this.loadArchive();
      });
    }, (state: string) => {
      if (this.connected !== connection) return;
      this.live = false;
      this.status = state === 'connecting' ? '正在同步任务…' : '连接中断，正在自动重连…';
    });
    this.subscription.start();
  }

  private groupProject(group: ProjectGroup): ProjectShell | undefined {
    const projects = this.filterIndex === 3 ? this.archivedSnapshot.projects : this.projects;
    return projects.find((project: ProjectShell) => project.id === group.representativeId);
  }

  @Builder
  private projectSheet() {
    Column({ space: 12 }) {
      Search({ value: this.projectQuery, placeholder: '搜索项目' }).height(40).textFont({ size: this.font(14) })
        .fontColor(this.color('foreground')).backgroundColor(this.color('input')).onChange((value: string) => { this.projectQuery = value; })
      List({ space: 0 }) {
        ListItemGroup({ style: ListItemGroupStyle.CARD }) {
        ListItem({ style: ListItemStyle.CARD }) {
          Row({ space: 12 }) {
            AppIcon({ name: 'folder', iconSize: 20, tint: this.color('foreground-muted') })
            Text('全部项目').fontSize(this.font(15)).fontColor(this.color('foreground')).layoutWeight(1)
            if (!this.projectId) { Text('✓').fontColor(this.color('primary')) }
          }.height(52).width('100%').padding({ left: 8, right: 8 }).onClick(() => { this.projectId = ''; this.projectsOpen = false; this.refreshThreads(); })
        }
        ForEach(this.projectGroups.filter((group: ProjectGroup) => group.label.toLowerCase().includes(this.projectQuery.toLowerCase())), (group: ProjectGroup) => {
          ListItem({ style: ListItemStyle.CARD }) {
            Row({ space: 12 }) {
              ProjectIcon({ cwd: this.groupProject(group)?.workspaceRoot ?? '', faviconPath: this.groupProject(group)?.faviconPath ?? '', iconSize: 22 })
              Column({ space: 4 }) {
                Text(group.label).fontSize(this.font(15)).fontColor(this.color('foreground')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                Text(this.groupProject(group)?.workspaceRoot ?? '').fontSize(this.font(12)).fontColor(this.color('foreground-muted')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
              }.layoutWeight(1)
              if (group.projectIds.includes(this.projectId)) { Text('✓').fontColor(this.color('primary')) }
            }.width('100%').padding({ left: 8, right: 8, top: 12, bottom: 12 })
              .onClick(() => { this.projectId = group.representativeId; this.projectsOpen = false; this.refreshThreads(); })
              .accessibilityText(`查看项目 ${group.label}`)
          }
        }, (group: ProjectGroup) => group.key)
        }
      }.layoutWeight(1).width('100%')
    }.padding({ left: 20, right: 20, top: 16, bottom: 24 }).width('100%').height('100%')
  }

  private refreshThreads(): void {
    const projects = this.filterIndex === 3 ? this.archivedSnapshot.projects : this.projects;
    this.projectGroups = groupProjects(projects, this.connected?.descriptor.environmentId ?? '', this.groupingMode);
    const group = this.projectGroups.find((entry: ProjectGroup) => entry.projectIds.includes(this.projectId));
    const filters: string[] = ['active', 'all', 'settled', 'archived'];
    const source = this.filterIndex === 3
      ? searchArchivedThreads(this.archivedSnapshot, this.query, this.connected?.descriptor.label ?? '')
      : this.shell.threads;
    this.threads = visibleThreads(source, '',
      filters[this.filterIndex], this.filterIndex === 3 ? '' : this.query, this.archiveOrder).filter((thread: ThreadShell) => !this.projectId || (group !== undefined && group.projectIds.includes(thread.projectId))).map((thread: ThreadShell): ThreadRow => ({
        id: thread.id, title: thread.title ?? '未命名任务',
        state: thread.session?.status ?? 'idle', branch: thread.branch ?? '',
        faviconPath: projects.find((project: ProjectShell) => project.id === thread.projectId)?.faviconPath ?? '',
        projectTitle: projects.find((project: ProjectShell) => project.id === thread.projectId)?.title ?? '',
        cwd: projects.find((project: ProjectShell) => project.id === thread.projectId)?.workspaceRoot ?? '',
        archived: Boolean(thread.archivedAt), settled: Boolean(thread.settledAt)
      }));
  }

  private async loadArchive(): Promise<void> {
    const connection = this.connected;
    if (connection === null || !this.live || this.loadingArchive) return;
    this.loadingArchive = true;
    try {
      const snapshot = await connection.rpc.call<ShellSnapshot>('orchestration.getArchivedShellSnapshot', new EmptyPayload());
      if (this.connected !== connection) return;
      this.archivedSnapshot = snapshot;
      this.refreshThreads();
    } catch (error) { this.status = error instanceof Error ? error.message : String(error); }
    finally { this.loadingArchive = false; }
  }

  private newTask(): void {
    this.composerOpen = true;
  }

  @Builder
  private newTaskSheet() {
    NewTask({ projects: this.projects, initialProjectId: this.projectId, closeRequest: this.composerCloseRequest,
      onClose: () => { this.composerOpen = false; },
      onCreated: (params: Record<string, string>) => {
        this.composerOpen = false;
        router.pushUrl({ url: 'pages/Thread', params: params });
      },
      onMachine: (saved: SavedEnvironment) => {
        this.composerOpen = false;
        this.selectComposerMachine(saved.connectionId ?? saved.environmentId, true)
          .catch((error: Error) => { this.status = error.message; });
      }
    })
  }

  private async taskAction(type: string, threadId: string, title: string = ''): Promise<boolean> {
    const connection = this.connected;
    if (connection === null || !this.live || this.actionBusy) return false;
    const command: TaskActionCommand = {
      type: type, commandId: util.generateRandomUUID(true), threadId: threadId
    };
    if (type === 'thread.meta.update') {
      if (!title.trim()) return false;
      command.title = title.trim();
    }
    if (type === 'thread.unsettle') command.reason = 'user';
    this.actionBusy = true;
    try {
      await connection.rpc.call(WS.threadStartTurn, command);
      if (this.connected !== connection) return false;
      this.renamingId = '';
      if (this.filterIndex === 3) await this.loadArchive();
      return this.connected === connection;
    } catch (error) {
      if (this.connected === connection) this.status = error instanceof Error ? error.message : String(error);
      return false;
    }
    finally { this.actionBusy = false; }
  }

  private deleteTask(thread: ThreadRow): void {
    AlertDialog.show({ title: '删除任务？', message: `将删除“${thread.title}”，此操作不可恢复。`,
      primaryButton: { value: '取消', action: () => {} },
      secondaryButton: { value: '删除', action: () => { this.taskAction('thread.delete', thread.id); } }
    });
  }

  private async disconnect(): Promise<void> {
    this.subscription?.stop();
    this.subscription = null;
    this.live = false;
    const connection = this.connected;
    if (connection !== null) {
      await connection.close();
    }
    EnvironmentSession.current = null;
    this.shell = new ShellState();
    this.connected = null;
    this.threads = [];
    this.projects = [];
    this.projectId = '';
    this.archivedSnapshot = { snapshotSequence: 0, projects: [], threads: [] };
    this.filterIndex = 0;
    this.status = '已断开';
  }

  private openThread(thread: ThreadRow): void {
    if (!thread.archived) { this.routeThread(thread); return; }
    if (!this.live || this.actionBusy) return;
    AlertDialog.show({ title: '恢复并打开任务？', message: `“${thread.title}”已归档。恢复后可查看消息和文件，并继续任务。`,
      primaryButton: { value: '取消', action: () => {} },
      secondaryButton: { value: '恢复并打开', action: async () => {
        if (await this.taskAction('thread.unarchive', thread.id)) this.routeThread(thread);
      } }
    });
  }

  private routeThread(thread: ThreadRow): void {
    const connection = this.connected;
    const params: Record<string, string> = {
      'environmentId': connection !== null ? connection.descriptor.environmentId : '',
      'threadId': thread.id,
      'socketUrl': connection !== null ? connection.socketUrl : '',
      'httpBaseUrl': connection !== null ? connection.httpBaseUrl : '',
      'cwd': thread.cwd
    };
    const options: router.RouterOptions = {
      url: 'pages/Thread',
      params: params
    };
    router.pushUrl(options);
    this.selectedThreadId = thread.id;
  }

  @Builder
  private navigationActions() {
    Row({ space: 8 }) {
        if (this.connected !== null && !this.managingEnvironments) {
          Button({ type: ButtonType.Circle }) { AppIcon({ name: 'plus', iconSize: 21, tint: this.color('foreground') }) }.width(36).height(36).padding(0)
            .fontColor(this.color('foreground')).backgroundColor(this.color('card')).accessibilityText('新任务')
            .enabled(this.live && this.projects.length > 0).onClick(() => { this.newTask(); })
        }
        Button({ type: ButtonType.Circle }) { AppIcon({ name: 'more', iconSize: 21, tint: this.color('foreground-secondary') }) }.width(36).height(36).padding(0)
          .fontColor(this.color('foreground')).backgroundColor(Color.Transparent).accessibilityText('任务工具')
          .enabled(!this.connecting).bindMenu([
            { value: '设置', action: () => { router.pushUrl({ url: 'pages/Settings' }); } },
            { value: '添加项目', action: () => { if (this.live) router.pushUrl({ url: 'pages/AddProject' }); } },
            { value: '切换机器', action: () => { this.managingEnvironments = true; this.reloadSaved(); } },
            { value: '断开连接', action: () => { this.disconnect(); } }
          ])
    }
  }

  build() {
    Navigation() {
    Column({ space: 8 }) {
      if (this.groupingError) { Text(this.groupingError).fontColor(this.color('danger-foreground')) }
      if (this.fontError) { Text(this.fontError).fontColor(this.color('danger-foreground')) }
      if (this.windowError) { Text(this.windowError).fontColor(this.color('danger-foreground')) }
      if (this.themeError) { Text(this.themeError).fontColor(this.color('danger-foreground')) }
      if (this.connected !== null && !this.managingEnvironments) {
        Row({ space: 6 }) {
          AppIcon({ name: 'machine', iconSize: 14, tint: this.color('foreground-muted') })
          Button(`${this.connected.descriptor.label ?? '当前机器'} ⌄`, { type: ButtonType.Normal })
            .fontSize(this.font(13)).height(32).padding(0).fontColor(this.color('foreground-secondary')).backgroundColor(Color.Transparent)
            .onClick(() => { this.managingEnvironments = true; this.reloadSaved(); }).accessibilityText('切换机器')
          Blank()
        }.width('100%')
      }


      if (this.connected === null || this.managingEnvironments) {
        Scroll() {
          Column({ space: 12 }) {
        Text('环境连接').fontSize(this.font(20)).fontColor(this.color('foreground'))
        if (this.connected !== null) {
          Button('返回任务').fontSize(this.font(16)).enabled(!this.connecting)
            .onClick(() => { this.managingEnvironments = false; })
        }
        ForEach(this.saved, (saved: SavedEnvironment) => {
          Row({ space: 8 }) {
            Button(this.connected?.matchesSaved(saved) ? `${saved.label}（当前）` : saved.label).fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.connecting).layoutWeight(1).onClick(() => { this.restore(saved); })
            Button('忘记').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.connecting).onClick(() => { this.forget(saved); })
          }.width('100%')
          Text(saved.ssh !== undefined ? `SSH · ${saved.ssh.hostname}:${saved.ssh.port}` : saved.httpBaseUrl)
            .fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
        }, (saved: SavedEnvironment) => JSON.stringify(saved))
        Row({ space: 8 }) {
          Button('环境地址 / Tailscale').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.direct = true; })
          Button('SSH').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.direct = false; })
        }
        if (this.direct) {
          TextInput({ placeholder: 'https://环境名称.ts.net', text: this.environmentUrl }).fontSize(this.font(16))
            .fontColor(this.color('foreground'))
            .placeholderColor(this.color('foreground-muted'))
            .backgroundColor(this.color('card'))
            .onChange((value: string) => { this.environmentUrl = value; })
          TextInput({ placeholder: '配对令牌', text: this.pairingToken }).fontSize(this.font(16))
            .fontColor(this.color('foreground'))
            .placeholderColor(this.color('foreground-muted'))
            .backgroundColor(this.color('card'))
            .type(InputType.Password)
            .onChange((value: string) => { this.pairingToken = value; })
        } else {
        TextInput({ placeholder: '主机（hostname）', text: this.hostname }).fontSize(this.font(16))
          .fontColor(this.color('foreground'))
          .placeholderColor(this.color('foreground-muted'))
          .backgroundColor(this.color('card'))
          .onChange((value: string) => {
            this.hostname = value;
          })
        TextInput({ placeholder: '端口', text: this.port }).fontSize(this.font(16))
          .fontColor(this.color('foreground'))
          .placeholderColor(this.color('foreground-muted'))
          .backgroundColor(this.color('card'))
          .onChange((value: string) => {
            this.port = value;
          })
        TextInput({ placeholder: '用户名', text: this.username }).fontSize(this.font(16))
          .fontColor(this.color('foreground'))
          .placeholderColor(this.color('foreground-muted'))
          .backgroundColor(this.color('card'))
          .onChange((value: string) => {
            this.username = value;
          })
        TextInput({ placeholder: '主机指纹（SHA256:…，由可信渠道获取）', text: this.hostFingerprint }).fontSize(this.font(16))
          .fontColor(this.color('foreground'))
          .placeholderColor(this.color('foreground-muted'))
          .backgroundColor(this.color('card'))
          .onChange((value: string) => { this.hostFingerprint = value; })
        TextInput({ placeholder: '密码', text: this.password }).fontSize(this.font(16))
          .fontColor(this.color('foreground'))
          .placeholderColor(this.color('foreground-muted'))
          .backgroundColor(this.color('card'))
          .type(InputType.Password)
          .onChange((value: string) => {
            this.password = value;
          })
        Row({ space: 8 }) {
          Button('已有服务').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.existingSshServer = true; })
          Button('自动启动').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.existingSshServer = false; })
        }
        if (this.existingSshServer) {
          TextInput({ placeholder: 'T3 服务端口', text: this.serverPort }).fontSize(this.font(16))
            .fontColor(this.color('foreground')).placeholderColor(this.color('foreground-muted')).backgroundColor(this.color('card'))
            .onChange((value: string) => { this.serverPort = value; })
          TextInput({ placeholder: 'T3 配对令牌', text: this.pairingToken }).fontSize(this.font(16))
            .fontColor(this.color('foreground')).placeholderColor(this.color('foreground-muted')).backgroundColor(this.color('card'))
            .type(InputType.Password)
            .onChange((value: string) => { this.pairingToken = value; })
        } else {
        TextInput({ placeholder: '远端 t3 包（t3@nightly / t3@latest）', text: this.packageSpec }).fontSize(this.font(16))
          .fontColor(this.color('foreground'))
          .placeholderColor(this.color('foreground-muted'))
          .backgroundColor(this.color('card'))
          .onChange((value: string) => {
            this.packageSpec = value;
          })
        }
        }
        Button(this.connecting ? '连接中…' : '连接环境').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary'))
          .enabled(!this.connecting && (this.direct ? this.environmentUrl.length > 0 && this.pairingToken.length > 0 : this.hostname.length > 0))
          .width('100%')
          .onClick(() => {
            this.connect();
          })

          }.width('100%')
        }.layoutWeight(1).width('100%')
      } else {
        if (!this.live) {
          Row({ space: 8 }) {
            Text(this.status).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).layoutWeight(1)
            Button('立即重连').fontSize(this.font(13)).height(32).onClick(() => { this.subscription?.start(); })
          }.width('100%')
        }
        Search({ value: this.query, placeholder: '搜索任务' }).height(38).borderRadius(12).textFont({ size: this.font(14) }).fontColor(this.color('foreground')).placeholderColor(this.color('placeholder')).backgroundColor(this.color('input')).onChange((value: string) => {
          this.query = value; this.refreshThreads();
        })
        Row({ space: 8 }) {
          Button({ type: ButtonType.Normal }) {
            Row({ space: 6 }) {
              AppIcon({ name: 'folder', iconSize: 16, tint: this.color('foreground-secondary') })
              Text(this.projectGroups.find((group: ProjectGroup) => group.projectIds.includes(this.projectId))?.label ?? '全部项目')
                .fontSize(this.font(13)).fontColor(this.color('foreground-secondary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              AppIcon({ name: 'down', iconSize: 12, tint: this.color('foreground-muted') })
            }
          }.height(36).layoutWeight(1).align(Alignment.Start).padding({ left: 0, right: 6 }).backgroundColor(Color.Transparent)
            .onClick(() => { this.projectQuery = ''; this.projectsOpen = true; }).accessibilityText('选择项目')
            .bindSheet($$this.projectsOpen, this.projectSheet(), { height: SheetSize.LARGE, title: { title: '项目' }, blurStyle: BlurStyle.COMPONENT_THICK, dragBar: true, showClose: true, backgroundColor: '#E6' + this.color('screen').slice(1) })
          Select([{ value: '进行中' }, { value: '全部任务' }, { value: '已完成' }, { value: '已归档' }]).height(32).borderRadius(8).font({ size: this.font(13) }).optionFont({ size: this.font(16) }).selectedOptionFont({ size: this.font(13) }).fontColor(this.color('foreground-muted')).backgroundColor(Color.Transparent)
            .selected(this.filterIndex).value(['进行中', '全部任务', '已完成', '已归档'][this.filterIndex])
            .onSelect((index: number) => {
              this.filterIndex = index;
              this.refreshThreads();
              if (index === 3) this.loadArchive();
            })
        }.width('100%')
        if (this.renamingId) {
          Row({ space: 8 }) {
            TextInput({ text: this.renameTitle, placeholder: '任务名称' }).fontSize(this.font(16)).layoutWeight(1)
              .onChange((value: string) => { this.renameTitle = value; })
            Button('保存').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(this.live && !this.actionBusy && this.renameTitle.trim().length > 0)
              .onClick(() => { this.taskAction('thread.meta.update', this.renamingId, this.renameTitle); })
            Button('取消').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.renamingId = ''; })
          }
        }
        if (this.filterIndex === 3) {
          Select([{ value: '最新归档优先' }, { value: '最早归档优先' }])
            .height(32).borderRadius(8).font({ size: this.font(13) }).optionFont({ size: this.font(16) }).selectedOptionFont({ size: this.font(13) })
            .fontColor(this.color('foreground')).backgroundColor(this.color('input'))
            .selected(this.archiveOrder === 'oldest' ? 1 : 0)
            .value(this.archiveOrder === 'oldest' ? '最早归档优先' : '最新归档优先')
            .onSelect((index: number) => { this.archiveOrder = index === 1 ? 'oldest' : 'newest'; this.refreshThreads(); })
          Button(this.loadingArchive ? '加载归档中…' : '刷新归档').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(this.live && !this.loadingArchive)
            .onClick(() => { this.loadArchive(); })
        }
        if (this.threads.length === 0 && !this.loadingArchive) {
          Text(this.query ? '没有匹配的任务' : '此视图暂无任务').fontColor(this.color('foreground-muted')).padding(24)
        }
        List({ space: 2 }) {
          ForEach(this.threads, (thread: ThreadRow) => {
            ListItem() {
              Row({ space: 8 }) {
                ProjectIcon({ cwd: thread.cwd, faviconPath: thread.faviconPath, iconSize: 22 })
                Column({ space: 6 }) {
                  Text(thread.title).fontColor(this.color('foreground')).fontSize(this.font(15)).fontWeight(FontWeight.Medium).maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
                  Row({ space: 5 }) {
                    Text(thread.projectTitle).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).constraintSize({ maxWidth: 130 })
                    if (thread.branch) {
                      AppIcon({ name: 'branch', iconSize: 12, tint: this.color('foreground-muted') })
                      Text(thread.branch).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
                    }
                  }.width('100%')
                  if (thread.state === 'running' || thread.state === 'starting' || thread.state === 'error') {
                    Text(thread.state === 'error' ? '异常' : '执行中').fontSize(this.font(11)).fontColor(this.color(thread.state === 'error' ? 'danger-foreground' : 'primary')).width('100%')
                  }
                }.layoutWeight(1).onClick(() => { this.openThread(thread); })
                Button({ type: ButtonType.Circle }) { AppIcon({ name: 'more', iconSize: 18, tint: this.color('foreground-muted') }) }.width(32).height(36).padding(0).fontColor(this.color('foreground-muted')).backgroundColor(Color.Transparent).accessibilityText('任务操作').enabled(this.live && !this.actionBusy).bindMenu([
                  { value: '重命名', action: () => { this.renamingId = thread.id; this.renameTitle = thread.title; } },
                  { value: thread.settled ? '恢复进行中' : '标记完成', action: () => {
                    this.taskAction(thread.settled ? 'thread.unsettle' : 'thread.settle', thread.id);
                  } },
                  { value: thread.archived ? '恢复归档' : '归档', action: () => {
                    this.taskAction(thread.archived ? 'thread.unarchive' : 'thread.archive', thread.id);
                  } },
                  { value: '删除', action: () => { this.deleteTask(thread); } }
                ])
              }.width('100%').padding({ left: 6, right: 0, top: 12, bottom: 12 }).borderRadius(12).backgroundColor(this.selectedThreadId === thread.id ? this.color('card') : Color.Transparent)
            }
          }, (thread: ThreadRow) => JSON.stringify(thread))
        }
        .layoutWeight(1)
        .width('100%')
      }

      if (this.status.length > 0 && (this.connected === null || this.managingEnvironments)) {
        Text(this.status)
          .fontSize(this.font(13))
          .fontColor(this.color('foreground-muted'))
          .maxLines(2)
      }
    }
    .padding({ left: 16, right: 16, top: 0, bottom: 8 })
    .width('100%')
    .height('100%')
    .backgroundColor(this.color('screen'))
    }
    .title(this.connected === null || this.managingEnvironments ? 'T3 Code' : '任务')
    .titleMode(NavigationTitleMode.Mini).hideBackButton(true).mode(NavigationMode.Stack)
    .menus(this.navigationActions()).width('100%').height('100%').backgroundColor(this.color('screen'))
    .bindSheet($$this.composerOpen, this.newTaskSheet(), {
      height: '85%', blurStyle: BlurStyle.COMPONENT_THICK, keyboardAvoidMode: SheetKeyboardAvoidMode.TRANSLATE_AND_RESIZE, dragBar: true, showClose: false, backgroundColor: '#E6' + this.color('screen').slice(1),
      onWillDismiss: () => { this.composerCloseRequest++; }
    })
  }
}
