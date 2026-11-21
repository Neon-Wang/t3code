import { symbolPath } from '../generated/symbols';

/** An Android symbol (AppSymbol name) drawn from its Tabler path and tinted like SymbolView. */
@ComponentV2
export struct Glyph {
  @Require @Param name: string;
  @Param side: number = 16;
  @Param tint: ResourceColor = $r('app.color.foreground');
  build() {
    // Path commands are in px, so the viewport is too; strokes then scale with the glyph.
    if (symbolPath(this.name)[0] === 'filled') {
      Shape() { Path().commands(symbolPath(this.name)[1]) }
        .viewPort({ x: 0, y: 0, width: '24px', height: '24px' }).width(this.side).height(this.side)
        .fill(this.tint).stroke(Color.Transparent)
    } else {
      Shape() { Path().commands(symbolPath(this.name)[1]) }
        .viewPort({ x: 0, y: 0, width: '24px', height: '24px' }).width(this.side).height(this.side)
        .fill(Color.Transparent).stroke(this.tint).strokeWidth(`${symbolPath(this.name)[2]}px`)
        .strokeLineCap(LineCapStyle.Round).strokeLineJoin(LineJoinStyle.Round)
    }
  }
}
