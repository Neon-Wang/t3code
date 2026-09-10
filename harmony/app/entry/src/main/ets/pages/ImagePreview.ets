import { Typography, resolveTypography, scaledFontSize } from '../model/Typography';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import router from '@ohos.router';
import { EnvironmentSession } from '../connection/Environment';
import { RpcClient } from '../connection/Rpc';
interface AttachmentResource { _tag: string; attachmentId: string; fileName: string; mimeType: string; }
interface AssetRequest { resource: AttachmentResource; }
interface AssetUrl { relativeUrl: string; expiresAt: number; }

@Entry
@Component
struct ImagePreviewPage {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @State name: string = '';
  @State source: string = '';
  @State error: string = '';
  @State loading: boolean = false;
  @State zoom: number = 1;
  private startZoom: number = 1;
  private rpc: RpcClient | null = null;
  private active: boolean = false;
  aboutToAppear(): void { this.active = true; this.reload(); }
  aboutToDisappear(): void { this.active = false; this.rpc?.close(); }
  private async reload(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.source = '';
    this.error = '';
    this.zoom = 1;
    this.rpc?.close();
    try {
      const params = router.getParams() as Record<string, string>;
      this.name = params['name'] ?? '图片';
      const environment = EnvironmentSession.current;
      if (environment === null) throw new Error('连接已关闭，请重新连接');
      const rpc = await environment.openRpc();
      if (!this.active) { rpc.close(); return; }
      this.rpc = rpc;
      const resource: AttachmentResource = { _tag: 'attachment', attachmentId: params['attachmentId'],
        fileName: this.name, mimeType: params['mimeType'] ?? 'image/jpeg' };
      const request: AssetRequest = { resource: resource };
      const result = await rpc.call<AssetUrl>('assets.createUrl', request);
      if (!result.relativeUrl.startsWith('/') || result.relativeUrl.startsWith('//')) throw new Error('图片地址无效');
      if (this.active) this.source = environment.httpBaseUrl.replace(/\/$/, '') + result.relativeUrl;
    } catch (error) {
      if (this.active) this.error = error instanceof Error ? error.message : String(error);
    } finally { if (this.active) this.loading = false; }
  }
  build() {
    Column({ space: 12 }) {
      Row({ space: 8 }) {
        Button('返回').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { router.back(); })
        Text(this.name).fontColor(this.color('foreground')).fontSize(this.font(16)).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).layoutWeight(1)
        Button('重新加载').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).enabled(!this.loading).onClick(() => { this.reload(); })
      }.width('100%')
      if (this.loading) { Text('正在获取图片…').fontColor(this.color('foreground-muted')) }
      if (this.error) { Text(this.error).fontColor(this.color('danger-foreground')) }
      if (this.source) {
        Image(this.source).objectFit(ImageFit.Contain).width('100%').layoutWeight(1)
          .scale({ x: this.zoom, y: this.zoom })
          .gesture(PinchGesture().onActionStart(() => { this.startZoom = this.zoom; })
            .onActionUpdate((event: GestureEvent) => { this.zoom = Math.max(1, Math.min(4, this.startZoom * event.scale)); }))
          .onError(() => { this.error = '图片加载失败，请点击重新加载获取新地址'; })
          .onComplete(() => { this.error = ''; })
        Button('恢复大小').fontSize(this.font(16)).fontColor(this.color('primary-foreground')).backgroundColor(this.color('primary')).onClick(() => { this.zoom = 1; })
      }
    }.padding(16).width('100%').height('100%').backgroundColor(this.color('screen')).clip(true)
  }
}
