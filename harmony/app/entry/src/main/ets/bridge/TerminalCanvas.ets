import { TerminalFrame } from 'libt3terminal.so';
import { DEFAULT_TERMINAL_FONT_SIZE, terminalMetrics } from '../model/TerminalMetrics';

function color(rgb: number): string { return `#${rgb.toString(16).padStart(6, '0')}`; }

@Component
export struct TerminalCanvas {
  @Prop @Watch('draw') fontSize: number = DEFAULT_TERMINAL_FONT_SIZE;
  @Prop @Watch('draw') frame: TerminalFrame = { cols: 1, rows: 1, cursorX: 0, cursorY: 0,
    cursorVisible: 0, cursorColor: 0xe2e8f0, background: 0x0f172a, cells: [] };
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private available: boolean = false;

  private draw(): void {
    if (!this.available) return;
    const ctx = this.context;
    const metrics = terminalMetrics(this.fontSize);
    ctx.fillStyle = color(this.frame.background);
    ctx.fillRect(0, 0, ctx.width, ctx.height);
    // Backgrounds first: a wide glyph may span the following cell.
    for (const cell of this.frame.cells) {
      ctx.fillStyle = color((cell.flags & 32) !== 0 ? this.frame.cursorColor : cell.background);
      ctx.fillRect(cell.x * metrics.width, cell.y * metrics.height, metrics.width, metrics.height);
    }
    for (const cell of this.frame.cells) {
      if (!cell.text) continue;
      ctx.fillStyle = color((cell.flags & 32) !== 0 ? this.frame.background : cell.foreground);
      ctx.globalAlpha = (cell.flags & 16) !== 0 ? 0.6 : 1;
      ctx.font = `${(cell.flags & 2) !== 0 ? 'italic ' : ''}${(cell.flags & 1) !== 0 ? 'bold ' : ''}${metrics.fontSize}vp monospace`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(cell.text, cell.x * metrics.width, cell.y * metrics.height + metrics.baseline);
      if ((cell.flags & 4) !== 0) ctx.fillRect(cell.x * metrics.width, cell.y * metrics.height + metrics.height - 2, metrics.width, 1);
      if ((cell.flags & 8) !== 0) ctx.fillRect(cell.x * metrics.width, cell.y * metrics.height + metrics.height / 2, metrics.width, 1);
    }
    ctx.globalAlpha = 1;
    if (this.frame.cursorVisible) {
      ctx.strokeStyle = color(this.frame.cursorColor);
      ctx.lineWidth = 1;
      ctx.strokeRect(this.frame.cursorX * metrics.width + 0.5, this.frame.cursorY * metrics.height + 0.5, metrics.width - 1, metrics.height - 1);
    }
  }

  build() {
    Canvas(this.context).width('100%').height('100%')
      .onReady(() => { this.available = true; this.draw(); })
      .onAreaChange(() => { this.draw(); })
  }
}
