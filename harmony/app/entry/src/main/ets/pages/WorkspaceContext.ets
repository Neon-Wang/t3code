import { AppIcon } from './AppIcon';
import { EnvironmentSession } from '../connection/Environment';
import { SavedEnvironment, loadEnvironments } from '../connection/EnvironmentStore';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';

export interface WorkspaceRef { name: string; current: boolean; isRemote?: boolean; worktreePath: string | null; }
interface RefRequest { cwd: string; limit: number; cursor?: number; query?: string; }
interface RefResult { refs: WorkspaceRef[]; isRepo: boolean; nextCursor: number | null; }

@Component
export struct WorkspaceContext {
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @Prop @Watch('contextChanged') cwd: string = '';
  @Prop worktree: boolean = false;
  @Prop newWorktree: boolean = false;
  @Prop canChooseWorktree: boolean = false;
  onWorktreeMode: (value: boolean) => void = () => {};
  @Prop selectedBranch: string = '';
  @Prop disabled: boolean = false;
  @Prop branchDisabled: boolean = false;
  onMachine: (saved: SavedEnvironment) => void = () => {};
  onBranch: (ref: WorkspaceRef) => void = () => {};
  @State refs: WorkspaceRef[] = [];
  @State saved: SavedEnvironment[] = [];
  @State currentBranch: string = '';
  @State sheetOpen: boolean = false;
  @State machinePicker: boolean = false;
  @State loading: boolean = false;
  @State error: string = '';
  @State query: string = '';
  @State nextCursor: number | null = null;
  @State isRepo: boolean = true;
  private revision: number = 0;
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  aboutToAppear(): void { this.loadRefs(); }
  aboutToDisappear(): void { ++this.revision; }
  private contextChanged(): void { this.currentBranch = ''; this.query = ''; this.loadRefs(); }
  private async loadRefs(more: boolean = false): Promise<void> {
    const revision = ++this.revision;
    const connection = EnvironmentSession.current;
    if (connection === null || !this.cwd) return;
    this.loading = true; this.error = '';
    if (!more) { this.refs = []; this.nextCursor = null; }
    try {
      const input: RefRequest = { cwd: this.cwd, limit: 50 };
      if (this.query.trim()) input.query = this.query.trim();
      if (more && this.nextCursor !== null) input.cursor = this.nextCursor;
      const result = await connection.rpc.call<RefResult>('vcs.listRefs', input);
      if (revision !== this.revision || connection !== EnvironmentSession.current) return;
      this.refs = more ? this.refs.concat(result.refs) : result.refs;
      this.isRepo = result.isRepo; this.nextCursor = result.nextCursor;
      const current = result.refs.find((entry: WorkspaceRef) => entry.current);
      if (current !== undefined) this.currentBranch = current.name;
    } catch (error) {
      if (revision === this.revision) this.error = `分支读取失败：${error instanceof Error ? error.message : String(error)}`;
    } finally { if (revision === this.revision) this.loading = false; }
  }
  private async machines(): Promise<void> {
    this.machinePicker = true; this.error = ''; this.sheetOpen = true;
    try { this.saved = await loadEnvironments(); }
    catch (error) { this.error = error instanceof Error ? error.message : String(error); }
  }
  @Builder
  contextSheet() {
    Column({ space: 14 }) {
      if (this.machinePicker) {
        List({ space: 8 }) {
          ForEach(this.saved, (saved: SavedEnvironment) => {
            ListItem() {
              Row({ space: 12 }) {
                Column({ space: 4 }) {
                  Text(saved.label).fontSize(this.font(17)).fontColor(this.color('foreground')).width('100%')
                  Text(saved.ssh === undefined ? saved.httpBaseUrl : 'SSH 连接').fontSize(this.font(12)).fontColor(this.color('foreground-muted')).width('100%')
                }.layoutWeight(1)
                if (EnvironmentSession.current?.matchesSaved(saved)) { Text('✓').fontColor(this.color('primary')) }
              }.width('100%').padding(16).borderRadius(12).backgroundColor(this.color('card'))
                .enabled(!this.disabled).onClick(() => { this.sheetOpen = false; this.onMachine(saved); })
                .accessibilityText(`选择机器 ${saved.label}`)
            }
          }, (saved: SavedEnvironment) => saved.connectionId ?? saved.environmentId)
        }.layoutWeight(1).width('100%')
      } else {
        Text(this.cwd).fontSize(this.font(12)).fontColor(this.color('foreground-muted')).maxLines(2).width('100%')
        Search({ value: this.query, placeholder: '搜索分支，回车确认' }).textFont({ size: this.font(16) })
          .fontColor(this.color('foreground')).backgroundColor(this.color('input'))
          .onChange((value: string) => { this.query = value; }).onSubmit(() => { this.loadRefs(); })
        if (this.loading) { LoadingProgress().width(28).height(28) }
        if (!this.loading && this.refs.length === 0 && !this.error) {
          Text(this.isRepo ? '没有匹配的分支；新仓库需先有提交' : '当前目录不是 Git 仓库')
            .fontSize(this.font(14)).fontColor(this.color('foreground-muted'))
        }
        List({ space: 6 }) {
          ForEach(this.refs, (ref: WorkspaceRef) => {
            ListItem() {
              Row({ space: 10 }) {
                Column({ space: 4 }) {
                  Text(ref.name).fontSize(this.font(16)).fontColor(this.color('foreground')).width('100%')
                  if (ref.worktreePath) { Text(ref.worktreePath).fontSize(this.font(11)).fontColor(this.color('foreground-muted')).width('100%') }
                }.layoutWeight(1)
                if (ref.name === (this.selectedBranch || this.currentBranch)) { Text('✓').fontColor(this.color('primary')) }
              }.padding(14).width('100%').borderRadius(12).backgroundColor(this.color('card'))
                .enabled(!this.disabled && !this.branchDisabled && !this.loading).onClick(() => { this.onBranch(ref); this.sheetOpen = false; })
                .accessibilityText(`选择分支 ${ref.name}`)
            }
          }, (ref: WorkspaceRef) => ref.name)
          if (this.nextCursor !== null) {
            ListItem() { Button('加载更多分支').enabled(!this.loading).onClick(() => { this.loadRefs(true); }) }
          }
        }.layoutWeight(1).width('100%')
      }
      if (this.error) {
        Text(this.error).fontColor(this.color('danger-foreground')).fontSize(this.font(13))
        Button('重试').onClick(() => { if (this.machinePicker) this.machines(); else this.loadRefs(); })
      }
    }.width('100%').height('100%').padding({ left: 20, right: 20, top: 8, bottom: 28 })
  }
  build() {
    Row({ space: 4 }) {
      Button({ type: ButtonType.Normal }) {
        Row({ space: 5 }) {
          AppIcon({ name: 'machine', iconSize: 13, tint: this.color('foreground-muted') })
          Text(EnvironmentSession.current?.descriptor.label ?? '选择机器').fontSize(this.font(11)).fontColor(this.color('foreground-muted'))
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }.backgroundColor(Color.Transparent).height(32).borderRadius(8).padding({ left: 6, right: 6 }).constraintSize({ maxWidth: 100 })
        .enabled(!this.disabled).onClick(() => { this.machines(); }).accessibilityText('选择机器')
      Divider().vertical(true).height(12).color(this.color('border'))
      if (this.canChooseWorktree) {
        Button({ type: ButtonType.Normal }) {
          Row({ space: 4 }) {
            AppIcon({ name: 'folder', iconSize: 14, tint: this.color('foreground-muted') })
            Text(this.newWorktree ? '新工作树' : this.worktree ? '工作树' : '本地').fontSize(this.font(12)).fontColor(this.color('foreground-muted'))
            AppIcon({ name: 'down', iconSize: 10, tint: this.color('foreground-muted') })
          }
        }.height(32).padding({ left: 4, right: 4 }).backgroundColor(Color.Transparent).enabled(!this.disabled && this.isRepo)
          .accessibilityText('执行位置：本地或新工作树').bindMenu([
            { value: '本地目录', action: () => { this.onWorktreeMode(false); } },
            { value: '新建工作树', action: () => { this.onWorktreeMode(true); } }
          ])
      } else {
        AppIcon({ name: 'folder', iconSize: 14, tint: this.color('foreground-muted') })
        Text(this.worktree ? '工作树' : '本地').fontSize(this.font(12)).fontColor(this.color('foreground-muted'))
      }
      Blank().layoutWeight(1)
      Button({ type: ButtonType.Normal }) {
        Row({ space: 5 }) {
          AppIcon({ name: 'branch', iconSize: 13, tint: this.color('foreground-muted') })
          Text(this.selectedBranch || this.currentBranch || '当前目录').fontSize(this.font(11)).fontColor(this.color('foreground-muted'))
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).constraintSize({ maxWidth: 82 })
          AppIcon({ name: 'down', iconSize: 10, tint: this.color('foreground-muted') })
        }
      }.backgroundColor(Color.Transparent).height(32).borderRadius(8).padding({ left: 6, right: 6 })
        .enabled(!this.disabled && !this.branchDisabled).onClick(() => { this.machinePicker = false; this.sheetOpen = true; this.query = ''; this.loadRefs(); })
        .accessibilityText('选择分支')
    }.width('94%').padding({ left: 5, right: 5, top: 2, bottom: 2 })
      .backgroundColor(this.color('card')).borderRadius({ bottomLeft: 14, bottomRight: 14 })
      .border({ width: { left: 1, right: 1, bottom: 1 }, color: this.color('border') })
      .bindSheet($$this.sheetOpen, this.contextSheet(), { height: SheetSize.LARGE, title: { title: this.machinePicker ? '选择机器' : '选择分支' }, blurStyle: BlurStyle.COMPONENT_THICK, dragBar: true, showClose: true, backgroundColor: '#E6' + this.color('screen').slice(1) })
  }
}
