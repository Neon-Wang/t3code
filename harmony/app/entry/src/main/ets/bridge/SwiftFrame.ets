/**
 * SwiftFrame —— 通用 display list 回放组件。
 *
 * Swift 绘制代码（上游 review-diff 等）在 shim 的记录型 CGContext 上产出
 * Codable display list（JSON 由 case 名做键：{"fill":…}/{"group":…}），本组件
 * 用 ArkUI Canvas 逐操作回放。这是全部 Swift 表面 UI 的唯一渲染器：上游
 * 绘制怎么改，这里就怎么显示，没有第二份 UI 逻辑。
 */

export interface T3Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface T3Color {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface T3Font {
  family: string | null;
  size: number;
  weight: string;
  monospaced: boolean;
}

export interface T3TextRun {
  text: string;
  font: T3Font;
  color: T3Color;
}

export interface T3TextOp {
  runs: T3TextRun[];
  rect: T3Rect;
  baselineY: number;
  alignment: string;
  lineBreakMode: string;
  maxLines: number;
}

export interface T3FillOp {
  rect: T3Rect;
  color: T3Color;
  cornerRadius: number;
}

export interface T3FillEllipseOp {
  rect: T3Rect;
  color: T3Color;
}

export interface T3StrokeEllipseOp {
  rect: T3Rect;
  color: T3Color;
  lineWidth: number;
}

export interface T3FillPathOp {
  path: PathVerb[];
  color: T3Color;
}

export interface T3StrokePathOp {
  path: PathVerb[];
  color: T3Color;
  lineWidth: number;
  cap: string;
  join: string;
}

export interface T3GradientOp {
  rect: T3Rect;
  colors: T3Color[];
  locations: number[];
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface T3GroupOp {
  clip: T3Rect;
  ops: T3DisplayOp[];
}

export interface T3DisplayOp {
  fill?: T3FillOp;
  fillEllipse?: T3FillEllipseOp;
  strokeEllipse?: T3StrokeEllipseOp;
  fillPath?: T3FillPathOp;
  strokePath?: T3StrokePathOp;
  text?: T3TextOp;
  linearGradient?: T3GradientOp;
  group?: T3GroupOp;
}

export interface T3DisplayList {
  ops: T3DisplayOp[];
}

export interface PathVerb {
  move?: number[];
  line?: number[];
  quad?: number[];
  curve?: number[];
  close?: boolean;
}

function colorCss(color: T3Color): string {
  const channel = (value: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(value * 255)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}${channel(color.alpha)}`;
}

function weightCss(font: T3Font): number {
  switch (font.weight) {
    case 'thin':
      return 100;
    case 'light':
      return 300;
    case 'medium':
      return 500;
    case 'semibold':
      return 600;
    case 'bold':
      return 700;
    case 'heavy':
      return 800;
    case 'black':
      return 900;
    default:
      return 400;
  }
}

function fontCss(font: T3Font): string {
  const family = font.monospaced ? 'monospace' : 'sans-serif';
  return `${weightCss(font)} ${font.size}vp ${family}`;
}

function replayPath(ctx: CanvasRenderingContext2D, verbs: PathVerb[]): void {
  ctx.beginPath();
  for (const verb of verbs) {
    if (verb.move !== undefined) {
      ctx.moveTo(verb.move[0], verb.move[1]);
    } else if (verb.line !== undefined) {
      ctx.lineTo(verb.line[0], verb.line[1]);
    } else if (verb.quad !== undefined) {
      ctx.quadraticCurveTo(verb.quad[0], verb.quad[1], verb.quad[2], verb.quad[3]);
    } else if (verb.curve !== undefined) {
      ctx.bezierCurveTo(verb.curve[0], verb.curve[1], verb.curve[2], verb.curve[3],
        verb.curve[4], verb.curve[5]);
    } else if (verb.close === true) {
      ctx.closePath();
    }
  }
}

function replayRoundedRect(ctx: CanvasRenderingContext2D, rect: T3Rect, radius: number): void {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.width - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - r);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height,
    rect.x + rect.width - r, rect.y + rect.height);
  ctx.lineTo(rect.x + r, rect.y + rect.height);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
}

function replayText(ctx: CanvasRenderingContext2D, op: T3TextOp): void {
  if (op.runs.length === 0) {
    return;
  }
  ctx.textBaseline = 'alphabetic';
  let x = op.rect.x;
  for (const run of op.runs) {
    ctx.font = fontCss(run.font);
    ctx.fillStyle = colorCss(run.color);
    ctx.fillText(run.text, x, op.baselineY);
    const metrics = ctx.measureText(run.text);
    x += metrics.width;
  }
}

function replayOp(ctx: CanvasRenderingContext2D, op: T3DisplayOp): void {
  if (op.fill !== undefined) {
    ctx.fillStyle = colorCss(op.fill.color);
    if (op.fill.cornerRadius > 0) {
      replayRoundedRect(ctx, op.fill.rect, op.fill.cornerRadius);
      ctx.fill();
    } else {
      ctx.fillRect(op.fill.rect.x, op.fill.rect.y, op.fill.rect.width, op.fill.rect.height);
    }
  } else if (op.fillEllipse !== undefined) {
    ctx.fillStyle = colorCss(op.fillEllipse.color);
    ctx.beginPath();
    ctx.ellipse(op.fillEllipse.rect.x + op.fillEllipse.rect.width / 2,
      op.fillEllipse.rect.y + op.fillEllipse.rect.height / 2,
      op.fillEllipse.rect.width / 2, op.fillEllipse.rect.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (op.strokeEllipse !== undefined) {
    ctx.strokeStyle = colorCss(op.strokeEllipse.color);
    ctx.lineWidth = op.strokeEllipse.lineWidth;
    ctx.beginPath();
    ctx.ellipse(op.strokeEllipse.rect.x + op.strokeEllipse.rect.width / 2,
      op.strokeEllipse.rect.y + op.strokeEllipse.rect.height / 2,
      op.strokeEllipse.rect.width / 2, op.strokeEllipse.rect.height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (op.fillPath !== undefined) {
    ctx.fillStyle = colorCss(op.fillPath.color);
    replayPath(ctx, op.fillPath.path);
    ctx.fill();
  } else if (op.strokePath !== undefined) {
    ctx.strokeStyle = colorCss(op.strokePath.color);
    ctx.lineWidth = op.strokePath.lineWidth;
    ctx.lineCap = op.strokePath.cap === 'round' ? 'round' :
      (op.strokePath.cap === 'square' ? 'square' : 'butt');
    ctx.lineJoin = op.strokePath.join === 'round' ? 'round' :
      (op.strokePath.join === 'bevel' ? 'bevel' : 'miter');
    replayPath(ctx, op.strokePath.path);
    ctx.stroke();
  } else if (op.text !== undefined) {
    replayText(ctx, op.text);
  } else if (op.linearGradient !== undefined) {
    const gradient = op.linearGradient;
    const linear = ctx.createLinearGradient(gradient.startX, gradient.startY,
      gradient.endX, gradient.endY);
    for (let index = 0; index < gradient.colors.length; index++) {
      const stop = gradient.locations.length > index ? gradient.locations[index] : 0;
      linear.addColorStop(stop, colorCss(gradient.colors[index]));
    }
    ctx.fillStyle = linear;
    ctx.fillRect(gradient.rect.x, gradient.rect.y, gradient.rect.width, gradient.rect.height);
  } else if (op.group !== undefined) {
    ctx.save();
    const clip = op.group.clip;
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
    for (const nested of op.group.ops) {
      replayOp(ctx, nested);
    }
    ctx.restore();
  }
}

@Component
export struct SwiftFrame {
  @Prop frameJson: string = '';
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  build() {
    Canvas(this.context)
      .onReady(() => this.replay())
  }

  replay(): void {
    let list: T3DisplayList | null = null;
    try {
      list = JSON.parse(this.frameJson) as T3DisplayList;
    } catch (_) {
      return;
    }
    const ctx = this.context;
    ctx.clearRect(0, 0, ctx.width, ctx.height);
    if (list === null || list.ops === undefined) {
      return;
    }
    for (const op of list.ops) {
      replayOp(ctx, op);
    }
  }
}
