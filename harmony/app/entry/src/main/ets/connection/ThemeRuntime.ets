import window from '@ohos.window';
import common from '@ohos.app.ability.common';
import util from '@ohos.util';
import ConfigurationConstant from '@ohos.app.ability.ConfigurationConstant';
import { AppearanceStore } from './AppearanceStore';
import { ThemeSelection, normalizeThemeSelection, resolveThemeKey } from '../model/ThemeSelection';

export interface TerminalTheme {
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  cursorForeground: string;
  cursorBackground: string;
  palette: string[];
}
export interface ThemePalette {
  id: string;
  label: string;
  scheme: string;
  colors: Record<string, string>;
  terminal: TerminalTheme;
  diff: Record<string, string>;
}
export class ThemeRuntime {
  private static palettes: ThemePalette[] = [];
  private static context: common.UIAbilityContext;
  private static selection: ThemeSelection = { light: 't3-code', dark: 't3-code', mode: 'system' };
  private static dark: boolean = false;
  private static mainWindow: window.Window | null = null;
  private static windowUpdates: Promise<void> = Promise.resolve();

  static attachWindow(value: window.Window): Promise<void> {
    ThemeRuntime.mainWindow = value;
    return ThemeRuntime.syncWindow();
  }
  static detachWindow(): void { ThemeRuntime.mainWindow = null; }
  static syncWindow(): Promise<void> {
    ThemeRuntime.windowUpdates = ThemeRuntime.windowUpdates.then(async () => {
      const target = ThemeRuntime.mainWindow;
      if (target === null) return;
      try {
        const key = resolveThemeKey(ThemeRuntime.selection, ThemeRuntime.dark);
        const foreground = ThemeRuntime.palette(key).scheme === 'dark' ? '#FFFFFFFF' : '#FF191919';
        target.setWindowBackgroundColor(ThemeRuntime.color(key, 'screen'));
        const bars: window.SystemBarProperties = {
          statusBarColor: '#00000000', navigationBarColor: '#00000000',
          statusBarContentColor: foreground, navigationBarContentColor: foreground,
          enableStatusBarAnimation: false, enableNavigationBarAnimation: false
        };
        await target.setWindowSystemBarProperties(bars);
        AppStorage.SetOrCreate('windowError', '');
      } catch (error) { console.error('T3WindowTheme ' + JSON.stringify(error)); AppStorage.SetOrCreate('windowError', '系统栏主题更新失败，请切换主题重试'); }
    });
    return ThemeRuntime.windowUpdates;
  }

  static async initialize(context: common.UIAbilityContext): Promise<void> {
    ThemeRuntime.context = context;
    ThemeRuntime.palettes = JSON.parse(util.TextDecoder.create('utf-8').decodeToString(
      context.resourceManager.getRawFileContentSync('theme-palettes.json'))) as ThemePalette[];
    ThemeRuntime.dark = context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
    try {
      await ThemeRuntime.reload();
    } catch (_) {
      AppStorage.SetOrCreate('themeError', '主题读取失败，请在设置中重试');
      ThemeRuntime.apply();
    }
  }
  static async reload(): Promise<ThemeSelection> {
    ThemeRuntime.selection = await (await AppearanceStore.open(ThemeRuntime.context)).themeSelection();
    ThemeRuntime.apply();
    AppStorage.SetOrCreate('themeError', '');
    return ThemeRuntime.selection;
  }
  static async save(selection: ThemeSelection): Promise<void> {
    const value = normalizeThemeSelection(selection);
    await (await AppearanceStore.open(ThemeRuntime.context)).saveThemeSelection(value);
    ThemeRuntime.selection = value;
    ThemeRuntime.apply();
    AppStorage.SetOrCreate('themeError', '');
  }
  static configurationChanged(colorMode: number | undefined): void {
    if (colorMode === undefined || colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET) return;
    ThemeRuntime.dark = colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
    ThemeRuntime.publish();
  }
  static palette(key: string): ThemePalette {
    return ThemeRuntime.palettes.find((palette: ThemePalette) => `${palette.id}-${palette.scheme}` === key)
      ?? ThemeRuntime.palettes[0];
  }
  static color(key: string, role: string): string {
    return ThemeRuntime.palette(key).colors[`--color-${role}`];
  }
  private static apply(): void {
    const mode = ThemeRuntime.selection.mode;
    ThemeRuntime.context.getApplicationContext().setColorMode(mode === 'light'
      ? ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT : mode === 'dark'
        ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK : ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    ThemeRuntime.publish();
  }
  private static publish(): void {
    AppStorage.SetOrCreate('themeKey', resolveThemeKey(ThemeRuntime.selection, ThemeRuntime.dark));
    ThemeRuntime.syncWindow();
  }
}
