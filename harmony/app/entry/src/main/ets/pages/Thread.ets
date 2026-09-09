import { AppIcon } from './AppIcon';
import { WorkspaceContext, WorkspaceRef } from './WorkspaceContext';
import { SavedEnvironment } from '../connection/EnvironmentStore';
import { ComposerSettings } from './ComposerSettings';
import { KeyCode } from '@ohos.multimodalInput.keyCode';
import { KeyboardAvoidMode } from '@ohos.arkui.UIContext';
import { ComposerPathTrigger, composerPathTrigger, insertComposerPath } from '../model/ComposerPath';
import { FileEntry } from '../model/FileEntries';
import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
/**
 * 线程详情：消息流（feed 流式分块）+ composer。
 *
 * composer 的编辑面是平台原生文本组件，文档模型与受控协议跑在上游
 * Swift 代码里（T3ComposerEditor 模块经 SwiftBridge 驱动）。
 */
import router from '@ohos.router';
import pasteboard from '@ohos.pasteboard';
import promptAction from '@ohos.promptAction';
import photoAccessHelper from '@ohos.file.photoAccessHelper';
import fileUri from '@ohos.file.fileuri';
import { uploadImage, imageUploadExists, deleteImageUpload } from '../connection/ImageAttachment';
import util from '@ohos.util';
import { EnvironmentSession } from '../connection/Environment';
import { SwiftBridge } from '../bridge/NativeBridge';
import { EmptyPayload, RpcClient, RpcRemoteError } from '../connection/Rpc';
import { ModelChoice, ModelSelection, ServerConfig, ThreadDetail, availableModels, WS, ChatAttachment, TimelineRow, ThreadState, ThreadItem, ShellItem, PendingRequest, pendingRequests, startTurnCommand, interruptTurnCommand, transcriptRows } from '../model/Models';
import { RequestDrafts } from '../model/RequestDrafts';
import { RequestCard } from './RequestCard';
import { MarkdownText } from './MarkdownText';
import { ReconnectingRpc } from '../connection/ReconnectingRpc';
import { CommentSegment, parseCommentMessage } from '../model/ReviewComment';
import { AttachmentDraftStore, DraftImage } from '../connection/AttachmentDraftStore';
import { SendJournal } from '../connection/SendJournal';
import { DraftStore } from '../connection/DraftStore';

interface ComposerSettingCommand { type: string; commandId: string; threadId: string; createdAt?: string; runtimeMode?: string; interactionMode?: string; modelSelection?: ModelSelection; branch?: string; worktreePath?: string | null; }

interface ResponseCommand {
  type: string;
  commandId: string;
  threadId: string;
  requestId: string;
  createdAt: string;
  decision?: string;
  answers?: Record<string, string | string[]>;
}

interface ThreadSubscription {
  threadId: string;
}

interface RouteParams {
  environmentId: string;
  threadId: string;
  socketUrl: string;
  httpBaseUrl: string;
}

interface SwitchRefRequest { cwd: string; refName: string; }
interface PathSearchRequest { cwd: string; query: string; limit: number; }
interface PathSearchResult { entries: FileEntry[]; truncated: boolean; }

@Entry
@Component
struct ThreadPage {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @State models: ModelChoice[] = [];
  @State composerThread: ThreadDetail | null = null;
  @State settingsBusy: boolean = false;
  @State settingsError: string = '';
  @State entries: TimelineRow[] = [];
  @State expandedRows: string[] = [];
  @State requests: PendingRequest[] = [];
  @State responding: boolean = false;
  @State responseError: string = '';
  private scroller: Scroller = new Scroller();
  @State sending: boolean = false;
  @State stopping: boolean = false;
  @State running: boolean = false;
  @State loaded: boolean = false;
  private state: ThreadState = new ThreadState();
  private cwd: string = '';
  private active: boolean = false;
  @State draft: string = '';
  @State composerFocused: boolean = false;
  @State draftReady: boolean = false;
  @State draftStatus: string = '';
  private draftStore: DraftStore | null = null;
  private draftTimer: number = -1;
  private previousKeyboardAvoidMode: KeyboardAvoidMode | null = null;
  private composerController: TextAreaController = new TextAreaController();
  @State pathEntries: FileEntry[] = [];
  @State pathStatus: string = '';
  private pathStart: number = 0;
  private pathEnd: number = 0;
  private pathTrigger: ComposerPathTrigger | null = null;
  private pathRevision: number = 0;
  private pathTimer: number = -1;
  @State composerInstance: string | null = null;
  @State imageUris: string[] = [];
  private imageStore: AttachmentDraftStore | null = null;
  @State imagesReady: boolean = false;
  private journal: SendJournal | null = null;
  @State journalReady: boolean = false;
  @State hasPendingSend: boolean = false;
  @State pickingImage: boolean = false;
  @State threadStatus: string = '';
  private params: RouteParams = { environmentId: '', threadId: '', socketUrl: '', httpBaseUrl: '' };
  private rpc: RpcClient | null = null;
  private connection: ReconnectingRpc | null = null;
  @State reconnecting: boolean = false;

  aboutToAppear(): void {
    const pending = router.getParams() as Record<string, string>;
    this.params = {
      environmentId: pending['environmentId'] ?? '',
      threadId: pending['threadId'] ?? '',
      socketUrl: pending['socketUrl'] ?? '',
      httpBaseUrl: pending['httpBaseUrl'] ?? ''
    };
    this.active = true;
    this.cwd = pending['cwd'] ?? '';
    const environment = EnvironmentSession.current;
    if (environment === null) {
      this.threadStatus = '连接已关闭，请返回重新连接';
      return;
    }
    this.connection = new ReconnectingRpc(() => environment.openRpc(), (rpc: RpcClient) => {
      this.rpc = rpc;
      return this.subscribeFeed(rpc);
    }, (status: string) => {
      this.loaded = false;
      this.reconnecting = true;
      this.rpc = null;
      this.threadStatus = status === 'connecting' ? '正在连接…' : '连接中断，正在自动重连…';
    });
    this.connection.start();

    // composer：Swift 侧实例（受控文档协议在原生层驱动）。
    try {
      const bridge = SwiftBridge.ensure();
      const instance: string | null = bridge.createView('T3ComposerEditor');
      this.composerInstance = instance;
    } catch (_) {
      this.composerInstance = null; // 无 .so 时退化纯 ArkTS 输入。
    }
  }

  onPageShow(): void {
    if (this.previousKeyboardAvoidMode === null) this.previousKeyboardAvoidMode = this.getUIContext().getKeyboardAvoidMode();
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
    this.draftReady = false;
    this.loadDraft(); this.loadImages(); this.loadJournal(); this.connection?.start();
  }

  private restoreKeyboardAvoidMode(): void {
    if (this.previousKeyboardAvoidMode === null) return;
    this.getUIContext().setKeyboardAvoidMode(this.previousKeyboardAvoidMode);
    this.previousKeyboardAvoidMode = null;
  }

  onPageHide(): void {
    this.restoreKeyboardAvoidMode();
    this.cancelPaths();
    this.saveDraft();
    this.connection?.stop();
    this.rpc = null;
    this.loaded = false;
  }

  aboutToDisappear(): void {
    this.restoreKeyboardAvoidMode();
    this.cancelPaths();
    this.saveDraft();
    this.active = false;
    this.connection?.stop();
    if (this.rpc !== null) {
      this.rpc.close();
    }
    if (this.composerInstance !== null) {
      SwiftBridge.ensure().destroyView(this.composerInstance);
    }
  }

  private cancelPaths(): void {
    ++this.pathRevision;
    if (this.pathTimer !== -1) clearTimeout(this.pathTimer);
    this.pathTimer = -1;
    this.pathEntries = [];
    this.pathStatus = '';
    this.pathTrigger = null;
  }

  private updatePathSearch(start: number, end: number): void {
    this.cancelPaths();
    this.pathStart = start;
    this.pathEnd = end;
    const trigger = composerPathTrigger(this.draft, start, end);
    if (!this.active || !this.loaded || !this.draftReady || this.hasPendingSend || this.sending ||
      !this.cwd || trigger === null || !trigger.query.trim()) return;
    if (trigger.query.length > 256) { this.pathStatus = '文件查询不能超过 256 个字符'; return; }
    this.pathTrigger = trigger;
    this.pathStatus = '正在搜索项目文件…';
    const revision = this.pathRevision;
    this.pathTimer = setTimeout(() => { this.pathTimer = -1; this.searchPaths(trigger, revision); }, 200);
  }

  private async searchPaths(trigger: ComposerPathTrigger, revision: number): Promise<void> {
    const rpc = this.rpc;
    if (rpc === null) { if (revision === this.pathRevision) this.pathStatus = '连接已断开，请重新输入查询'; return; }
    try {
      const request: PathSearchRequest = { cwd: this.cwd, query: trigger.query.trim(), limit: 20 };
      const result = await rpc.call<PathSearchResult>('projects.searchEntries', request);
      if (!this.active || revision !== this.pathRevision || rpc !== this.rpc) return;
      this.pathEntries = result.entries;
      this.pathStatus = result.entries.length === 0 ? '没有匹配的项目文件' : result.truncated ? '仅显示前 20 项，请继续输入缩小范围' : '';
    } catch (_) {
      if (this.active && revision === this.pathRevision && rpc === this.rpc) this.pathStatus = '文件搜索失败，请重新输入查询';
    }
  }

  private selectPath(entry: FileEntry): void {
    if (!this.pathEntries.some((candidate: FileEntry) => candidate.path === entry.path && candidate.kind === entry.kind)) return;
    const trigger = this.pathTrigger;
    const current = composerPathTrigger(this.draft, this.pathStart, this.pathEnd);
    if (!this.draftReady || this.hasPendingSend || this.sending || trigger === null || current === null ||
      trigger.start !== current.start || trigger.end !== current.end || trigger.query !== current.query) return;
    const insertion = insertComposerPath(this.draft, trigger, entry.path);
    this.cancelPaths();
    this.editDraft(insertion.text);
    setTimeout(() => {
      if (this.active && this.draft === insertion.text) this.composerController.caretPosition(insertion.cursor);
    }, 0);
  }

  private async loadDraft(): Promise<void> {
    try {
      const store = await DraftStore.open(getContext(this).filesDir, this.params.environmentId, this.params.threadId);
      const text = await store.load();
      if (!this.active) return;
      this.draftStore = store;
      this.draft = text;
    } catch (error) {
      this.draftStatus = '草稿读取失败，本次输入暂不保存';
    } finally {
      if (this.active) { this.draftReady = true; this.reconcilePending(); }
    }
  }

  private editDraft(value: string): void {
    this.draft = value;
    this.updatePathSearch(value.length, value.length);
    if (this.draftStore === null) return;
    this.draftStatus = '正在保存草稿…';
    if (this.draftTimer !== -1) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => { this.saveDraft(); }, 250);
  }

  private async saveDraft(): Promise<void> {
    if (this.draftTimer !== -1) clearTimeout(this.draftTimer);
    this.draftTimer = -1;
    const store = this.draftStore;
    if (store === null || !this.draftReady) return;
    const text = this.draft;
    try {
      await store.save(text);
      if (this.active && this.draft === text) this.draftStatus = text.length > 0 ? '草稿已保存' : '';
    } catch (error) {
      if (this.active) this.draftStatus = '草稿保存失败，请保留当前页面并重试';
    }
  }

  private subscribeFeed(rpc: RpcClient): Promise<void> {
    rpc.call<ServerConfig>(WS.serverGetConfig, new EmptyPayload()).then((config: ServerConfig) => {
      if (this.active && this.rpc === rpc) this.models = availableModels(config.providers);
    }).catch(() => { if (this.active && this.rpc === rpc) this.threadStatus = '模型列表读取失败，请重连后重试'; });
    const subscription: ThreadSubscription = { threadId: this.params.threadId };
    const detail = rpc.callStream(WS.threadFeed, subscription, (values: object[]) => {
      this.connection?.healthy();
      this.reconnecting = false;
      for (const value of values) this.state.apply(value as ThreadItem);
      this.refreshTranscript();
      this.requests = pendingRequests(this.state.activities);
      RequestDrafts.retain(this.params.environmentId, this.params.threadId, this.requests.map((request: PendingRequest) => request.requestId));
      this.syncComposerMetadata();
      this.loaded = this.state.thread !== null;
      this.threadStatus = this.state.thread?.session?.status ?? '';
      this.running = this.threadStatus === 'running' || this.threadStatus === 'starting';
      if (!this.running) this.stopping = false;
      this.reconcilePending();
    });
    const shell = rpc.callStream(WS.threadsList, new EmptyPayload(), (values: object[]) => {
      for (const value of values) this.state.applyShell(value as ShellItem, this.params.threadId);
      this.refreshTranscript();
      this.syncComposerMetadata();
    });
    return Promise.all([detail, shell]).then(() => {});
  }

  private syncComposerMetadata(): void {
    const thread = this.state.thread;
    if (thread === null) { this.composerThread = null; return; }
    // Copy only visible metadata; never clone the message history on a streaming token.
    const metadata: ThreadDetail = { id: thread.id, title: thread.title, projectId: thread.projectId,
      modelSelection: thread.modelSelection, runtimeMode: thread.runtimeMode, interactionMode: thread.interactionMode,
      branch: thread.branch, worktreePath: thread.worktreePath, messages: [] };
    if (JSON.stringify(metadata) !== JSON.stringify(this.composerThread)) this.composerThread = metadata;
  }

  private async chooseMachine(saved: SavedEnvironment): Promise<void> {
    if (EnvironmentSession.current?.matchesSaved(saved) || !this.draftReady || this.draftStore === null || this.hasPendingSend || this.sending) return;
    try {
      await this.draftStore.save(this.draft);
      router.back({ url: 'pages/Index', params: { homeRequest: util.generateRandomUUID(true), view: 'connections', selectConnection: saved.connectionId ?? saved.environmentId } });
    } catch (error) { this.settingsError = `切换前保存草稿失败：${error instanceof Error ? error.message : String(error)}`; }
  }

  private async chooseBranch(ref: WorkspaceRef): Promise<void> {
    const connection = EnvironmentSession.current;
    if (connection === null || connection.descriptor.environmentId !== this.params.environmentId || !this.loaded || this.settingsBusy || this.running || this.sending || this.hasPendingSend) return;
    this.settingsBusy = true; this.settingsError = '';
    try {
      const cwd = this.state.thread?.worktreePath ?? this.cwd;
      if (!ref.worktreePath || ref.worktreePath === cwd) {
        const switchInput: SwitchRefRequest = { cwd: cwd, refName: ref.name };
        await connection.rpc.call('vcs.switchRef', switchInput);
      }
      const command: ComposerSettingCommand = { type: 'thread.meta.update', commandId: util.generateRandomUUID(true),
        threadId: this.params.threadId, branch: ref.name, worktreePath: ref.worktreePath ?? this.state.thread?.worktreePath ?? null };
      await connection.rpc.call(WS.threadStartTurn, command);
    } catch (error) { this.settingsError = `分支切换失败：${error instanceof Error ? error.message : String(error)}`; }
    finally { this.settingsBusy = false; this.loaded = false; if (this.active) this.connection?.start(); }
  }

  private async updateComposerSetting(kind: string, value: string, selection: ModelSelection | null = null): Promise<void> {
    const thread = this.state.thread;
    if (!this.active || !this.loaded || this.settingsBusy || this.sending || this.hasPendingSend || this.rpc === null || thread === null ||
      EnvironmentSession.current?.descriptor.environmentId !== this.params.environmentId) return;
    const command: ComposerSettingCommand = { type: '', commandId: util.generateRandomUUID(true), threadId: this.params.threadId };
    if (kind === 'model' || kind === 'options') {
      if (selection === null || !this.models.some((model: ModelChoice) => model.instanceId === selection.instanceId && model.model === selection.model)) return;
      if (kind === 'model' && thread.modelSelection?.instanceId === selection.instanceId && thread.modelSelection?.model === selection.model) return;
      command.type = 'thread.meta.update';
      command.modelSelection = selection;
    } else if (kind === 'runtime') {
      if (!['full-access', 'approval-required', 'auto-accept-edits', 'auto'].includes(value) || value === thread.runtimeMode) return;
      command.type = 'thread.runtime-mode.set'; command.runtimeMode = value; command.createdAt = new Date().toISOString();
    } else if (kind === 'interaction') {
      if (!['default', 'plan'].includes(value) || value === thread.interactionMode) return;
      command.type = 'thread.interaction-mode.set'; command.interactionMode = value; command.createdAt = new Date().toISOString();
    } else return;
    this.settingsBusy = true; this.settingsError = '';
    try { await this.rpc.call(WS.threadStartTurn, command); }
    catch (error) { this.settingsError = `设置保存未确认：${error instanceof Error ? error.message : String(error)}`; }
    finally {
      this.settingsBusy = false;
      // A receipt can precede shell delivery. Refresh before another complete model/options write.
      this.loaded = false;
      if (this.active) this.connection?.start();
    }
  }

  private async copyMessage(text: string): Promise<void> {
    try {
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text));
      promptAction.showToast({ message: '消息已复制' });
    } catch (_) { promptAction.showToast({ message: '消息复制失败，请重试' }); }
  }

  private async stop(): Promise<void> {
    if (this.rpc === null || this.state.thread === null || this.stopping) return;
    const command = interruptTurnCommand(this.state.thread, util.generateRandomUUID(true), new Date().toISOString());
    if (command === null) return;
    this.stopping = true;
    try { await this.rpc.call(WS.threadStartTurn, command); }
    catch (error) {
      this.stopping = false;
      this.threadStatus = error instanceof Error ? error.message : String(error);
    }
  }

  private async respond(request: PendingRequest, decision: string, answers: Record<string, string | string[]>): Promise<void> {
    if (this.rpc === null || this.responding) return;
    const command: ResponseCommand = {
      type: request.kind === 'approval' ? 'thread.approval.respond' : 'thread.user-input.respond',
      commandId: util.generateRandomUUID(true), threadId: this.params.threadId,
      requestId: request.requestId, createdAt: new Date().toISOString()
    };
    if (request.kind === 'approval') command.decision = decision;
    else command.answers = answers;
    this.responding = true;
    this.responseError = '';
    try { await this.rpc.call(WS.threadStartTurn, command); }
    catch (error) { this.responseError = error instanceof Error ? error.message : String(error); }
    finally { this.responding = false; }
  }

  private async loadJournal(): Promise<void> {
    if (this.journal !== null) { this.reconcilePending(); return; }
    try {
      const journal = await SendJournal.open(getContext(this).filesDir, this.params.environmentId, this.params.threadId);
      if (!this.active) return;
      this.journal = journal;
      this.hasPendingSend = journal.pending !== null;
      this.journalReady = true;
      this.reconcilePending();
    } catch (error) { this.threadStatus = error instanceof Error ? error.message : String(error); }
  }

  private async finishPending(): Promise<void> {
    const pending = this.journal?.pending;
    if (pending === undefined || pending === null || this.imageStore === null || this.journal === null) return;
    await this.imageStore.clear();
    this.imageUris = [];
    if (this.draft === pending.message.text) {
      if (this.draftStore === null) throw new Error('消息已送达，但草稿存储尚未就绪');
      await this.draftStore.save('');
      this.draft = '';
      this.draftStatus = '';
    }
    await this.journal.clear();
    this.hasPendingSend = false;
  }

  private reconcilePending(): void {
    const pending = this.journal?.pending;
    if (!this.active || !this.loaded || !this.imagesReady || !this.draftReady || this.sending || !pending) return;
    if (!this.state.messages.some((message) => message.role === 'user' && message.id === pending.message.messageId)) return;
    this.sending = true;
    this.finishPending().catch((error: Error) => { this.threadStatus = `消息已送达，本地清理待重试：${error.message}`; })
      .finally(() => { this.sending = false; });
  }

  private async handleSendError(error: Error): Promise<void> {
    this.threadStatus = error.message;
    if (!(error instanceof RpcRemoteError) || !error.definitivelyRejected || this.journal?.pending == null) return;
    try {
      if (this.draftStore === null || this.journal === null) return;
      await this.draftStore.save(this.draft);
      await this.journal.clear();
      this.hasPendingSend = false;
      this.draftStatus = '发送被拒绝，草稿已保留，可修改后重发';
    } catch (storageError) {
      this.threadStatus = `发送被拒绝，恢复草稿失败：${storageError instanceof Error ? storageError.message : String(storageError)}`;
    }
  }

  private async retryPending(): Promise<void> {
    const pending = this.journal?.pending;
    if (!pending || !this.loaded || !this.imagesReady || !this.draftReady || this.rpc === null || this.sending) return;
    this.sending = true;
    try {
      if (!this.state.messages.some((message) => message.role === 'user' && message.id === pending.message.messageId)) {
        await this.rpc.call(WS.threadStartTurn, pending);
      }
      await this.finishPending();
    } catch (error) { await this.handleSendError(error instanceof Error ? error : new Error(String(error))); }
    finally { this.sending = false; this.reconcilePending(); }
  }

  private async loadImages(): Promise<void> {
    if (this.imageStore !== null) return;
    try {
      const store = await AttachmentDraftStore.open(getContext(this).filesDir, this.params.environmentId, this.params.threadId);
      if (!this.active) return;
      this.imageStore = store;
      this.imageUris = store.images.map((image: DraftImage) => image.uri);
      this.imagesReady = true;
      this.reconcilePending();
    } catch (error) { this.threadStatus = `图片草稿读取失败：${error instanceof Error ? error.message : String(error)}`; }
  }

  private async removeImage(uri: string): Promise<void> {
    const store = this.imageStore;
    if (store === null || this.hasPendingSend || this.sending || this.pickingImage) return;
    this.pickingImage = true;
    try {
      const uploaded = store.images.find((image: DraftImage) => image.uri === uri)?.uploaded;
      if (uploaded !== undefined) {
        if (this.rpc === null) throw new Error('请恢复连接后移除此图片');
        await deleteImageUpload(this.rpc, uploaded.id);
      }
      await store.remove(uri);
      this.imageUris = store.images.map((image: DraftImage) => image.uri);
    } catch (error) { this.threadStatus = error instanceof Error ? error.message : String(error); }
    finally { this.pickingImage = false; }
  }

  private async pickImages(): Promise<void> {
    if (!this.journalReady || this.hasPendingSend || !this.imagesReady || this.imageStore === null || this.pickingImage || this.sending || this.imageUris.length >= 8) return;
    this.pickingImage = true;
    try {
      const picker = new photoAccessHelper.PhotoViewPicker();
      const result = await picker.select({ MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE,
        maxSelectNumber: 8 - this.imageUris.length });
      for (const uri of result.photoUris) {
        let name = '';
        try { name = new fileUri.FileUri(uri).name; } catch (_) {}
        await this.imageStore.add(uri, name);
        this.imageUris = this.imageStore.images.map((image: DraftImage) => image.uri);
      }
    } catch (error) {
      this.threadStatus = error instanceof Error ? error.message : String(error);
    } finally { this.pickingImage = false; }
  }

  private async send(): Promise<void> {
    if (!this.journalReady || this.journal === null || this.hasPendingSend || !this.loaded || !this.draftReady || !this.imagesReady || this.imageStore === null || this.pickingImage || this.running || (this.draft.trim().length === 0 && this.imageUris.length === 0) || this.rpc === null || this.state.thread === null || this.sending) return;
    const text = this.draft;
    const images = this.imageUris.slice();
    this.cancelPaths();
    this.sending = true;
    const command = startTurnCommand(this.state.thread, text, util.generateRandomUUID(true),
      util.generateRandomUUID(true), new Date().toISOString());
    try {
      const environment = EnvironmentSession.current;
      if (environment === null) throw new Error('连接已关闭');
      for (const uri of images) {
        let uploaded = this.imageStore.images.find((image: DraftImage) => image.uri === uri)?.uploaded;
        if (uploaded !== undefined && !await imageUploadExists(this.rpc, uploaded.id)) uploaded = undefined;
        if (uploaded === undefined) {
          this.threadStatus = '正在上传图片…';
          uploaded = await uploadImage(this.rpc, environment.httpBaseUrl, uri,
            this.imageStore.images.find((image: DraftImage) => image.uri === uri)?.name ?? '');
          try { await this.imageStore.setUploaded(uri, uploaded); }
          catch (error) {
            await deleteImageUpload(this.rpc, uploaded.id);
            throw new Error(error instanceof Error ? error.message : String(error));
          }
        }
        command.message.attachments.push(uploaded);
      }
      await this.journal.save(command);
      this.hasPendingSend = true;
      await this.rpc.call(WS.threadStartTurn, command);
      await this.finishPending();
    } catch (error) {
      await this.handleSendError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.sending = false;
      this.reconcilePending();
    }
  }

  @Builder
  messageMenu(text: string) {
    Menu() { MenuItem({ content: '复制消息' }).onClick(() => { this.copyMessage(text); }) }
  }

  private refreshTranscript(): void {
    this.entries = transcriptRows(this.state.messages, this.state.activities, this.state.thread?.session ?? null,
      this.state.thread?.latestTurn ?? null, this.expandedRows);
  }
  private toggleTranscript(id: string): void {
    this.expandedRows = this.expandedRows.includes(id) ? this.expandedRows.filter((entry: string) => entry !== id) : this.expandedRows.concat([id]);
    this.refreshTranscript();
  }

  build() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        Button({ type: ButtonType.Circle }) { AppIcon({ name: 'back', iconSize: 21, tint: this.color('foreground-secondary') }) }.width(36).height(36).padding(0)
          .fontColor(this.color('foreground')).backgroundColor(Color.Transparent).accessibilityText('返回')
          .onClick(() => { router.back(); })
        Column({ space: 3 }) {
          Text(this.composerThread?.title || '对话').fontSize(this.font(16)).fontWeight(FontWeight.Medium)
            .fontColor(this.color('foreground')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          Text(this.reconnecting ? '正在重连…' : this.running ? '正在执行' : '已连接')
            .fontSize(this.font(11)).fontColor(this.color('foreground-muted')).width('100%')
        }.layoutWeight(1)
        Button({ type: ButtonType.Circle }) { AppIcon({ name: 'more', iconSize: 21, tint: this.color('foreground-secondary') }) }.width(36).height(36).padding(0)
          .fontColor(this.color('foreground')).backgroundColor(Color.Transparent).accessibilityText('对话工具')
          .bindMenu([
            { value: '文件', action: () => { router.pushUrl({ url: 'pages/Files', params: { cwd: this.state.thread?.worktreePath ?? this.cwd } }); } },
            { value: 'Diff', action: () => { router.pushUrl({ url: 'pages/Diff', params: { threadId: this.params.threadId, cwd: this.state.thread?.worktreePath ?? this.cwd, toTurnCount: this.state.checkpointCount.toString() } }); } },
            { value: '终端', action: () => { router.pushUrl({ url: 'pages/Terminal', params: { threadId: this.params.threadId, cwd: this.state.thread?.worktreePath ?? this.cwd } }); } },
            { value: '任务设置', action: () => { router.pushUrl({ url: 'pages/TaskModel', params: { threadId: this.params.threadId } }); } },
            { value: '最新消息', action: () => { this.scroller.scrollEdge(Edge.Bottom); } }
          ])
      }.width('100%').padding({ bottom: 12 })
      if (this.requests.length > 0) {
        Button(`待处理请求 (${this.requests.length})`).fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.scroller.scrollEdge(Edge.Top); })
      }
      if (this.responseError) { Text(this.responseError).fontColor(this.color('danger-foreground')).fontSize(this.font(12)) }
      List({ space: 6, scroller: this.scroller }) {
        ForEach(this.requests, (request: PendingRequest) => {
          ListItem() {
            RequestCard({ request: request, busy: this.responding, environmentId: this.params.environmentId, threadId: this.params.threadId,
              onRespond: (decision: string, answers: Record<string, string | string[]>) => {
                this.respond(request, decision, answers);
              } })
          }
        }, (request: PendingRequest) => request.requestId)
        ForEach(this.entries, (entry: TimelineRow) => {
          ListItem() {
            if (entry.kind === 'tool' || entry.kind === 'tools' || entry.kind === 'turn') {
              Column({ space: 4 }) {
                Row({ space: 8 }) {
                  if (entry.kind !== 'turn') {
                    AppIcon({ name: 'terminal', iconSize: 15, tint: this.color('foreground-muted') })
                  }
                  Text(entry.text.replace(/\s+/g, ' ')).fontSize(this.font(13)).fontColor(this.color('foreground-muted'))
                    .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
                  AppIcon({ name: this.expandedRows.includes(entry.id) ? 'down' : 'chevron', iconSize: 14, tint: this.color('foreground-muted') })
                }.constraintSize({ minHeight: 32 }).width('100%').padding({ left: 4, right: 4, top: 7, bottom: 7 })
                  .onClick(() => { this.toggleTranscript(entry.id); })
                  .accessibilityText(`${this.expandedRows.includes(entry.id) ? '收起' : '展开'} ${entry.text}`)
                if (entry.kind === 'tool' && this.expandedRows.includes(entry.id)) {
                  Text(entry.status).fontSize(this.font(11)).fontColor(this.color('foreground-muted')).width('100%')
                  Scroll() {
                    Text(entry.detail || '暂无详细输出').fontFamily('monospace').fontSize(this.sizes.codeFontSize)
                      .fontColor(this.color('foreground-secondary')).copyOption(CopyOptions.LocalDevice).width('100%').padding(12)
                  }.constraintSize({ maxHeight: 240 }).width('100%').backgroundColor(this.color('card')).borderRadius(8)
                }
              }.width('100%').padding({ left: entry.depth === 1 ? 14 : 0, bottom: 2 })
            } else {
              Row() {
              Column({ space: 8 }) {
                ForEach(entry.attachments ?? [], (attachment: ChatAttachment) => {
                  if (attachment.type === 'image') {
                    Button(`查看图片 · ${attachment.name}`).fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => {
                      router.pushUrl({ url: 'pages/ImagePreview', params: {
                        attachmentId: attachment.id, name: attachment.name, mimeType: attachment.mimeType
                      } });
                    })
                  } else {
                    Text(`附件：${attachment.name}`).fontColor(this.color('foreground-secondary'))
                  }
                }, (attachment: ChatAttachment) => attachment.id)

                ForEach(parseCommentMessage(entry.text), (part: CommentSegment) => {
                  if (part.kind === 'comment') {
                    Column({ space: 8 }) {
                      Text(part.filePath ?? '').fontSize(this.font(14)).fontWeight(FontWeight.Medium)
                        .fontColor(this.color('foreground')).width('100%').copyOption(CopyOptions.LocalDevice)
                      Text(part.rangeLabel ?? '').fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
                      Text(part.diff ?? '').fontFamily('monospace').fontSize(this.sizes.codeFontSize).fontColor(this.color('md-code-text'))
                        .width('100%').padding(8).backgroundColor(this.color('screen')).copyOption(CopyOptions.LocalDevice)
                      MarkdownText({ content: part.text, cwd: this.state.thread?.worktreePath ?? this.cwd })
                    }.padding(10).width('100%').borderRadius(8).backgroundColor(this.color('card'))
                  } else if (entry.role === 'user' && !/[\[\]`*_#<>~]/.test(part.text)) {
                    Text(part.text).fontSize(this.sizes.baseFontSize).lineHeight(this.font(24)).fontColor(this.color('foreground'))
                      .copyOption(CopyOptions.LocalDevice)
                  } else {
                    MarkdownText({ content: part.text, cwd: this.state.thread?.worktreePath ?? this.cwd })
                  }
                })
              }
              .padding(entry.role === 'user' ? 13 : 4)
              .borderRadius(16)
              .backgroundColor(entry.role === 'user' ? this.color('card') : Color.Transparent)
              .width(entry.role === 'user' ? (/[\[\]`*_#<>~]/.test(entry.text) || (entry.attachments?.length ?? 0) > 0 ? '88%' : undefined) : '100%')
              .constraintSize({ maxWidth: entry.role === 'user' ? '88%' : '100%' })
              .margin({ top: entry.role === 'user' ? 16 : 3, bottom: entry.role === 'user' ? 18 : 12 })
              .bindContextMenu(this.messageMenu(entry.text), ResponseType.LongPress)
              }.width('100%').justifyContent(FlexAlign.End)
            }
          }
        }, (entry: TimelineRow) => JSON.stringify(entry))
      }
      .layoutWeight(1)
      .width('100%')

      if (this.reconnecting) { Button('立即重连').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.connection?.start(); }) }
      if (this.threadStatus.length > 0 && !['ready', 'stopped', 'running', 'starting'].includes(this.threadStatus)) {
        Text(this.threadStatus).fontSize(this.font(12)).fontColor(this.color('danger-foreground'))
      }

      if (this.hasPendingSend) {
        Text('有一条消息待确认，正在保留原消息 ID 和附件').fontColor(this.color('danger-foreground')).fontSize(this.font(12))
        Button('核对并重试发送').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(this.loaded && !this.sending).onClick(() => { this.retryPending(); })
      }
      Column({ space: 0 }) {
      Column({ space: 4 }) {
      if (this.settingsError) { Text(this.settingsError).fontColor(this.color('danger-foreground')).fontSize(this.font(12)) }
      if (this.draftStatus.length > 0 && this.draftStatus !== '草稿已保存' && this.draftStatus !== '正在保存草稿…') { Text(this.draftStatus).fontSize(this.font(12)).fontColor(this.color('foreground-muted')) }
      if (this.imageUris.length > 0) {
        Scroll() {
          Row({ space: 8 }) {
            ForEach(this.imageUris, (uri: string) => {
              Column() {
                Image(`file://${uri}`).width(48).height(48).objectFit(ImageFit.Cover)
                Button('移除').fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).fontSize(this.font(11)).enabled(!this.hasPendingSend && !this.sending && !this.pickingImage).onClick(() => { this.removeImage(uri); })
              }
            })
          }
        }.scrollable(ScrollDirection.Horizontal).width('100%').align(Alignment.Start)
      }
      if (this.pathStatus) { Text(this.pathStatus).fontSize(this.font(12)).fontColor(this.color('foreground-muted')) }
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
      // Avoid the device default silently clipping pasted drafts at 1,000,000 characters.
      TextArea({ placeholder: '发送消息…', text: this.draft, controller: this.composerController }).fontSize(this.font(16)).fontColor(this.color('foreground')).backgroundColor(Color.Transparent).placeholderColor(this.color('placeholder'))
        .maxLength(2147483647)
        .width('100%').constraintSize({ minHeight: this.composerFocused ? 64 : 36, maxHeight: this.composerFocused ? 144 : 36 })
        .onFocus(() => { this.composerFocused = true; }).onBlur(() => { this.composerFocused = false; }).enterKeyType(EnterKeyType.NEW_LINE)
        .enabled(this.draftReady && this.journalReady && !this.hasPendingSend && !this.sending)
        .onChange((value: string) => { this.editDraft(value); })
        .onTextSelectionChange((start: number, end: number) => { this.updatePathSearch(start, end); })
        .onKeyPreIme((event: KeyEvent): boolean => {
          if ((event.keyCode !== KeyCode.KEYCODE_ENTER && event.keyCode !== KeyCode.KEYCODE_NUMPAD_ENTER) ||
            !event.getModifierKeyState?.(['ctrl']) || event.getModifierKeyState?.(['alt']) ||
            event.getModifierKeyState?.(['shift'])) return false;
          if (event.type === KeyType.Down) this.send();
          return true;
        })
      Row({ space: 2 }) {
      ComposerSettings({ compact: !this.composerFocused, models: this.models, selection: this.composerThread?.modelSelection ?? null,
        runtimeMode: this.composerThread?.runtimeMode ?? '', interactionMode: this.composerThread?.interactionMode ?? '',
        disabled: !this.loaded || this.settingsBusy || this.sending || this.hasPendingSend,
        onModel: (selection: ModelSelection) => { this.updateComposerSetting('model', '', selection); },
        onOptions: (selection: ModelSelection) => { this.updateComposerSetting('options', '', selection); },
        onMode: (kind: string, value: string) => { this.updateComposerSetting(kind, value); }
      }).layoutWeight(1)
        Button({ type: ButtonType.Normal }) { AppIcon({ name: 'attach', iconSize: 19, tint: this.color('foreground-muted') }) }.accessibilityText('添加图片').width(32).height(36).padding(0).borderRadius(10).fontSize(this.font(22)).fontColor(this.color('foreground-secondary')).backgroundColor(Color.Transparent).enabled(this.journalReady && !this.hasPendingSend && this.imagesReady && !this.sending && !this.pickingImage && this.imageUris.length < 8)
          .onClick(() => { this.pickImages(); })
        if (this.running) {
          Button(this.stopping ? '停止中…' : '停止').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(this.loaded && !this.stopping).onClick(() => { this.stop(); })
        } else {
          Button({ type: ButtonType.Circle }) { AppIcon({ name: this.sending ? 'more' : 'send', iconSize: 20, tint: this.color('primary-foreground') }) }.accessibilityText('发送').width(34).height(34).padding(0).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(this.journalReady && !this.hasPendingSend && this.loaded && this.draftReady && this.imagesReady && !this.pickingImage && !this.sending && (this.draft.trim().length > 0 || this.imageUris.length > 0)).onClick(() => {
            this.send();
          })
        }
      }
      .width('100%').alignItems(VerticalAlign.Bottom)
      }.padding({ left: 10, right: 10, top: 8, bottom: 6 }).width('100%').borderRadius(20).backgroundColor(this.color('card'))
        .border({ width: 1, color: this.color('border') })
      WorkspaceContext({ worktree: !!this.composerThread?.worktreePath, cwd: this.composerThread?.worktreePath ?? this.cwd, selectedBranch: this.composerThread?.branch ?? '',
        disabled: !this.loaded || !this.draftReady || this.settingsBusy || this.sending || this.hasPendingSend, branchDisabled: this.running,
        onMachine: (saved: SavedEnvironment) => { this.chooseMachine(saved); }, onBranch: (ref: WorkspaceRef) => { this.chooseBranch(ref); }
      })
      }.width('100%')

    }
    .padding({ left: 16, right: 16, top: 6, bottom: 4 })
    .width('100%')
    .height('100%')
    .backgroundColor(this.color('screen'))
  }
}
