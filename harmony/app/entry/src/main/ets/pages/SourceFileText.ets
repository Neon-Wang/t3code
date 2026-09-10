import drawingText from '@ohos.graphics.text';
import { FrameCallback } from '@ohos.arkui.UIContext';
import { SourceLineLabel, sourceText, sourceLineStarts, sourceUsesBasicGlyphs } from '../model/SourceLines';
import { SourceViewport, SourceVisualMetric, SourcePosition } from '../model/SourceViewport';

class SourceLayoutFrame extends FrameCallback {
  private callback: () => void;
  constructor(callback: () => void) { super(); this.callback = callback; }
  onIdle(): void { this.callback(); }
}

@Component
export struct SourceFileText {
  @Prop @Watch('layoutChanged') contents: string = '';
  @Prop @Watch('layoutChanged') fontSize: number = 12;
  @Prop @Watch('layoutChanged') wrap: boolean = false;
  @Prop @Watch('targetChanged') initialLine: number = 0;
  @Prop @Watch('draw') foreground: string = '#ffffff';
  @Prop @Watch('draw') muted: string = '#888888';
  @State text: string = '';
  @State basicGlyphs: boolean = false;
  private calibration: TextController = new TextController();
  private textHeight: number = 0;
  private controller: TextController = new TextController();
  private scroller: Scroller = new Scroller();
  private canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private starts: number[] = [0];
  private labels: SourceLineLabel[] = [];
  private active: boolean = false;
  private ready: boolean = false;
  private queued: boolean = false;
  private positioned: boolean = false;
  private viewport: SourceViewport | null = null;
  private sourcePosition: SourcePosition | null = null;
  private reading: boolean = false;
  private dirty: boolean = false;
  private layoutRevision: number = 0;

  aboutToAppear(): void { this.active = true; this.layoutChanged(); }
  aboutToDisappear(): void { this.active = false; ++this.layoutRevision; }

  private fontVp(): number { return this.getUIContext().px2vp(this.getUIContext().fp2px(this.fontSize)); }
  private gutterWidth(): number { return (String(this.starts.length).length + 2) * this.fontVp() * 0.65; }

  private layoutChanged(): void {
    this.text = sourceText(this.contents);
    this.starts = sourceLineStarts(this.text);
    this.basicGlyphs = sourceUsesBasicGlyphs(this.text);
    this.invalidateLayout();
  }

  private targetChanged(): void { this.positioned = false; this.sourcePosition = null; this.invalidateLayout(); }

  private invalidateLayout(): void {
    ++this.layoutRevision;
    this.viewport = null;
    this.sourcePosition = null;
    this.labels = [];
    this.scheduleLayout();
  }

  private scheduleLayout(): void {
    this.dirty = true;
    if (!this.active || !this.ready || this.queued || this.reading) return;
    this.queued = true;
    this.getUIContext().postFrameCallback(new SourceLayoutFrame(() => {
      this.queued = false;
      if (this.active) this.readViewport();
    }));
  }

  private async readViewport(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    this.dirty = false;
    const revision = this.layoutRevision;
    try {
      let viewport = this.viewport;
      if (viewport === null) {
        const layout = this.controller.getLayoutManager();
        let font: LineMetrics | null = null;
        if (this.basicGlyphs) {
          const small = this.calibration.getLayoutManager();
          if (!small.getLineCount() || !this.textHeight) return;
          font = small.getLineMetrics(0);
        }
        const count = font !== null ? this.starts.length : layout.getLineCount();
        if (!count) return;
        viewport = new SourceViewport(count, (index: number): SourceVisualMetric => {
          if (!this.active || revision !== this.layoutRevision) throw new Error('Source layout replaced');
          if (font !== null) {
            const start = this.starts[index];
            let baseline: number;
            if (index === count - 1 && this.text.endsWith('\n')) {
              baseline = this.textHeight - this.getUIContext().px2vp(font.descent);
            } else {
              const boxes = layout.getRectsForRange({ start: start, end: start + 1 },
                drawingText.RectWidthStyle.TIGHT, drawingText.RectHeightStyle.TIGHT);
              if (!boxes.length) throw new Error('Source range unavailable');
              baseline = this.getUIContext().px2vp(boxes[0].rect.top + font.ascent);
            }
            return { startIndex: start, baseline: baseline, bottom: this.textHeight };
          }
          const line = layout.getLineMetrics(index);
          return { startIndex: line.startIndex, baseline: this.getUIContext().px2vp(line.baseline),
            bottom: this.getUIContext().px2vp(line.baseline + line.descent) };
        }, (): Promise<void> => new Promise<void>((resolve) => {
          this.getUIContext().postFrameCallback(new SourceLayoutFrame(() => { resolve(); }));
        }));
        this.viewport = viewport;
      }
      const position = this.sourcePosition ?? await viewport.target(this.starts, this.initialLine, this.fontVp());
      if (!this.active || revision !== this.layoutRevision) return;
      this.sourcePosition = position;
      if (!this.positioned && position && this.canvas.height > 0) {
        this.positioned = true;
        this.scroller.scrollTo({ xOffset: 0, yOffset: Math.max(0, position.baseline - this.canvas.height * 0.3), animation: false });
      }
      const labels = await viewport.labels(this.starts, this.scroller.currentOffset().yOffset, this.canvas.height, this.fontVp());
      if (!this.active || revision !== this.layoutRevision) return;
      this.labels = labels;
      this.draw();
    } catch (_) {
      if (this.active && revision === this.layoutRevision) console.warn('Source line layout unavailable');
    } finally {
      this.reading = false;
      if (this.dirty) this.scheduleLayout();
    }
  }

  private draw(): void {
    if (!this.active || !this.ready) return;
    const ctx = this.canvas;
    ctx.clearRect(0, 0, ctx.width, ctx.height);
    ctx.font = `${this.fontVp()}vp monospace`;
    ctx.fillStyle = this.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    const offset = this.scroller.currentOffset().yOffset;
    const selection = this.sourcePosition?.range;
    if (selection) {
      ctx.fillStyle = this.foreground;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, selection.top - offset, ctx.width, selection.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.muted;
    }
    for (const line of this.labels) {
      ctx.fillText(String(line.number), this.gutterWidth() - this.fontVp() * 0.6, line.baseline - offset);
    }
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.basicGlyphs) {
        Text('0', { controller: this.calibration }).fontFamily('monospace').fontSize(this.fontSize)
          .width(50).height(1).opacity(0).hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
          .onAreaChange((oldArea: Area, newArea: Area) => {
            if (oldArea.width !== newArea.width || oldArea.height !== newArea.height) this.invalidateLayout();
          })
      }
      Canvas(this.canvas).width('100%').height('100%').hitTestBehavior(HitTestMode.None)
        .onReady(() => { this.ready = true; this.scheduleLayout(); })
        .onAreaChange((oldArea: Area, newArea: Area) => {
          if (oldArea.width !== newArea.width || oldArea.height !== newArea.height) this.invalidateLayout();
        })
      Scroll(this.scroller) {
        Row() {
          Blank().width(this.gutterWidth())
          if (this.wrap) {
            Text(this.text || '（空文件）', { controller: this.controller })
              .fontFamily('monospace').fontSize(this.fontSize).fontColor(this.foreground)
              .copyOption(CopyOptions.LocalDevice).layoutWeight(1)
              .onAreaChange((oldArea: Area, newArea: Area) => {
                this.textHeight = Number(newArea.height);
                if (oldArea.width !== newArea.width || oldArea.height !== newArea.height) this.invalidateLayout();
              })
          } else {
            Scroll() {
              Text(this.text || '（空文件）', { controller: this.controller })
                .fontFamily('monospace').fontSize(this.fontSize).fontColor(this.foreground)
                .copyOption(CopyOptions.LocalDevice).onAreaChange((oldArea: Area, newArea: Area) => {
                  this.textHeight = Number(newArea.height);
                  if (oldArea.width !== newArea.width || oldArea.height !== newArea.height) this.invalidateLayout();
                })
            }.scrollable(ScrollDirection.Horizontal).layoutWeight(1).align(Alignment.TopStart)
          }
        }.width('100%').alignItems(VerticalAlign.Top)
      }.width('100%').height('100%').align(Alignment.TopStart)
        .onDidScroll(() => { this.draw(); this.scheduleLayout(); })
    }.width('100%').height('100%').clip(true)
  }
}
