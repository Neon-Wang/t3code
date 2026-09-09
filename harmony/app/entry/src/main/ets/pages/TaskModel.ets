import { modelOptionChoices, modelOptionValue, withModelOption } from '../model/ModelOptions';
import router from '@ohos.router';
import util from '@ohos.util';
import { EnvironmentSession, PreparedConnection } from '../connection/Environment';
import { EmptyPayload, RpcClient } from '../connection/Rpc';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ModelChoice, ModelSelection, ModelOptionDescriptor, ModelOptionChoice, ServerConfig, ShellItem, ShellState, WS, availableModels } from '../model/Models';

interface ModeCommand { type: string; commandId: string; threadId: string; createdAt: string; runtimeMode?: string; interactionMode?: string; }
interface ModelCommand { type: string; commandId: string; threadId: string; modelSelection: ModelSelection; }

@Entry
@Component
struct TaskModel {
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @State choices: ModelChoice[] = [];
  @State current: ModelSelection | null = null;
  @State runtimeMode: string = '';
  @State interactionMode: string = '';
  @State editingOptions: boolean = false;
  @State query: string = '';
  @State loading: boolean = false;
  @State loaded: boolean = false;
  @State busy: boolean = false;
  @State error: string = '';
  private threadId: string = '';
  private loadRevision: number = 0;
  private active: boolean = false;
  private rpc: RpcClient | null = null;
  private environment: PreparedConnection | null = null;

  aboutToAppear(): void {
    this.threadId = (router.getParams() as Record<string, string>)['threadId'] ?? '';
  }
  onPageShow(): void { this.active = true; this.load(); }
  onPageHide(): void { ++this.loadRevision; this.active = false; this.rpc?.close(); this.rpc = null; this.loaded = false; this.loading = false; }
  aboutToDisappear(): void { ++this.loadRevision; this.active = false; this.rpc?.close(); }
  onBackPress(): boolean {
    if (this.busy) return true;
    if (this.editingOptions) { this.editingOptions = false; return true; }
    return false;
  }

  private async load(): Promise<void> {
    if (this.loading || this.busy) return;
    const revision = ++this.loadRevision;
    this.loading = true;
    this.loaded = false;
    this.error = '';
    this.rpc?.close();
    this.rpc = null;
    const environment = EnvironmentSession.current;
    this.environment = environment;
    try {
      if (environment === null || !this.threadId) throw new Error('任务连接不可用，请返回重新打开');
      const rpc = await environment.openRpc();
      if (!this.active || revision !== this.loadRevision || environment !== EnvironmentSession.current) { rpc.close(); return; }
      this.rpc = rpc;
      const config = await rpc.call<ServerConfig>(WS.serverGetConfig, new EmptyPayload());
      if (!this.active || revision !== this.loadRevision) return;
      this.choices = availableModels(config.providers);
      const state = new ShellState();
      await rpc.callStream(WS.threadsList, new EmptyPayload(), (values: object[]) => {
        if (!this.active || revision !== this.loadRevision) return;
        for (const value of values) state.apply(value as ShellItem);
        const thread = state.threads.find((entry) => entry.id === this.threadId);
        this.current = thread?.modelSelection ?? null;
        this.runtimeMode = thread?.runtimeMode ?? '';
        this.interactionMode = thread?.interactionMode ?? '';
        this.loaded = thread !== undefined;
        this.loading = false;
      });
    } catch (error) {
      if (this.active && revision === this.loadRevision) {
        this.error = error instanceof Error ? error.message : String(error);
        this.loaded = false;
        this.loading = false;
      }
    }
  }

  private async selectModel(choice: ModelChoice): Promise<void> {
    if (!this.active || !this.loaded || this.busy || this.rpc === null || this.environment !== EnvironmentSession.current ||
      !this.choices.some((entry: ModelChoice) => entry.instanceId === choice.instanceId && entry.model === choice.model)) return;
    if (this.current?.instanceId === choice.instanceId && this.current?.model === choice.model) { router.back(); return; }
    this.busy = true;
    this.error = '';
    try {
      const command: ModelCommand = { type: 'thread.meta.update', commandId: util.generateRandomUUID(true), threadId: this.threadId,
        modelSelection: { instanceId: choice.instanceId, model: choice.model } };
      await this.rpc.call(WS.threadStartTurn, command);
      if (this.active && this.environment === EnvironmentSession.current) router.back();
    } catch (error) { if (this.active) this.error = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; }
  }

  private async setMode(kind: string, value: string): Promise<void> {
    if (!this.active || !this.loaded || this.busy || this.rpc === null || this.environment !== EnvironmentSession.current) return;
    if (kind === 'runtime') {
      if ((value !== 'full-access' && value !== 'approval-required' && value !== 'auto-accept-edits' && value !== 'auto') || value === this.runtimeMode) return;
    } else if (kind === 'interaction') {
      if ((value !== 'default' && value !== 'plan') || value === this.interactionMode) return;
    } else return;
    this.busy = true;
    this.error = '';
    try {
      const command: ModeCommand = { type: kind === 'runtime' ? 'thread.runtime-mode.set' : 'thread.interaction-mode.set',
        commandId: util.generateRandomUUID(true), threadId: this.threadId, createdAt: new Date().toISOString() };
      if (kind === 'runtime') command.runtimeMode = value;
      else command.interactionMode = value;
      await this.rpc.call(WS.threadStartTurn, command);
    } catch (error) { if (this.active) this.error = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; }
  }

  private descriptors(): ModelOptionDescriptor[] {
    return this.choices.find((choice: ModelChoice) => choice.instanceId === this.current?.instanceId &&
      choice.model === this.current?.model)?.optionDescriptors ?? [];
  }

  private optionValue(descriptor: ModelOptionDescriptor): string | boolean {
    return this.current === null ? '' : modelOptionValue(this.current, descriptor);
  }

  private async setOption(id: string, value: string | boolean | null): Promise<void> {
    if (!this.active || !this.loaded || this.busy || this.rpc === null || this.current === null ||
      this.environment !== EnvironmentSession.current) return;
    const descriptor = this.descriptors().find((entry: ModelOptionDescriptor) => entry.id === id);
    if (descriptor === undefined) return;
    const selection = withModelOption(this.current, descriptor, value);
    if (selection === null) return;
    this.busy = true;
    this.error = '';
    try {
      const command: ModelCommand = { type: 'thread.meta.update', commandId: util.generateRandomUUID(true),
        threadId: this.threadId, modelSelection: selection };
      await this.rpc.call(WS.threadStartTurn, command);
      // ACK can precede shell delivery. Re-read before allowing another full selection write.
      this.loaded = false;
      this.busy = false;
      if (this.active && this.environment === EnvironmentSession.current) this.load();
    } catch (error) {
      this.loaded = false;
      if (this.active) this.error = `选项保存未确认，请刷新后重试：${error instanceof Error ? error.message : String(error)}`;
    }
    finally { this.busy = false; }
  }

  private matches(): ModelChoice[] {
    const query = this.query.trim().toLowerCase();
    return this.choices.filter((choice: ModelChoice) => `${choice.label} ${choice.model}`.toLowerCase().includes(query));
  }

  build() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        Button('返回').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.busy).onClick(() => { if (this.editingOptions) this.editingOptions = false; else router.back(); })
        Text(this.editingOptions ? '模型高级选项' : '任务设置').fontSize(this.font(20)).fontColor(this.color('foreground')).layoutWeight(1)
        Button('刷新').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.loading && !this.busy).onClick(() => { this.load(); })
      }.width('100%')
      Text(this.current === null ? '正在读取当前模型…' : `当前：${this.current.instanceId} · ${this.current.model}`)
        .fontSize(this.font(13)).fontColor(this.color('foreground-muted')).width('100%')
      if (this.editingOptions) {
        if (this.loading) { Text('正在读取选项…').fontColor(this.color('foreground-muted')) }
        if (this.busy) { Text('正在保存设置…').fontColor(this.color('foreground-muted')) }
        if (this.error) { Text(this.error).fontColor(this.color('danger-foreground')) }
        Text('选择后立即保存；恢复默认只清除这一项的显式选择。')
          .fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
        if (this.loaded && this.descriptors().length === 0) { Text('此模型未提供高级选项').fontColor(this.color('foreground-muted')) }
        List({ space: 12 }) {
          ForEach(this.descriptors(), (descriptor: ModelOptionDescriptor) => {
            ListItem() {
              Column({ space: 8 }) {
                Text(`${descriptor.label} · 当前：${this.optionValue(descriptor)}`)
                  .fontSize(this.font(16)).fontColor(this.color('foreground')).width('100%')
                if (descriptor.description) { Text(descriptor.description).fontColor(this.color('foreground-muted')).fontSize(this.font(12)) }
                if (descriptor.type === 'select') {
                  ForEach(modelOptionChoices(descriptor), (choice: ModelOptionChoice) => {
                    Button(`${choice.label}${this.optionValue(descriptor) === choice.id ? '（当前）' : ''}`)
                      .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).width('100%')
                      .enabled(this.loaded && !this.busy).onClick(() => { this.setOption(descriptor.id, choice.id); })
                  }, (choice: ModelOptionChoice) => choice.id)
                } else if (descriptor.type === 'boolean') {
                  Row({ space: 8 }) {
                    Button('开启').fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card'))
                      .enabled(this.loaded && !this.busy).onClick(() => { this.setOption(descriptor.id, true); })
                    Button('关闭').fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card'))
                      .enabled(this.loaded && !this.busy).onClick(() => { this.setOption(descriptor.id, false); })
                  }
                }
                Button('恢复默认').fontSize(this.font(14)).fontColor(this.color('foreground-muted')).backgroundColor(this.color('card'))
                  .enabled(this.loaded && !this.busy).onClick(() => { this.setOption(descriptor.id, null); })
              }.width('100%')
            }
          }, (descriptor: ModelOptionDescriptor) => `${this.current?.instanceId}:${this.current?.model}:${JSON.stringify(descriptor)}`)
        }.layoutWeight(1).width('100%')
      } else {
      Text('运行权限').fontSize(this.font(15)).fontColor(this.color('foreground')).width('100%')
      Row({ space: 8 }) {
        Button(`需要审批${this.runtimeMode === 'approval-required' ? '（当前）' : ''}`)
          .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).layoutWeight(1)
          .enabled(this.loaded && !this.busy).onClick(() => { this.setMode('runtime', 'approval-required'); })
        Button(`自主执行${this.runtimeMode === 'full-access' ? '（当前）' : ''}`)
          .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).layoutWeight(1)
          .enabled(this.loaded && !this.busy).onClick(() => { this.setMode('runtime', 'full-access'); })
      }.width('100%')
      Row({ space: 8 }) {
        Button(`自动接受编辑${this.runtimeMode === 'auto-accept-edits' ? '（当前）' : ''}`)
          .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).layoutWeight(1)
          .enabled(this.loaded && !this.busy).onClick(() => { this.setMode('runtime', 'auto-accept-edits'); })
        Button(`自动判断${this.runtimeMode === 'auto' ? '（当前）' : ''}`)
          .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).layoutWeight(1)
          .enabled(this.loaded && !this.busy).onClick(() => { this.setMode('runtime', 'auto'); })
      }.width('100%')
      Text('自动接受编辑仍需批准其他操作；自动判断由支持的提供方决定，其他提供方仍需审批。自主执行不提示审批。')
        .fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
      Row({ space: 8 }) {
        Button(`执行${this.interactionMode === 'default' ? '（当前）' : ''}`)
          .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).layoutWeight(1)
          .enabled(this.loaded && !this.busy).onClick(() => { this.setMode('interaction', 'default'); })
        Button(`计划${this.interactionMode === 'plan' ? '（当前）' : ''}`)
          .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).layoutWeight(1)
          .enabled(this.loaded && !this.busy).onClick(() => { this.setMode('interaction', 'plan'); })
      }.width('100%')
      Text('选择后立即保存到当前任务，不会发送消息。').fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
      Button('高级选项').fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card'))
        .enabled(this.loaded && !this.busy).onClick(() => { this.editingOptions = true; })
      Search({ value: this.query, placeholder: '搜索模型或提供方' }).textFont({ size: this.font(16) })
        .fontColor(this.color('foreground')).backgroundColor(this.color('input')).onChange((query: string) => { this.query = query; })
      if (this.loading) { Text('正在读取模型…').fontColor(this.color('foreground-muted')) }
      if (this.busy) { Text('正在保存设置…').fontColor(this.color('foreground-muted')) }
      if (this.error) { Text(this.error).fontColor(this.color('danger-foreground')) }
      if (this.loaded && this.matches().length === 0) { Text('没有匹配的模型').fontColor(this.color('foreground-muted')) }
      List({ space: 8 }) {
        ForEach(this.matches(), (choice: ModelChoice) => {
          ListItem() {
            Button(`${choice.label}${this.current?.instanceId === choice.instanceId && this.current?.model === choice.model ? '（当前）' : ''}`)
              .fontSize(this.font(15)).fontColor(this.color('foreground')).backgroundColor(this.color('card')).width('100%')
              .enabled(this.loaded && !this.busy).onClick(() => { this.selectModel(choice); })
          }
        }, (choice: ModelChoice) => choice.instanceId + ':' + choice.model)
      }.layoutWeight(1).width('100%')
      }
    }.padding(16).width('100%').height('100%').backgroundColor(this.color('screen'))
  }
}
