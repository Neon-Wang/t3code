import { AppIcon } from './AppIcon';
import { EnvironmentSession } from '../connection/Environment';
import { ThemeRuntime } from '../connection/ThemeRuntime';

interface ProjectResource { _tag: string; cwd: string; path?: string; }
interface ProjectAssetRequest { resource: ProjectResource; }
interface ProjectAsset { relativeUrl: string; expiresAt: number; }
const projectAssets: Map<string, Promise<ProjectAsset>> = new Map();

@Component
export struct ProjectIcon {
  @Prop @Watch('reload') cwd: string = '';
  @Prop @Watch('reload') faviconPath: string = '';
  @Prop iconSize: number = 16;
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @State source: string = '';
  private revision: number = 0;
  aboutToAppear(): void { this.reload(); }
  aboutToDisappear(): void { ++this.revision; }
  private async reload(): Promise<void> {
    const revision = ++this.revision;
    this.source = '';
    const connection = EnvironmentSession.current;
    if (connection === null || !this.cwd) return;
    const key = JSON.stringify([connection.httpBaseUrl, this.cwd, this.faviconPath]);
    const resource: ProjectResource = { _tag: 'project-favicon', cwd: this.cwd };
    if (this.faviconPath) resource.path = this.faviconPath;
    const request: ProjectAssetRequest = { resource: resource };
    try {
      let pending = projectAssets.get(key);
      if (pending === undefined) {
        pending = connection.rpc.call<ProjectAsset>('assets.createUrl', request);
        projectAssets.set(key, pending);
      }
      let asset = await pending;
      if (asset.expiresAt <= Date.now() + 5000) {
        pending = connection.rpc.call<ProjectAsset>('assets.createUrl', request);
        projectAssets.set(key, pending);
        asset = await pending;
      }
      if (revision !== this.revision || connection !== EnvironmentSession.current) return;
      if (!asset.relativeUrl.startsWith('/') || asset.relativeUrl.startsWith('//') || asset.relativeUrl.includes('project-favicon-missing')) return;
      this.source = connection.httpBaseUrl.replace(/\/$/, '') + asset.relativeUrl;
    } catch (_) { projectAssets.delete(key); }
  }
  build() {
    Stack() {
      if (this.source) {
        Image(this.source).width(this.iconSize).height(this.iconSize).objectFit(ImageFit.Contain).borderRadius(3)
          .onError(() => { this.source = ''; })
      } else {
        AppIcon({ name: 'folder', iconSize: this.iconSize, tint: ThemeRuntime.color(this.themeKey, 'foreground-muted') })
      }
    }.width(this.iconSize).height(this.iconSize)
  }
}
