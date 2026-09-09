import common from '@ohos.app.ability.common';
import { AppearanceStore } from './AppearanceStore';
import { Typography, DEFAULT_BASE_FONT_SIZE, resolveTypography } from '../model/Typography';

export class TypographyRuntime {
  private static context: common.Context;
  static async initialize(context: common.Context): Promise<void> {
    TypographyRuntime.context = context;
    try { await TypographyRuntime.reload(); }
    catch (_) {
      AppStorage.SetOrCreate('textSizes', resolveTypography(DEFAULT_BASE_FONT_SIZE, null, null));
      AppStorage.SetOrCreate('fontError', '字体设置读取失败，请在设置中重试');
    }
  }
  static async reload(): Promise<Typography> {
    const stored = await (await AppearanceStore.open(TypographyRuntime.context)).fontPreferences();
    const sizes = resolveTypography(stored.baseFontSize, stored.codeFontSize, stored.terminalFontSize, stored.codeWordBreak);
    AppStorage.SetOrCreate('textSizes', sizes);
    AppStorage.SetOrCreate('fontError', '');
    return sizes;
  }
  static async saveWordBreak(value: boolean): Promise<void> {
    await (await AppearanceStore.open(TypographyRuntime.context)).saveCodeWordBreak(value);
    await TypographyRuntime.reload();
  }
  static async saveBase(value: number): Promise<void> {
    await (await AppearanceStore.open(TypographyRuntime.context)).saveBaseFontSize(value);
    await TypographyRuntime.reload();
  }
  static async saveCode(value: number | null): Promise<void> {
    await (await AppearanceStore.open(TypographyRuntime.context)).saveCodeFontSize(value);
    await TypographyRuntime.reload();
  }
  static async saveTerminal(value: number | null): Promise<void> {
    await (await AppearanceStore.open(TypographyRuntime.context)).saveTerminalFontSize(value);
    await TypographyRuntime.reload();
  }
}
