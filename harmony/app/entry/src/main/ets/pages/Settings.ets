import { AppIcon } from './AppIcon';
import util from '@ohos.util';
import { EnvironmentSession } from '../connection/Environment';
import { AppearanceStore } from '../connection/AppearanceStore';
import { ThemeRuntime } from '../connection/ThemeRuntime';
import { ThemeSelection, THEME_IDS } from '../model/ThemeSelection';
import router from '@ohos.router';
import { TypographyRuntime } from '../connection/TypographyRuntime';
import { Typography, resolveTypography, MIN_BASE_FONT_SIZE, MAX_BASE_FONT_SIZE, MIN_CODE_FONT_SIZE, MAX_CODE_FONT_SIZE, scaledFontSize } from '../model/Typography';
import { MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE } from '../model/TerminalMetrics';

@Entry
@Component
struct SettingsPage {
  private font(size: number): number { return scaledFontSize(size, this.sizes.baseFontSize); }
  @StorageLink('themeKey') themeKey: string = 't3-code-light';
  @State selection: ThemeSelection = { light: 't3-code', dark: 't3-code', mode: 'system' };
  @StorageLink('textSizes') sizes: Typography = resolveTypography(16, null, null);
  @State groupingMode: string = 'repository';
  @State ready: boolean = false;
  @State saving: boolean = false;
  @State error: string = '';
  private active: boolean = false;

  aboutToAppear(): void { this.active = true; this.load(); }
  aboutToDisappear(): void { this.active = false; }
  private async load(): Promise<void> {
    this.ready = false;
    this.error = '';
    try {
      const grouping = await (await AppearanceStore.open(getContext(this))).projectGroupingMode();
      await TypographyRuntime.reload();
      const selection = await ThemeRuntime.reload();
      if (!this.active) return;
      this.groupingMode = grouping;
      this.selection = selection;
      this.ready = true;
    } catch (_) { if (this.active) this.error = '设置读取失败，请重试'; }
  }
  private async saveGrouping(mode: string): Promise<void> {
    if (this.saving || !this.ready) return;
    this.saving = true;
    this.error = '';
    try {
      await (await AppearanceStore.open(getContext(this))).saveProjectGroupingMode(mode);
      if (this.active) this.groupingMode = mode;
    } catch (_) { if (this.active) this.error = '项目分组保存失败，请重试'; }
    finally { if (this.active) this.saving = false; }
  }
  private async saveFont(kind: string, value: number | null): Promise<void> {
    if (this.saving || !this.ready) return;
    this.saving = true;
    this.error = '';
    try {
      if (kind === 'base') await TypographyRuntime.saveBase(value ?? 16);
      else if (kind === 'code') await TypographyRuntime.saveCode(value);
      else await TypographyRuntime.saveTerminal(value);
    } catch (_) { if (this.active) this.error = '字号保存失败，请重试'; }
    finally { if (this.active) this.saving = false; }
  }
  private async toggleWordBreak(): Promise<void> {
    if (this.saving || !this.ready) return;
    this.saving = true;
    this.error = '';
    try { await TypographyRuntime.saveWordBreak(!this.sizes.codeWordBreak); }
    catch (_) { if (this.active) this.error = '代码换行设置保存失败，请重试'; }
    finally { if (this.active) this.saving = false; }
  }
  private async saveTheme(mode: string, light: string, dark: string): Promise<void> {
    if (this.saving || !this.ready) return;
    this.saving = true;
    this.error = '';
    const selection: ThemeSelection = { mode, light, dark };
    try {
      await ThemeRuntime.save(selection);
      if (this.active) this.selection = selection;
    } catch (_) { if (this.active) this.error = '主题保存失败，请重试'; }
    finally { if (this.active) this.saving = false; }
  }
  private color(role: string): string { return ThemeRuntime.color(this.themeKey, role); }
  @Builder
  themePicker(dark: boolean) {
    Row({ space: 12 }) {
      Text(dark ? '深色主题' : '浅色主题').fontSize(this.font(16)).fontColor(this.color('foreground')).layoutWeight(1)
      Select([{ value: 'T3 Code' }, { value: 'T3 Chat' }, { value: 'Grove' },
        { value: 'Ocean' }, { value: 'Ember' }, { value: 'Iris' }]).height(38).font({ size: this.font(14) }).optionFont({ size: this.font(16) }).selectedOptionFont({ size: this.font(14) })
        .selected(THEME_IDS.indexOf(dark ? this.selection.dark : this.selection.light))
        .value(ThemeRuntime.palette(`${dark ? this.selection.dark : this.selection.light}-${dark ? 'dark' : 'light'}`).label)
        .fontColor(this.color('foreground')).backgroundColor(this.color('card'))
        .enabled(this.ready && !this.saving)
        .onSelect((index: number) => {
          this.saveTheme(this.selection.mode, dark ? this.selection.light : THEME_IDS[index],
            dark ? THEME_IDS[index] : this.selection.dark);
        })
    }.width('100%')
  }
  build() {
    Scroll() {
    Column({ space: 12 }) {
      Row({ space: 12 }) {
        Button({ type: ButtonType.Circle }) { AppIcon({ name: 'back', iconSize: 21, tint: this.color('foreground-secondary') }) }.accessibilityText('返回').width(36).height(36).padding(0).backgroundColor(Color.Transparent).onClick(() => { router.back(); })
        Text('设置').fontSize(this.font(16)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground')).layoutWeight(1)
      }.width('100%')
      Button('环境连接').fontSize(this.font(14))
        .fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).width('100%')
        .onClick(() => { router.back({ url: 'pages/Index', params: {
          homeRequest: util.generateRandomUUID(true), view: 'connections'
        } }); })
      Button('已归档任务').fontSize(this.font(14))
        .fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).width('100%')
        .enabled(EnvironmentSession.current !== null)
        .onClick(() => {
          const connection = EnvironmentSession.current;
          if (connection !== null) router.back({ url: 'pages/Index', params: {
            homeRequest: util.generateRandomUUID(true), view: 'archive', environmentId: connection.descriptor.environmentId
          } });
        })
      Text('项目分组').fontSize(this.font(13)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground-muted')).width('100%').margin({ top: 16 })
      Select([{ value: '按仓库分组' }, { value: '按仓库内路径分组' }, { value: '保持独立' }])
        .height(38).font({ size: this.font(14) }).optionFont({ size: this.font(16) }).selectedOptionFont({ size: this.font(14) })
        .selected(['repository', 'repository_path', 'separate'].indexOf(this.groupingMode))
        .value(this.groupingMode === 'separate' ? '保持独立' : this.groupingMode === 'repository_path' ? '按仓库内路径分组' : '按仓库分组')
        .fontColor(this.color('foreground')).backgroundColor(this.color('card')).width('100%')
        .enabled(this.ready && !this.saving)
        .onSelect((index: number) => { this.saveGrouping(['repository', 'repository_path', 'separate'][index]); })
      Text('相同仓库可合并筛选；按仓库内路径分组会保留子目录差异。设置仅保存在本机。')
        .fontSize(this.font(13)).fontColor(this.color('foreground-muted')).width('100%')
      Text('外观').fontSize(this.font(13)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground-muted')).width('100%').margin({ top: 16 })
      Row({ space: 8 }) {
        ForEach(['system', 'light', 'dark'], (mode: string) => {
          Button(mode === 'system' ? '跟随系统' : mode === 'light' ? '浅色' : '深色').fontSize(this.font(13)).height(34).layoutWeight(1).borderRadius(9)
            .fontColor(this.color(this.selection.mode === mode ? 'primary-foreground' : 'foreground'))
            .backgroundColor(this.color(this.selection.mode === mode ? 'primary' : 'card'))
            .enabled(this.ready && !this.saving)
            .onClick(() => { this.saveTheme(mode, this.selection.light, this.selection.dark); })
        })
      }.width('100%')
      this.themePicker(false)
      this.themePicker(true)
      Text(`正文字号：${this.sizes.baseFontSize}`).fontSize(this.font(13)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground-muted')).width('100%').margin({ top: 16 })
      Text('你好，T3 Code。正文、标题和控件随字号调整。')
        .fontSize(this.sizes.baseFontSize).fontColor(this.color('foreground')).width('100%')
      Row({ space: 8 }) {
        Button('正文减小').fontSize(this.font(13)).layoutWeight(1).padding({ left: 4, right: 4 }).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.baseFontSize > MIN_BASE_FONT_SIZE)
          .onClick(() => { this.saveFont('base', this.sizes.baseFontSize - 1); })
        Button('正文增大').fontSize(this.font(13)).layoutWeight(1).padding({ left: 4, right: 4 }).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.baseFontSize < MAX_BASE_FONT_SIZE)
          .onClick(() => { this.saveFont('base', this.sizes.baseFontSize + 1); })
        Button('默认 16').fontSize(this.font(13)).layoutWeight(1).padding({ left: 4, right: 4 }).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.baseFontSize !== 16)
          .onClick(() => { this.saveFont('base', 16); })
      }.width('100%')
      Text(`代码字号：${this.sizes.codeFontSize}${this.sizes.isCodeFontSizeCustom ? '（自定义）' : '（自动）'}`)
        .fontSize(this.font(13)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground-muted')).width('100%').margin({ top: 16 })
      Text('const message = "你好，T3";').fontFamily('monospace').fontSize(this.sizes.codeFontSize)
        .fontColor(this.color('foreground')).padding(12).width('100%').backgroundColor(this.color('card'))
      Row({ space: 8 }) {
        Button('代码减小').fontSize(this.font(13)).layoutWeight(1).padding({ left: 4, right: 4 }).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.codeFontSize > MIN_CODE_FONT_SIZE)
          .onClick(() => { this.saveFont('code', this.sizes.codeFontSize - 1); })
        Button('代码增大').fontSize(this.font(13)).layoutWeight(1).padding({ left: 4, right: 4 }).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.codeFontSize < MAX_CODE_FONT_SIZE)
          .onClick(() => { this.saveFont('code', this.sizes.codeFontSize + 1); })
        Button('自动代码').fontSize(this.font(13)).layoutWeight(1).padding({ left: 4, right: 4 }).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.isCodeFontSizeCustom)
          .onClick(() => { this.saveFont('code', null); })
      }.width('100%')
      Text('自动代码和终端字号跟随正文字号；手动调整后保持独立。')
        .fontSize(this.font(13)).fontColor(this.color('foreground-muted')).width('100%')
      Button(this.sizes.codeWordBreak ? '代码换行：开启' : '代码换行：关闭').fontSize(this.font(16))
        .fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9)
        .enabled(this.ready && !this.saving).onClick(() => { this.toggleWordBreak(); })
      Text('开启后文件源码按屏幕宽度换行；关闭后可横向滚动。')
        .fontSize(this.font(13)).fontColor(this.color('foreground-muted')).width('100%')
      Text('终端').fontSize(this.font(13)).fontWeight(FontWeight.Medium).fontColor(this.color('foreground-muted')).width('100%').margin({ top: 16 })
      Text(`字号：${this.sizes.terminalFontSize.toFixed(1)}${this.sizes.isTerminalFontSizeCustom ? '（自定义）' : '（自动）'}`)
        .fontSize(this.font(16)).fontColor(this.color('foreground')).width('100%')
      Text('echo 你好，T3 Code\n0123456789  ABC abc')
        .fontFamily('monospace').fontSize(this.sizes.terminalFontSize).fontColor(this.color('foreground'))
        .padding(16).width('100%').backgroundColor(this.color('card'))
      Row({ space: 12 }) {
        Button('减小').fontSize(this.font(16)).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.terminalFontSize > MIN_TERMINAL_FONT_SIZE)
          .onClick(() => { this.saveFont('terminal', this.sizes.terminalFontSize - 0.5); })
        Button('增大').fontSize(this.font(16)).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.terminalFontSize < MAX_TERMINAL_FONT_SIZE)
          .onClick(() => { this.saveFont('terminal', this.sizes.terminalFontSize + 0.5); })
        Button('自动字号').fontSize(this.font(16)).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).enabled(this.ready && !this.saving && this.sizes.isTerminalFontSizeCustom)
          .onClick(() => { this.saveFont('terminal', null); })
      }.width('100%')
      Text(this.saving ? '正在保存…' : '字号保存在本机，适用于所有终端。')
        .fontSize(this.font(13)).fontColor(this.color('foreground-muted')).width('100%')
      if (this.error) {
        Text(this.error).fontColor(this.color('danger-foreground'))
        if (!this.ready) { Button('重新读取').fontSize(this.font(16)).fontColor(this.color('foreground-secondary')).backgroundColor(this.color('card')).height(36).borderRadius(9).onClick(() => { this.load(); }) }
      }
    }.padding(16).width('100%')
    }.align(Alignment.TopStart).width('100%').height('100%').backgroundColor(this.color('screen'))
  }
}
