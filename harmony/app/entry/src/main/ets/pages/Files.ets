import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import router from '@ohos.router';
import pasteboard from '@ohos.pasteboard';
import promptAction from '@ohos.promptAction';
import { MarkdownText } from './MarkdownText';
import { SourceFileText } from './SourceFileText';
import { EnvironmentSession } from '../connection/Environment';
import { RpcClient } from '../connection/Rpc';
import { FileEntry, directoryEntries, fileErrorText } from '../model/FileEntries';

interface EntriesRequest { cwd: string; }
interface EntriesResult { entries: FileEntry[]; truncated: boolean; }
interface ReadRequest { cwd: string; relativePath: string; }
interface ReadResult { relativePath: string; contents: string; byteLength: number; truncated: boolean; }

@Entry
@Component
struct FilesPage {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @State rows: FileEntry[] = [];
  @State directory: string = '';
  @State query: string = '';
  @State selectedPath: string = '';
  @State preview: boolean = true;
  @State initialLine: number = 0;
  @State file: ReadResult | null = null;
  @State truncated: boolean = false;
  @State loading: boolean = false;
  @State error: string = '';
  private entries: FileEntry[] = [];
  private cwd: string = '';
  private fromLink: boolean = false;
  private rpc: RpcClient | null = null;
  private active: boolean = false;
  private revision: number = 0;

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, string>;
    this.cwd = params['cwd'] ?? '';
    this.selectedPath = params['path'] ?? '';
    const line = Number(params['line']);
    this.initialLine = Number.isInteger(line) && line > 0 ? line : 0;
    if (this.initialLine > 0) this.preview = false;
    this.fromLink = this.selectedPath.length > 0;
    this.active = true;
    this.reload();
  }

  aboutToDisappear(): void {
    this.active = false;
    this.rpc?.close();
  }

  onBackPress(): boolean {
    if (this.fromLink) return false;
    if (!this.selectedPath && !this.directory) return false;
    this.back();
    return true;
  }

  private refreshRows(): void { this.rows = directoryEntries(this.entries, this.directory, this.query); }

  private async reload(): Promise<void> {
    if (this.loading) return;
    const revision = ++this.revision;
    this.loading = true;
    this.error = '';
    try {
      if (!this.cwd) throw new Error('任务缺少项目目录');
      if (this.rpc === null) {
        const environment = EnvironmentSession.current;
        if (environment === null) throw new Error('连接已关闭，请返回重新连接');
        const rpc = await environment.openRpc();
        if (!this.active) { rpc.close(); return; }
        this.rpc = rpc;
      }
      if (this.selectedPath) {
        const request: ReadRequest = { cwd: this.cwd, relativePath: this.selectedPath };
        const file = await this.rpc.call<ReadResult>('projects.readFile', request);
        if (this.active && revision === this.revision) this.file = file;
      } else {
        const request: EntriesRequest = { cwd: this.cwd };
        const result = await this.rpc.call<EntriesResult>('projects.listEntries', request);
        if (!this.active || revision !== this.revision) return;
        this.entries = result.entries;
        this.truncated = result.truncated;
        this.refreshRows();
      }
    } catch (error) {
      if (this.active && revision === this.revision) {
        this.error = fileErrorText(error instanceof Error ? error.message : String(error));
        this.rpc?.close();
        this.rpc = null;
      }
    } finally {
      if (revision === this.revision) this.loading = false;
    }
  }

  private open(entry: FileEntry): void {
    if (this.loading) return;
    this.error = '';
    if (entry.kind === 'directory') {
      this.directory = entry.path;
      this.query = '';
      this.refreshRows();
    } else {
      this.selectedPath = entry.path;
      this.initialLine = 0;
      this.preview = true;
      this.file = null;
      this.reload();
    }
  }

  private back(): void {
    if (this.fromLink) { router.back(); return; }
    ++this.revision;
    this.loading = false;
    this.error = '';
    if (this.selectedPath) {
      this.selectedPath = '';
      this.file = null;
    } else if (this.directory) {
      const slash = this.directory.lastIndexOf('/');
      this.directory = slash < 0 ? '' : this.directory.substring(0, slash);
      this.query = '';
      this.refreshRows();
    } else router.back();
  }

  private async copyText(text: string): Promise<void> {
    try {
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text));
      promptAction.showToast({ message: '已复制' });
    } catch (_) { promptAction.showToast({ message: '复制失败，请重试' }); }
  }

  build() {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Button('返回').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.back(); })
        Text('文件').fontColor(this.color('foreground')).fontSize(this.font(18)).layoutWeight(1)
        Button('刷新').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.loading).onClick(() => { this.reload(); })
      }.width('100%')
      Text(this.selectedPath || this.directory || '项目根目录').fontColor(this.color('foreground-secondary')).fontSize(this.font(14)).width('100%')
      if (this.loading) { Text('加载中…').fontColor(this.color('foreground-muted')) }
      if (this.error) { Text(this.error).fontColor(this.color('danger-foreground')).fontSize(this.font(13)) }
      if (this.selectedPath) {
        Row({ space: 8 }) {
          Button('复制路径').fontSize(this.font(14)).fontColor(this.color('foreground')).backgroundColor(this.color('card'))
            .onClick(() => { this.copyText(this.selectedPath); })
          Button(this.file?.truncated ? '复制已显示文本' : '复制文本').fontSize(this.font(14))
            .fontColor(this.color('foreground')).backgroundColor(this.color('card')).enabled(this.file !== null && !this.loading)
            .onClick(() => { if (this.file !== null) this.copyText(this.file.contents); })
        }.width('100%')
        if (this.file !== null) {
          Text(`${this.file.byteLength} 字节${this.file.truncated ? ' · 仅显示部分内容' : ''}`).fontColor(this.color('foreground-muted')).fontSize(this.font(12))
          if (/\.(md|markdown)$/i.test(this.selectedPath)) {
            Button(this.preview ? '查看源码' : '预览 Markdown').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.preview = !this.preview; })
          }
          if (this.preview && /\.(md|markdown)$/i.test(this.selectedPath) && this.file.contents) {
            Scroll() {
              MarkdownText({ content: this.file.contents, cwd: this.cwd,
                baseDir: this.selectedPath.includes('/') ? this.selectedPath.substring(0, this.selectedPath.lastIndexOf('/')) : '' })
            }.layoutWeight(1).width('100%').align(Alignment.TopStart)
          } else {
            SourceFileText({ contents: this.file.contents, fontSize: this.sizes.codeFontSize,
              initialLine: this.initialLine, wrap: this.sizes.codeWordBreak,
              foreground: this.color('foreground'), muted: this.color('foreground-muted') })
              .layoutWeight(1).width('100%')
          }
        }
      } else {
        Search({ value: this.query, placeholder: '搜索项目文件' }).textFont({ size: this.font(16) }).fontColor(this.color('foreground')).backgroundColor(this.color('input')).placeholderColor(this.color('placeholder')).onChange((value: string) => {
          this.query = value; this.refreshRows();
        })
        if (this.truncated) { Text('文件列表不完整，部分文件未返回').fontColor(this.color('danger-foreground')).fontSize(this.font(12)) }
        if (!this.loading && this.rows.length === 0 && !this.error) { Text('没有匹配的文件').fontColor(this.color('foreground-muted')) }
        List({ space: 6 }) {
          ForEach(this.rows, (entry: FileEntry) => {
            ListItem() {
              Row({ space: 10 }) {
                Text(entry.kind === 'directory' ? '目录' : '文件').fontSize(this.font(12)).fontColor(this.color('foreground-muted'))
                Text(this.query ? entry.path : entry.path.substring(this.directory ? this.directory.length + 1 : 0))
                  .fontSize(this.font(15)).fontColor(this.color('foreground')).layoutWeight(1)
              }.padding(14).width('100%').backgroundColor(this.color('card')).borderRadius(10)
                .onClick(() => { this.open(entry); })
            }
          }, (entry: FileEntry) => entry.path + ':' + entry.kind)
        }.layoutWeight(1).width('100%')
      }
    }.padding(16).width('100%').height('100%').backgroundColor(this.color('screen'))
  }
}
