const ICON_PATHS: Record<string, string> = {
    'chevron': 'M9 5l7 7-7 7',
    'down': 'M6 9l6 6 6-6',
    'terminal': 'M4 6l5 6-5 6m9 0h7',
    'folder': 'M3 7V5h6l2 2h10v13H3Z',
    'robot': 'M8 4h4v4M4 8h16v12H4Zm-2 4v4m20-4v4M9 12v3m6-3v3',
    'unlock': 'M5 10h14v11H5Zm3 0V6a4 4 0 0 1 7.5-2',
    'lock': 'M5 10h14v11H5Zm3 0V6a4 4 0 0 1 8 0v4',
    'machine': 'M3 4h18v13H3Zm5 17h8m-4-4v4',
    'plus': 'M12 5v14M5 12h14',
    'copy': 'M8 8h12v13H8ZM16 8V3H3v13h5',
    'back': 'M15 5l-7 7 7 7',
    'send': 'M12 19V5m-6 6 6-6 6 6',
    'more': 'M5 12h.01M12 12h.01M19 12h.01',
    'attach': 'M8 13l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',
    'branch': 'M6 7v10m12-10v3a4 4 0 0 1-4 4H6m0-11a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4M18 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4'
  };

@Component
export struct AppIcon {
  @Prop name: string = 'chevron';
  @Prop iconSize: number = 18;
  @Prop tint: string = '#888888';
  build() {
    Shape() {
      Path().commands(ICON_PATHS[this.name])
    }.viewPort({ x: 0, y: 0, width: '24px', height: '24px' }).width(this.iconSize).height(this.iconSize)
      .fill(Color.Transparent).stroke(this.tint).strokeWidth('1.6px').strokeLineCap(LineCapStyle.Round).strokeLineJoin(LineJoinStyle.Round)
  }
}
