import { scanBarcode, scanCore } from '@kit.ScanKit';
import { connect, removeEnvironment, setEnvironmentEnabled, translate } from '../generated/core.js';
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
      Text(translate('mobile.navigation.addEnvironment')).fontSize(22)
      TextInput({ text: this.pairingUrl, placeholder: translate('settings.connections.pairingLinkText') })
        .id('pairingUrl').onChange((value: string) => { this.pairingUrl = value; })
      Button(translate('mobile.connectionsNewRouteScreen.scanQRCode'))
        .enabled(!this.busy).onClick(() => { this.scan(); })
      Button(translate('action.connect')).id('connect')
        .enabled(!this.busy && this.pairingUrl.trim().length > 0).onClick(() => { this.pair(); })
      if (this.error.length > 0) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
    }.padding(24).width('100%')
  }
  build() {
    Column({ space: 16 }) {
      Text(translate('mobile.commandPalette.manageEnvironments')).fontSize(22).fontColor($r('app.color.foreground'))
      Button(translate('mobile.navigation.addEnvironment')).id('addEnvironment')
        .onClick(() => { this.error = ''; this.adding = true; })
      if (this.error.length > 0 && !this.adding) { Text(this.error).fontColor($r('app.color.danger_foreground')) }
      List({ space: 12 }) {
        Repeat<EnvironmentRow>(this.state.environments).each((item: RepeatItem<EnvironmentRow>) => {
          ListItem() {
            Column({ space: 8 }) {
              Row() {
                Text(item.item.label).fontSize(18).layoutWeight(1)
                Toggle({ type: ToggleType.Switch, isOn: item.item.enabled }).enabled(!this.busy)
                  .onChange((enabled: boolean) => { this.enable(item.item, enabled); })
              }
              Text(item.item.address).fontSize(12).fontColor($r('app.color.foreground_muted'))
              Text(item.item.status).fontSize(12)
              Button(translate('mobile.connectionEnvironmentRow.removeEnvironment'))
                .enabled(!this.busy).onClick(() => { this.remove(item.item); })
            }.alignItems(HorizontalAlign.Start).padding(16).width('100%')
              .backgroundColor($r('app.color.grouped_card')).borderRadius(12)
          }
        }).key((row: EnvironmentRow) => row.id).virtualScroll()
      }.layoutWeight(1)
    }.padding(16).width('100%').height('100%')
      .bindSheet($$this.adding, this.addSheet(), { height: SheetSize.MEDIUM, showClose: true, backgroundColor: $r('app.color.sheet_solid') })
  }
}
