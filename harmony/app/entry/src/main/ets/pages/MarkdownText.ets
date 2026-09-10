import { AppIcon } from './AppIcon';
import { Typography, resolveTypography, scaledFontSize, MarkdownMetrics, markdownMetrics } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import router from '@ohos.router';
import { markdownFileLink } from '../model/MarkdownLink';
import { parse } from 'libt3markdown.so';
import common from '@ohos.app.ability.common';
import pasteboard from '@ohos.pasteboard';
import promptAction from '@ohos.promptAction';
import { MarkdownBlock, MarkdownRun, MarkdownRow, MarkdownCell, markdownBlocks } from '../model/MarkdownBlocks';

@Component
export struct MarkdownText {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @Prop user: boolean = false;
  private color(role: string): string {
    let token = role;
    if (this.user) {
      if (role === 'md-body' || role === 'md-link' || role === 'foreground-secondary') token = 'user-bubble-foreground';
      if (role === 'foreground-muted') token = 'user-bubble-foreground-muted';
      if (role === 'md-code-text') token = 'md-user-fence-text';
      if (role === 'md-code-bg' || role === 'subtle-strong') token = 'md-user-fence-bg';
    }
    return ThemeRuntime.color(this.themeKey, token);
  }
  @Prop cwd: string = '';
  @Prop baseDir: string = '';
  @Prop @Watch('update') content: string = '';
  @State blocks: MarkdownBlock[] = [];
  @State failed: boolean = false;
  @State actionError: string = '';
  aboutToAppear(): void { this.update(); }
  private update(): void {
    try { this.blocks = markdownBlocks(parse(this.content)); this.failed = false; }
    catch (_) { this.failed = true; }
  }
  private openLink(href: string): void {
    const file = markdownFileLink(href, this.cwd, this.baseDir);
    if (file !== null) {
      router.pushUrl({ url: 'pages/Files', params: { cwd: this.cwd, path: file.path, line: String(file.line ?? 0) } });
      return;
    }
    if (!/^https?:\/\//i.test(href)) return;
    const context = getContext(this) as common.UIAbilityContext;
    context.startAbility({ action: 'ohos.want.action.viewData', uri: href })
      .catch(() => { this.actionError = '链接打开失败，可复制地址后重试'; });
  }
  private async copyCode(block: MarkdownBlock): Promise<void> {
    try {
      const text = block.runs.map((run: MarkdownRun) => run.text).join('');
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text));
      promptAction.showToast({ message: '代码已复制' });
    } catch (_) { this.actionError = '代码复制失败，请重试'; }
  }
  private markdown(): MarkdownMetrics { return markdownMetrics(this.sizes.baseFontSize); }
  private headingSize(level: number): number {
    const m = this.markdown();
    const headings: number[] = [m.h1, m.h2, m.h3, m.h4, m.h5, m.h6];
    return headings[Math.max(0, Math.min(5, level - 1))];
  }
  @Builder
  rich(runs: MarkdownRun[], size: number = 16, bold: boolean = false) {
    Text() {
      ForEach(runs, (run: MarkdownRun) => {
        Span(run.text).fontWeight(run.bold || bold ? FontWeight.Bold : FontWeight.Normal)
          .fontStyle(run.italic ? FontStyle.Italic : FontStyle.Normal)
          .fontFamily(run.code ? 'monospace' : 'sans-serif')
          .fontColor((/^https?:\/\//i.test(run.href) || markdownFileLink(run.href, this.cwd, this.baseDir) !== null) ? this.color('md-link') : this.color('md-body'))
          .decoration({ type: run.strike ? TextDecorationType.LineThrough : TextDecorationType.None })
          .onClick(() => { this.openLink(run.href); })
      })
    }.fontSize(size).lineHeight(Math.max(size + 4, this.markdown().bodyLineHeight)).copyOption(CopyOptions.LocalDevice).width('100%')
  }
  build() {
    Column({ space: 10 }) {
      if (this.failed) {
        Text(this.content).fontSize(this.markdown().m).fontColor(this.color('md-body')).width('100%').copyOption(CopyOptions.LocalDevice)
      } else {
        ForEach(this.blocks, (block: MarkdownBlock) => {
          if (block.kind === 'horizontal_rule') {
            Divider().color(this.color('border')).margin({ top: 8, bottom: 8 })
          } else if (block.kind === 'code_block') {
            Column({ space: 6 }) {
              Row() {
                Text(block.language || '代码').fontSize(this.font(12)).fontColor(this.color('foreground-muted')).layoutWeight(1)
                Button({ type: ButtonType.Normal }) { AppIcon({ name: 'copy', iconSize: 14, tint: this.color('foreground-muted') }) }.accessibilityText('复制代码').backgroundColor(Color.Transparent).width(32).height(28).padding(0).onClick(() => { this.copyCode(block); })
              }.width('100%')
              Scroll() {
                Text(block.runs.map((run: MarkdownRun) => run.text).join('')).fontFamily('monospace')
                  .fontSize(this.markdown().codeBlockFontSize).lineHeight(this.markdown().codeBlockLineHeight).fontColor(this.color('md-code-text')).copyOption(CopyOptions.LocalDevice)
              }.scrollable(ScrollDirection.Horizontal).align(Alignment.TopStart).width('100%')
            }.padding(10).width('100%').alignItems(HorizontalAlign.Start).backgroundColor(this.color('md-code-bg')).borderRadius(6)
          } else if (block.kind === 'table') {
            Scroll() {
              Column() {
                ForEach(block.rows, (row: MarkdownRow) => {
                  Flex({ direction: FlexDirection.Row, alignItems: ItemAlign.Stretch }) {
                    ForEach(row.cells, (cell: MarkdownCell) => {
                      Column() { this.rich(cell.runs, this.markdown().s, cell.header) }
                        .width(180).padding(8).border({ width: 0.5, color: this.color('border') })
                        .backgroundColor(cell.header ? this.color('subtle-strong') : this.color('md-code-bg'))
                    })
                  }.width(row.cells.length * 180)
                })
              }
            }.scrollable(ScrollDirection.Horizontal).width('100%')
          } else {
            Row({ space: 8 }) {
              if (block.marker) { Text(block.marker).fontSize(this.markdown().m).fontColor(this.color('foreground-secondary')).width(25) }
              Column() { this.rich(block.runs, block.kind === 'heading' ? this.headingSize(block.level) : this.markdown().m, block.kind === 'heading') }
                .layoutWeight(1)
            }.alignItems(VerticalAlign.Top).width('100%').padding({ left: Math.min(block.depth, 6) * 12 })
          }
        })
      }
      if (this.actionError) { Text(this.actionError).fontSize(this.font(12)).fontColor(this.color('danger-foreground')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
