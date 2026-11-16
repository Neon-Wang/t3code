import { scanBarcode, scanCore } from '@kit.ScanKit';
import { connect, removeEnvironment, setEnvironmentEnabled, translate } from '../generated/core.js';
import { Glyph } from './Glyph';
import { ClientState, EnvironmentRow } from '../model/ClientState';

@ComponentV2
export struct Environments {
  @Require @Param state: ClientState;
  @Local pairingUrl: string = '';
  @Local error: string = '';
  @Local busy: boolean = false;
  @Local adding: boolean = false;

  private async pair(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      await connect(this.pairingUrl, this.getUIContext().getHostContext()!);
      this.pairingUrl = '';
      this.adding = false;
    } catch (error) {
      this.error = translate('mobile.connectionTone.connectionFailed');
    } finally { this.busy = false; }
  }
  private async scan(): Promise<void> {
    try {
      const result = await scanBarcode.startScanForResult(this.getUIContext().getHostContext()!, { scanTypes: [scanCore.ScanType.QR_CODE], enableAlbum: true });
      this.pairingUrl = result.originalValue;
    } catch (error) {
      this.error = translate('mobile.connectionsNewRouteScreen.scannedQRCodeWasNotRecognized');
    }
  }
  private async enable(row: EnvironmentRow, enabled: boolean): Promise<void> {
    this.busy = true;
    this.error = '';
    try { await setEnvironmentEnabled(row.id, enabled); }
    catch (error) { this.error = translate('mobile.connectionTone.connectionFailed'); }
    finally { this.busy = false; }
  }
  private remove(row: EnvironmentRow): void {
    this.getUIContext().showAlertDialog({
      title: translate('mobile.connectionEnvironmentRow.removeEnvironment'),
      message: row.label,
      primaryButton: { value: translate('mobile.useThreadListActions.cancel'), action: () => {} },
      secondaryButton: {
        value: translate('mobile.useThreadListActions.delete'),
        action: () => {
          this.busy = true;
          removeEnvironment(row.id).catch(() => {
            this.error = translate('mobile.connectionTone.connectionFailed');
          }).finally(() => { this.busy = false; });
        }
      }
    });
  }
  @Builder
  addSheet() {
    Column({ space: 16 }) {
      Text(translate('mobile.navigation.addEnvironment')).fontSize(21).fontWeight(FontWeight.Medium).fontColor($r('app.color.foreground'))
      TextInput({ text: this.pairingUrl, placeholder: translate('settings.connections.pairingLinkText') })
        .id('pairingUrl').onChange((value: string) => { this.pairingUrl = value; })
      Button(translate('mobile.connectionsNewRouteScreen.scanQRCode')).width('100%')
        .backgroundColor($r('app.color.secondary')).fontColor($r('app.color.secondary_foreground'))
        .enabled(!this.busy).onClick(() => { this.scan(); })
      Button(translate('action.connect')).id('connect').width('100%')
        .enabled(!this.busy && this.pairingUrl.trim().length > 0).onClick(() => { this.pair(); })
      if (this.error.length > 0) { Text(this.error).fontSize(14).fontColor($r('app.color.danger_foreground')) }
    }.padding(24).width('100%').alignItems(HorizontalAlign.Start)
  }
  // Mirrors the Android environment rows: status dot, machine glyph, address, status and toggle.
  @Builder
  environmentRow(row: EnvironmentRow, separated: boolean) {
    Column({ space: 4 }) {
      Row({ space: 8 }) {
        Circle().width(8).height(8)
          .fill(row.shellStatus === 'live' ? $r('app.color.status_done') : $r('app.color.foreground_tertiary'))
        Glyph({ name: 'desktopcomputer', side: 14, tint: $r('app.color.foreground_muted') })
        Text(row.label).fontSize(16).fontWeight(FontWeight.Bold).maxLines(1).layoutWeight(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis }).fontColor($r('app.color.foreground'))
        Toggle({ type: ToggleType.Switch, isOn: row.enabled }).enabled(!this.busy)
          .selectedColor($r('app.color.switch_active_track'))
          .onChange((enabled: boolean) => { this.enable(row, enabled); })
      }.width('100%')
      Text(row.address).fontSize(14).fontColor($r('app.color.foreground_muted')).padding({ left: 16 })
      Text(row.status).fontSize(14).maxLines(3).fontColor($r('app.color.foreground_muted')).padding({ left: 16 })
      Text(translate('mobile.connectionEnvironmentRow.removeEnvironment')).fontSize(14)
        .fontColor($r('app.color.danger_foreground')).padding({ left: 16, top: 6, bottom: 2 })
        .enabled(!this.busy).onClick(() => { this.remove(row); })
    }.width('100%').alignItems(HorizontalAlign.Start).padding({ left: 16, right: 16, top: 14, bottom: 14 })
      .border(separated ? { width: { top: 1 }, color: $r('app.color.border_subtle') } : { width: 0 })
  }
  build() {
    Column() {
      Row() {
        Text(translate('mobile.workspaceRootScreen.settings')).fontSize(21).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.header_foreground')).layoutWeight(1)
        Row() { Glyph({ name: 'plus', side: 24, tint: $r('app.color.foreground') }) }
          .id('addEnvironment').width(48).height(48).justifyContent(FlexAlign.Center)
          .accessibilityText(translate('mobile.navigation.addEnvironment'))
          .onClick(() => { this.error = ''; this.adding = true; })
      }.width('100%').height(64).padding({ left: 20, right: 8 })
      Scroll() {
        Column({ space: 8 }) {
          Text(translate('mobile.usageRouteScreen.environments')).fontSize(14).fontColor($r('app.color.foreground_muted'))
            .padding({ left: 16 })
          if (this.error.length > 0 && !this.adding) {
            Text(this.error).fontSize(14).fontColor($r('app.color.danger_foreground')).padding({ left: 16 })
          }
          Column() {
            ForEach(this.state.environments, (row: EnvironmentRow, index: number) => { this.environmentRow(row, index > 0) },
              (row: EnvironmentRow) => `${row.id}:${row.enabled}:${row.status}`)
            Row({ space: 12 }) {
              Glyph({ name: 'plus', side: 20, tint: $r('app.color.primary_text') })
              Text(translate('mobile.navigation.addEnvironment')).fontSize(16).fontColor($r('app.color.primary_text'))
            }.width('100%').height(52).padding({ left: 16, right: 16 })
              .border(this.state.environments.length > 0 ? { width: { top: 1 }, color: $r('app.color.border_subtle') } : { width: 0 })
              .onClick(() => { this.error = ''; this.adding = true; })
          }.width('100%').backgroundColor($r('app.color.grouped_card')).borderRadius(24).clip(true)
        }.padding({ left: 20, right: 20, top: 16, bottom: 36 }).width('100%').alignItems(HorizontalAlign.Start)
      }.layoutWeight(1).width('100%').align(Alignment.Top).scrollBar(BarState.Off)
        .backgroundColor($r('app.color.screen')).borderRadius({ topLeft: 28, topRight: 28 }).clip(true)
    }.width('100%').height('100%')
      .bindSheet($$this.adding, this.addSheet(), { height: SheetSize.MEDIUM, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}
