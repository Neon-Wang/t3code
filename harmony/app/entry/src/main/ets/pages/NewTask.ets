import { ProjectIcon } from './ProjectIcon';
import { AppIcon } from './AppIcon';
import { ComposerSettings } from './ComposerSettings';
import { WorkspaceContext, WorkspaceRef } from './WorkspaceContext';
import { SavedEnvironment } from '../connection/EnvironmentStore';
import { KeyCode } from '@ohos.multimodalInput.keyCode';
import { ComposerPathTrigger, composerPathTrigger, insertComposerPath } from '../model/ComposerPath';
import { FileEntry } from '../model/FileEntries';
import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import util from '@ohos.util';
import { EnvironmentSession, PreparedConnection } from '../connection/Environment';
import { EmptyPayload, RpcRemoteError } from '../connection/Rpc';
import { CreateTaskCommand, NewTaskDraft, NewTaskDraftStore } from '../connection/NewTaskDraftStore';
import { ProjectShell, ModelChoice, ModelSelection, ModelOptionSelection, ServerConfig, ThreadDetail, StartTurnCommand, WS,
  availableModels, preferredModelIndex, startTurnCommand } from '../model/Models';


interface WorktreeRequest { cwd: string; refName: string; newRefName: string; path: string | null; }
interface CreatedWorktree { path: string; refName: string; }
interface WorktreeResult { worktree: CreatedWorktree; }
interface WorktreeLookup { cwd: string; query: string; limit: number; }
interface WorktreeRefs { refs: WorkspaceRef[]; isRepo: boolean; }
interface SwitchRefRequest { cwd: string; refName: string; }
interface PathSearchRequest { cwd: string; query: string; limit: number; }
interface PathSearchResult { entries: FileEntry[]; truncated: boolean; }

@Component
export struct NewTask {
  @Prop @Watch('onDismissRequest') closeRequest: number = 0;
  initialProjectId: string = '';
  onClose: () => void = () => {};
  onCreated: (params: Record<string, string>) => void = () => {};
  onMachine: (saved: SavedEnvironment) => void = () => {};
  private onDismissRequest(): void { this.dismiss(); }
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @Prop projects: ProjectShell[] = [];
  @State projectIndex: number = 0;
  @State models: ModelChoice[] = [];
  @State modelIndex: number = -1;
  @State selectedOptions: ModelOptionSelection[] = [];
  @State branch: string = '';
  @State newWorktree: boolean = false;
  @State worktreeRef: string = '';
  @State worktreePath: string | null = null;
  @State title: string = '';
  @State editingTitle: boolean = false;
  @State draft: string = '';
  @State composerFocused: boolean = false;
  @State runtimeMode: string = 'full-access';
  @State interactionMode: string = 'default';
  @State busy: boolean = false;
  @State error: string = '';
  private createdThreadId: string = '';
  @State pendingCreate: CreateTaskCommand | null = null;
  @State pendingTurn: StartTurnCommand | null = null;
  private draftStore: NewTaskDraftStore | null = null;
  private draftTimer: number = -1;
  private active: boolean = true;
  private finished: boolean = false;
  @State draftReady: boolean = false;
  @State draftStatus: string = '';
  private composerController: TextAreaController = new TextAreaController();
  @State pathEntries: FileEntry[] = [];
  @State pathStatus: string = '';
  private pathStart: number = 0;
  private pathEnd: number = 0;
  private pathTrigger: ComposerPathTrigger | null = null;
  private pathConnection: PreparedConnection | null = null;
  private pathRevision: number = 0;
  private pathTimer: number = -1;


  aboutToAppear(): void {
    const requested = this.projects.findIndex((project: ProjectShell) => project.id === this.initialProjectId);
    this.projectIndex = Math.max(0, requested);
    const connection = EnvironmentSession.current;
    if (connection === null) { this.error = '请先连接环境'; return; }
    this.restoreDraft();
  }

  aboutToDisappear(): void { this.active = false; this.cancelPaths(); this.saveDraft(); }

  private cancelPaths(): void {
    ++this.pathRevision;
    if (this.pathTimer !== -1) clearTimeout(this.pathTimer);
    this.pathTimer = -1;
    this.pathEntries = [];
    this.pathStatus = '';
    this.pathTrigger = null;
    this.pathConnection = null;
  }

  private editDraft(text: string): void {
    this.draft = text;
    this.updatePathSearch(text.length, text.length);
    this.queueSave();
  }

  private chooseProject(index: number): void {
    this.projectIndex = index;
    this.branch = ''; this.worktreePath = null; this.newWorktree = false; this.worktreeRef = '';
    this.modelIndex = preferredModelIndex(this.models, this.projects[index]?.defaultModelSelection ?? null);
    const preferred = this.projects[index]?.defaultModelSelection;
    const model = this.models[this.modelIndex];
    this.selectedOptions = model?.instanceId === preferred?.instanceId && model?.model === preferred?.model ? preferred?.options ?? [] : [];
    this.updatePathSearch(this.pathStart, this.pathEnd);
    this.queueSave();
  }

  private updatePathSearch(start: number, end: number): void {
    this.cancelPaths();
    this.pathStart = start;
    this.pathEnd = end;
    const trigger = composerPathTrigger(this.draft, start, end);
    const project = this.projects[this.projectIndex];
    const connection = EnvironmentSession.current;
    if (!this.active || !this.draftReady || this.busy || this.pendingTurn !== null || this.finished ||
      project === undefined || connection === null || trigger === null || !trigger.query.trim()) return;
    if (trigger.query.length > 256) { this.pathStatus = '文件查询不能超过 256 个字符'; return; }
    this.pathTrigger = trigger;
    this.pathConnection = connection;
    this.pathStatus = '正在搜索项目文件…';
    const revision = this.pathRevision;
    this.pathTimer = setTimeout(() => {
      this.pathTimer = -1;
      this.searchPaths(trigger, revision, project, connection);
    }, 200);
  }

  private async searchPaths(trigger: ComposerPathTrigger, revision: number, project: ProjectShell, connection: PreparedConnection): Promise<void> {
    if (connection !== EnvironmentSession.current || revision !== this.pathRevision) return;
    try {
      const request: PathSearchRequest = { cwd: this.worktreePath ?? project.workspaceRoot, query: trigger.query.trim(), limit: 20 };
      const result = await connection.rpc.call<PathSearchResult>('projects.searchEntries', request);
      if (!this.active || revision !== this.pathRevision || connection !== EnvironmentSession.current) return;
      this.pathEntries = result.entries;
      this.pathStatus = result.entries.length === 0 ? '没有匹配的项目文件' : result.truncated ? '仅显示前 20 项，请继续输入缩小范围' : '';
    } catch (_) {
      if (this.active && revision === this.pathRevision && connection === EnvironmentSession.current) this.pathStatus = '文件搜索失败，请重新输入查询';
    }
  }

  private selectPath(entry: FileEntry): void {
    if (!this.pathEntries.some((candidate: FileEntry) => candidate.path === entry.path && candidate.kind === entry.kind)) return;
    const trigger = this.pathTrigger;
    const current = composerPathTrigger(this.draft, this.pathStart, this.pathEnd);
    if (!this.draftReady || this.busy || this.pendingTurn !== null || this.finished ||
      this.pathConnection !== EnvironmentSession.current ||
      trigger === null || current === null || trigger.start !== current.start || trigger.end !== current.end || trigger.query !== current.query) return;
    const insertion = insertComposerPath(this.draft, trigger, entry.path);
    this.cancelPaths();
    this.editDraft(insertion.text);
    setTimeout(() => {
      if (this.active && this.draft === insertion.text) this.composerController.caretPosition(insertion.cursor);
    }, 0);
  }

  private async restoreDraft(): Promise<void> {
    const connection = EnvironmentSession.current;
    if (connection === null) return;
    try {
      const store = await NewTaskDraftStore.open(getContext(this).filesDir, connection.descriptor.environmentId);
      const saved = await store.load();
      const config = await connection.rpc.call<ServerConfig>(WS.serverGetConfig, new EmptyPayload());
      if (!this.active) return;
      this.draftStore = store;
      this.models = availableModels(config.providers);
      if (saved !== null) {
        this.selectedOptions = saved.modelSelection.options ?? [];
        this.branch = saved.branch ?? ''; this.worktreePath = saved.worktreePath ?? null;
        this.newWorktree = saved.newWorktree ?? false; this.worktreeRef = saved.worktreeRef ?? '';
        this.title = saved.title;
        this.draft = saved.text;
        this.runtimeMode = saved.runtimeMode;
        this.interactionMode = saved.interactionMode;
        this.createdThreadId = saved.createdThreadId;
        this.pendingTurn = saved.turnCommand;
        this.pendingCreate = saved.createCommand ?? null;
        this.projectIndex = this.projects.findIndex((project: ProjectShell) => project.id === saved.projectId);
        this.modelIndex = this.models.findIndex((model: ModelChoice) =>
          model.instanceId === saved.modelSelection.instanceId && model.model === saved.modelSelection.model);
        this.draftStatus = '已恢复新任务草稿';
        if (this.projectIndex < 0 || this.modelIndex < 0) this.error = '草稿中的项目或模型不可用，请重新选择';
      } else {
        this.chooseProject(this.projectIndex);
      }
      this.draftReady = true;
      if (this.modelIndex < 0 && !this.error) this.error = '环境没有可用模型，请检查环境中的 provider 状态';
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
  }

  private queueSave(): void {
    if (!this.draftReady || this.finished) return;
    this.draftStatus = '正在保存草稿…';
    if (this.draftTimer !== -1) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => { this.saveDraft(); }, 250);
  }

  private async dismiss(): Promise<void> {
    if (this.busy) return;
    try {
      if (this.draftReady) await this.persistDraft();
      this.onClose();
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
  }

  private async persistDraft(): Promise<void> {
    if (this.draftTimer !== -1) clearTimeout(this.draftTimer);
    this.draftTimer = -1;
    if (!this.draftReady || this.finished || this.draftStore === null) return;
    const project = this.projects[this.projectIndex];
    const model = this.models[this.modelIndex];
    if (project === undefined || model === undefined) throw new Error('请先选择有效项目和模型，原草稿已保留');
    const draft: NewTaskDraft = {
      newWorktree: this.newWorktree, worktreeRef: this.worktreeRef,
      projectId: project.id, title: this.title, text: this.draft, branch: this.branch || null, worktreePath: this.worktreePath,
      modelSelection: { instanceId: model.instanceId, model: model.model, options: this.selectedOptions },
      runtimeMode: this.runtimeMode, interactionMode: this.interactionMode,
      createdThreadId: this.createdThreadId, turnCommand: this.pendingTurn, createCommand: this.pendingCreate
    };
    await this.draftStore.save(draft);
    if (this.active) this.draftStatus = '草稿已保存';
  }

  private async saveDraft(): Promise<void> {
    try { await this.persistDraft(); }
    catch (error) { if (this.active) this.draftStatus = `草稿保存失败：${error instanceof Error ? error.message : String(error)}`; }
  }

  private projectOptions(): SelectOption[] {
    return this.projects.map((project: ProjectShell): SelectOption => ({ value: project.title }));
  }

  private async prepareWorktree(): Promise<void> {
    if (!this.newWorktree || this.worktreePath) return;
    const connection = EnvironmentSession.current;
    const project = this.projects[this.projectIndex];
    if (connection === null || project === undefined) throw new Error('请先选择项目');
    if (!this.worktreeRef) this.worktreeRef = `t3/harmony-${util.generateRandomUUID(true)}`;
    await this.persistDraft();
    const lookup: WorktreeLookup = { cwd: project.workspaceRoot, query: this.worktreeRef, limit: 50 };
    const refs = await connection.rpc.call<WorktreeRefs>('vcs.listRefs', lookup);
    if (!refs.isRepo) {
      this.worktreeRef = '';
      await this.persistDraft();
      throw new Error('当前项目不是 Git 仓库，无法新建工作树');
    }
    const existing = refs.refs.find((ref: WorkspaceRef) => ref.name === this.worktreeRef);
    if (existing !== undefined) {
      if (!existing.worktreePath) throw new Error('工作树分支已存在但目录不可用，请检查后重试');
      this.worktreePath = existing.worktreePath;
      this.branch = existing.name;
    } else {
      const request: WorktreeRequest = { cwd: project.workspaceRoot, refName: this.branch || 'HEAD', newRefName: this.worktreeRef, path: null };
      const result = await connection.rpc.call<WorktreeResult>('vcs.createWorktree', request);
      if (!result.worktree?.path || result.worktree.refName !== this.worktreeRef) throw new Error('工作树结果无法确认，请重试核对');
      this.worktreePath = result.worktree.path;
      this.branch = result.worktree.refName;
    }
    await this.persistDraft();
  }

  private async create(): Promise<void> {
    const connection = EnvironmentSession.current;
    const project = this.projects[this.projectIndex];
    const model = this.models[this.modelIndex];
    if (connection === null || project === undefined || model === undefined || this.busy || !this.draftReady || !this.draft.trim()) return;
    this.cancelPaths();
    this.busy = true;
    this.error = '';
    try {
      await this.persistDraft();
      const title = this.title.trim() || this.draft.trim().split('\n')[0].slice(0, 80);
      if (!this.createdThreadId) {
        if (this.pendingCreate === null) {
          await this.prepareWorktree();
          if (this.branch && !this.worktreePath) {
            const switchInput: SwitchRefRequest = { cwd: project.workspaceRoot, refName: this.branch };
            await connection.rpc.call('vcs.switchRef', switchInput);
          }
          this.pendingCreate = {
          type: 'thread.create', commandId: util.generateRandomUUID(true),
          threadId: util.generateRandomUUID(true), projectId: project.id, title: title,
          modelSelection: { instanceId: model.instanceId, model: model.model, options: this.selectedOptions },
          runtimeMode: this.runtimeMode, interactionMode: this.interactionMode,
          branch: this.branch || null, worktreePath: this.worktreePath ?? null, createdAt: new Date().toISOString()
          };
          await this.persistDraft();
        }
        await connection.rpc.call(WS.threadStartTurn, this.pendingCreate);
        this.createdThreadId = this.pendingCreate.threadId;
        this.pendingCreate = null;
        await this.persistDraft();
      }
      const thread: ThreadDetail = {
        id: this.createdThreadId, projectId: project.id, title: title,
        runtimeMode: this.runtimeMode, interactionMode: this.interactionMode, messages: []
      };
      if (this.pendingTurn === null) {
        this.pendingTurn = startTurnCommand(thread, this.draft,
          util.generateRandomUUID(true), util.generateRandomUUID(true), new Date().toISOString());
        await this.persistDraft();
      }
      await connection.rpc.call(WS.threadStartTurn, this.pendingTurn);
      await this.draftStore?.clear();
      this.finished = true;
      const destination: Record<string, string> = {
        'environmentId': connection.descriptor.environmentId, 'threadId': this.createdThreadId,
        'cwd': this.worktreePath ?? project.workspaceRoot, 'title': title
      };
      this.onCreated(destination);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      if (error instanceof RpcRemoteError && error.definitivelyRejected) {
        this.pendingTurn = null;
        if (!this.createdThreadId) this.pendingCreate = null;
        await this.saveDraft();
      }
    } finally { this.busy = false; }
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Button('取消', { type: ButtonType.Normal }).fontSize(this.font(14)).fontColor(this.color('foreground-secondary'))
          .backgroundColor(Color.Transparent).height(40).padding({ left: 4, right: 12 }).enabled(!this.busy).onClick(() => { this.dismiss(); })
        Text('新任务').fontSize(this.font(16)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground')).layoutWeight(1).textAlign(TextAlign.Center)
        Button({ type: ButtonType.Circle }) { AppIcon({ name: 'more', iconSize: 20, tint: this.color('foreground-muted') }) }
          .width(40).height(40).backgroundColor(Color.Transparent).enabled(!this.busy).accessibilityText('任务标题选项')
          .bindMenu([{ value: '编辑任务标题', action: () => { this.editingTitle = true; } }])
      }.width('100%')
      Scroll() {
        Column({ space: 16 }) {
          Column({ space: 6 }) {
                    Row({ space: 8 }) {
          ProjectIcon({ cwd: this.projects[this.projectIndex]?.workspaceRoot ?? '', faviconPath: this.projects[this.projectIndex]?.faviconPath ?? '', iconSize: 20 })
          Select(this.projectOptions()).borderRadius(10).font({ size: this.font(14), weight: FontWeight.Normal }).optionFont({ size: this.font(16) }).selectedOptionFont({ size: this.font(14) }).fontColor(this.color('foreground')).backgroundColor(this.color('input')).selected(this.projectIndex)
            .value(this.projects[this.projectIndex]?.title ?? '没有项目')
            .enabled(this.draftReady && !this.busy && !this.createdThreadId && this.pendingCreate === null).width('100%')
            .onSelect((index: number) => { this.chooseProject(index); }).layoutWeight(1)
          }.width('100%')
          Text(this.projects[this.projectIndex]?.workspaceRoot ?? '').fontSize(this.font(12)).fontColor(this.color('foreground-muted')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          }.width('100%').padding({ left: 4, right: 4 })
          }.width('100%')
      }.layoutWeight(1).width('100%').align(Alignment.TopStart)
      Column({ space: 0 }) {
          Column({ space: 8 }) {
          if (this.editingTitle || this.title.length > 0) {
          TextInput({ placeholder: '任务标题（可选）', text: this.title }).fontSize(this.font(14)).fontColor(this.color('foreground')).backgroundColor(Color.Transparent).placeholderColor(this.color('placeholder')).onChange((text: string) => { this.title = text; this.queueSave(); })
            .enabled(this.draftReady && !this.busy && !this.createdThreadId && this.pendingCreate === null)
          }
          // Avoid the device default silently clipping pasted drafts at 1,000,000 characters.
          TextArea({ placeholder: '你想完成什么？', text: this.draft, controller: this.composerController }).fontSize(this.font(16)).fontColor(this.color('foreground')).backgroundColor(Color.Transparent).placeholderColor(this.color('placeholder')).constraintSize({ minHeight: this.composerFocused ? 64 : 36, maxHeight: this.composerFocused ? 120 : 36 })
            .onFocus(() => { this.composerFocused = true; }).onBlur(() => { this.composerFocused = false; })
            .maxLength(2147483647)
            .onChange((text: string) => { this.editDraft(text); }).enabled(this.draftReady && !this.busy && this.pendingTurn === null)
            .onTextSelectionChange((start: number, end: number) => { this.updatePathSearch(start, end); })
            .onKeyPreIme((event: KeyEvent): boolean => {
              if ((event.keyCode !== KeyCode.KEYCODE_ENTER && event.keyCode !== KeyCode.KEYCODE_NUMPAD_ENTER) ||
                !event.getModifierKeyState?.(['ctrl']) || event.getModifierKeyState?.(['alt']) ||
                event.getModifierKeyState?.(['shift'])) return false;
              if (event.type === KeyType.Down) this.create();
              return true;
            })
          if (this.pathStatus) { Text(this.pathStatus).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%') }
          if (this.pathEntries.length > 0) {
            List({ space: 4 }) {
              ForEach(this.pathEntries, (entry: FileEntry) => {
                ListItem() {
                  Button(`${entry.kind === 'directory' ? '目录' : '文件'} · ${entry.path}`)
                    .fontSize(this.font(14)).fontColor(this.color('foreground')).backgroundColor(this.color('card'))
                    .width('100%').onClick(() => { this.selectPath(entry); })
                }
              }, (entry: FileEntry) => entry.kind + ':' + entry.path)
            }.height(160).width('100%')
          }
          Row({ space: 6 }) {
          ComposerSettings({ compact: !this.composerFocused, models: this.models, selection: this.models[this.modelIndex] === undefined ? null : {
            instanceId: this.models[this.modelIndex].instanceId, model: this.models[this.modelIndex].model, options: this.selectedOptions },
            runtimeMode: this.runtimeMode, interactionMode: this.interactionMode,
            disabled: !this.draftReady || this.busy || !!this.createdThreadId || this.pendingCreate !== null || !!this.worktreeRef,
            onModel: (selection: ModelSelection) => {
              const index = this.models.findIndex((model: ModelChoice) => model.instanceId === selection.instanceId && model.model === selection.model);
              if (index >= 0 && index !== this.modelIndex) { this.modelIndex = index; this.selectedOptions = []; this.queueSave(); }
            },
            onOptions: (selection: ModelSelection) => { this.selectedOptions = selection.options ?? []; this.queueSave(); },
            onMode: (kind: string, value: string) => { if (kind === 'runtime') this.runtimeMode = value; else this.interactionMode = value; this.queueSave(); }
          }).layoutWeight(1)
          Button({ type: ButtonType.Circle }) {
            AppIcon({ name: 'send', iconSize: 21, tint: this.color('primary-foreground') })
          }.width(40).height(40).padding(0).backgroundColor(this.color('primary'))
            .accessibilityText(this.busy ? '正在创建' : this.createdThreadId ? '重试发送' : this.pendingCreate !== null ? '核对并重试创建' : '发送并开始任务')
            .enabled(this.draftReady && !this.busy && this.modelIndex >= 0 && this.projects.length > 0 && this.draft.trim().length > 0)
            .onClick(() => { this.create(); })
          }.width('100%').alignItems(VerticalAlign.Bottom)
          }.padding(10).width('100%').borderRadius(20).backgroundColor(this.color('card')).border({ width: 1, color: this.color('border') })
          WorkspaceContext({ worktree: !!this.worktreePath, newWorktree: this.newWorktree, canChooseWorktree: true,
            onWorktreeMode: (value: boolean) => { this.newWorktree = value; this.worktreePath = null; this.worktreeRef = ''; this.queueSave(); }, cwd: this.projects[this.projectIndex]?.workspaceRoot ?? '', selectedBranch: this.branch,
            disabled: !this.draftReady || this.busy || !!this.createdThreadId || this.pendingCreate !== null || !!this.worktreeRef,
            onMachine: (saved: SavedEnvironment) => {
              if (EnvironmentSession.current?.matchesSaved(saved)) return;
              this.persistDraft().then(() => { this.onMachine(saved); })
                .catch((error: Error) => { this.error = error.message; });
            },
            onBranch: (ref: WorkspaceRef) => { this.branch = ref.name; this.worktreePath = this.newWorktree ? null : ref.worktreePath; this.updatePathSearch(this.pathStart, this.pathEnd); this.queueSave(); }
          })
          }.width('100%')
          if (this.draftStatus && !['已恢复新任务草稿', '正在保存草稿…', '草稿已保存'].includes(this.draftStatus)) { Text(this.draftStatus).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%') }
          if (this.error) { Text(this.error).fontColor(this.color('danger-foreground')).width('100%') }
    }.padding({ left: 16, right: 16, bottom: 12 }).width('100%').height('100%')
  }
}
