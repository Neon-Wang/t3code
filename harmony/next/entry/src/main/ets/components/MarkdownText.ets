import { common } from '@kit.AbilityKit';
import { markdownBlocks } from '../generated/core.js';

interface MarkdownRun { text: string; bold: boolean; italic: boolean; strike: boolean; code: boolean; href: string; }
interface MarkdownBlock { kind: string; level: number; depth: number; marker: string; language: string; runs: MarkdownRun[]; }

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
    Column({ space: 10 }) {
      ForEach(this.blocks, (block: MarkdownBlock, index: number) => {
        MarkdownBlockView({ block, openLink: (href: string) => { this.open(href); } })
      }, (_block: MarkdownBlock, index: number) => `${index}`)
      if (this.error) { Text(this.error).fontSize(12).fontColor($r('app.color.danger_foreground')) }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}

@ComponentV2
struct MarkdownBlockView {
  @Require @Param block: MarkdownBlock;
  @Event openLink: (href: string) => void = () => {};
  build() {
    Column({ space: 4 }) {
      if (this.block.kind === 'thematicBreak') { Divider().color($r('app.color.border')) }
      else {
        if (this.block.kind === 'code' && this.block.language) {
          Text(this.block.language).fontSize(12).fontColor($r('app.color.foreground_muted'))
        }
        Text() {
          if (this.block.marker) { Span(`${this.block.marker} `) }
          ForEach(this.block.runs, (run: MarkdownRun) => {
            Span(run.text).fontWeight(run.bold || this.block.kind === 'heading' ? FontWeight.Bold : FontWeight.Normal)
              .fontStyle(run.italic ? FontStyle.Italic : FontStyle.Normal)
              .fontFamily(run.code || this.block.kind === 'code' ? 'monospace' : 'HarmonyOS Sans')
              .fontColor(run.href ? $r('app.color.primary_text') : $r('app.color.foreground'))
              .decoration({ type: run.strike ? TextDecorationType.LineThrough : run.href ? TextDecorationType.Underline : TextDecorationType.None })
              .onClick(() => { if (run.href) { this.openLink(run.href); } })
          })
        }.fontSize(this.block.kind === 'heading' ? Math.max(17, 28 - this.block.level * 2) : this.block.kind === 'code' ? 13 : 16)
          .copyOption(CopyOptions.LocalDevice).width('100%')
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
      .padding({ left: this.block.kind === 'code' ? 12 : this.block.depth * 12, right: this.block.kind === 'code' ? 12 : 0, top: this.block.kind === 'code' ? 12 : 0, bottom: this.block.kind === 'code' ? 12 : 0 })
      .backgroundColor(this.block.kind === 'code' ? $r('app.color.grouped_card') : Color.Transparent).borderRadius(8)
  }
}
