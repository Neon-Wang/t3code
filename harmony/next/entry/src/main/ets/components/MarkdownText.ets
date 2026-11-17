import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { markdownBlocks } from '../generated/core.js';
import { Glyph } from './Glyph';

interface MarkdownRun { text: string; bold: boolean; italic: boolean; strike: boolean; code: boolean; href: string; color?: string; }
interface MarkdownBlock { kind: string; level: number; depth: number; marker: string; language: string; runs: MarkdownRun[]; rows: MarkdownRun[][][]; }

/** Puts plain text on the system clipboard and confirms with a toast, like Android CopyTextButton. */
export function copyText(context: UIContext, text: string): void {
  pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text))
    .then(() => { context.getPromptAction().showToast({ message: '已复制', duration: 1200 }); })
    .catch(() => { context.getPromptAction().showToast({ message: '复制失败', duration: 1200 }); });
}

// Android heading sizes (EnrichedMarkdownText.tsx): 21, 19, 17, then 15.
function headingSize(level: number): number { return level <= 1 ? 21 : level === 2 ? 19 : level === 3 ? 17 : 15; }
function codeColor(color: string | undefined): ResourceColor {
  switch (color) {
    case 'keyword': return $r('app.color.code_keyword');
    case 'string': return $r('app.color.code_string');
    case 'number': return $r('app.color.code_number');
    case 'comment': return $r('app.color.code_comment');
    default: return $r('app.color.md_code_text');
  }
}
function languageLabel(language: string): string {
  const name = language.trim().toLowerCase();
  if (name === 'cpp' || name === 'c++') { return 'C++'; }
  if (name === 'cs' || name === 'csharp') { return 'C#'; }
  if (name === 'ts') { return 'TypeScript'; }
  if (name === 'js') { return 'JavaScript'; }
  return name ? name[0].toUpperCase() + name.slice(1) : '';
}

@ComponentV2
export struct MarkdownText {
  @Require @Param text: string;
  @Local error: string = '';
  @Computed
  get blocks(): MarkdownBlock[] { return JSON.parse(markdownBlocks(this.text)) as MarkdownBlock[]; }
  private async open(href: string): Promise<void> {
    if (!href) { return; }
    this.error = '';
    if (!/^https?:\/\//i.test(href)) { this.error = '此链接需要在网页端查看'; return; }
    try { await (this.getUIContext().getHostContext() as common.UIAbilityContext).openLink(href); }
    catch (error) { this.error = '无法打开链接'; }
  }
  build() {
    Column({ space: 8 }) {
      Repeat<MarkdownBlock>(this.blocks).each((item: RepeatItem<MarkdownBlock>) => {
        MarkdownBlockView({ block: this.blocks[item.index], openLink: (href: string) => { this.open(href); } })
      }).key((_block: MarkdownBlock, index: number) => `${index}`)
      if (this.error) { Text(this.error).fontSize(12).fontColor($r('app.color.danger_foreground')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}

@ComponentV2
struct MarkdownBlockView {
  @Require @Param block: MarkdownBlock;
  @Event openLink: (href: string) => void = () => {};
  @Builder
  runs(runs: MarkdownRun[], header: boolean, size: number) {
    Text() {
      ForEach(runs, (run: MarkdownRun) => {
        Span(run.text).fontWeight(run.bold || header || this.block.kind === 'heading' ? FontWeight.Bold : FontWeight.Normal)
          .fontStyle(run.italic ? FontStyle.Italic : FontStyle.Normal)
          .fontFamily(run.code ? 'monospace' : 'HarmonyOS Sans')
          .fontSize(run.code ? size * 0.9 : size)
          .fontColor(run.href ? $r('app.color.md_link') : run.code ? $r('app.color.foreground_secondary') : header ? $r('app.color.md_strong') : $r('app.color.md_body'))
          .decoration({ type: run.strike ? TextDecorationType.LineThrough : run.href ? TextDecorationType.Underline : TextDecorationType.None })
          .onClick(() => { if (run.href) { this.openLink(run.href); } })
      })
    }.fontSize(size).lineHeight(Math.round(size * (this.block.kind === 'heading' ? 1.35 : 1.44))).copyOption(CopyOptions.LocalDevice)
  }
  @Builder
  codeBlock() {
    Column() {
      Row() {
        Text(languageLabel(this.block.language)).fontSize(12).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.md_code_text')).opacity(0.6).layoutWeight(1)
        Row() { Glyph({ name: 'doc.on.doc', side: 14, tint: $r('app.color.md_code_text') }) }
          .width(32).height(32).justifyContent(FlexAlign.Center).opacity(0.6).accessibilityText('复制代码')
          .onClick(() => { copyText(this.getUIContext(), this.block.runs.map((run: MarkdownRun) => run.text).join('')); })
      }.width('100%').height(32).padding({ left: 12, right: 4 })
        .border({ width: { bottom: 0.5 }, color: $r('app.color.md_hr') })
      Scroll() {
        Text() {
          ForEach(this.block.runs, (run: MarkdownRun) => { Span(run.text).fontColor(codeColor(run.color)) })
        }.fontFamily('monospace').fontSize(14).lineHeight(20).copyOption(CopyOptions.LocalDevice).padding(12)
      }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%').align(Alignment.Start)
    }.width('100%').borderRadius(8).clip(true).backgroundColor($r('app.color.md_code_bg'))
      .border({ width: 0.5, color: $r('app.color.md_hr') }).margin({ top: 4, bottom: 4 })
  }
  // Android draws tables in the code frame with a tinted bold header row and no zebra striping.
  @Builder
  table() {
    Column() {
      ForEach(this.block.rows, (row: MarkdownRun[][], index: number) => {
        Row() {
          ForEach(row, (cell: MarkdownRun[]) => {
            Column() { this.runs(cell, index === 0, 14) }.layoutWeight(1).padding({ left: 10, right: 10, top: 7, bottom: 7 })
              .alignItems(HorizontalAlign.Start)
          })
        }.width('100%').alignItems(VerticalAlign.Top)
          .backgroundColor(index === 0 ? $r('app.color.md_code_bg') : Color.Transparent)
          .border({ width: { top: index === 0 ? 0 : 0.5 }, color: $r('app.color.md_hr') })
      })
    }.width('100%').borderRadius(8).clip(true).border({ width: 0.5, color: $r('app.color.md_hr') }).margin({ top: 4, bottom: 4 })
  }
  build() {
    Column() {
      if (this.block.kind === 'thematicBreak') { Divider().color($r('app.color.md_hr')).margin({ top: 8, bottom: 8 }) }
      else if (this.block.kind === 'code') { this.codeBlock() }
      else if (this.block.kind === 'table') { this.table() }
      else {
        Row({ space: 6 }) {
          if (this.block.marker === '│') {
            Divider().vertical(true).strokeWidth(2).color($r('app.color.md_blockquote_border')).height('100%')
          } else if (this.block.marker) {
            Text(this.block.marker).fontSize(16).lineHeight(23).fontColor($r('app.color.foreground_muted'))
              .constraintSize({ minWidth: 14 })
          }
          Column() { this.runs(this.block.runs, false, this.block.kind === 'heading' ? headingSize(this.block.level) : 16) }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        }.width('100%').alignItems(VerticalAlign.Top)
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
      .padding({ left: this.block.kind === 'code' || this.block.kind === 'table' ? 0 : Math.max(0, this.block.depth - 1) * 16 })
      .margin({ top: this.block.kind === 'heading' ? 6 : 0 })
  }
}
