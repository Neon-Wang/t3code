/**
 * The Android Button tones (Button.android.tsx): a 48vp stadium with a 14vp medium label.
 * Primary is the one main action of a card or screen; secondary is tonal; text has no fill.
 */
@ComponentV2
export struct ActionButton {
  @Require @Param label: string;
  @Param tone: string = 'primary';
  @Param active: boolean = true;
  @Param fill: boolean = true;
  @Event tap: () => void = () => {};
  private fillColor(): ResourceColor {
    if (this.tone === 'text') { return Color.Transparent; }
    if (!this.active) { return $r('app.color.subtle_strong'); }
    if (this.tone === 'danger') { return $r('app.color.danger'); }
    if (this.tone === 'secondary') { return $r('app.color.secondary'); }
    return $r('app.color.primary');
  }
  private labelColor(): ResourceColor {
    if (!this.active) { return $r('app.color.foreground_muted'); }
    if (this.tone === 'danger') { return $r('app.color.danger_foreground'); }
    if (this.tone === 'secondary') { return $r('app.color.secondary_foreground'); }
    if (this.tone === 'text') { return $r('app.color.primary_text'); }
    return $r('app.color.primary_foreground');
  }
  build() {
    Row() {
      Text(this.label).fontSize(14).fontWeight(FontWeight.Medium).fontColor(this.labelColor()).maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width(this.fill ? '100%' : undefined).height(48).padding({ left: 20, right: 20 }).borderRadius(24)
    .justifyContent(this.tone === 'text' && !this.fill ? FlexAlign.Start : FlexAlign.Center)
    .backgroundColor(this.fillColor())
    .border({ width: this.tone === 'secondary' && this.active ? 1 : 0, color: $r('app.color.secondary_border') })
    .enabled(this.active).stateStyles({ pressed: { .opacity(0.7) } })
    .accessibilityText(this.label).onClick(() => { this.tap(); })
  }
}
