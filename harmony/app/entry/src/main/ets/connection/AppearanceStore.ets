import { FontPreferences, DEFAULT_BASE_FONT_SIZE, normalizeBaseFontSize, normalizeCodeFontSize } from '../model/Typography';
import preferences from '@ohos.data.preferences';
import common from '@ohos.app.ability.common';
import { normalizeTerminalFontSize } from '../model/TerminalMetrics';
import { ThemeSelection, normalizeThemeSelection, readThemeSelection } from '../model/ThemeSelection';

export class AppearanceStore {
  private static pending: Promise<void> = Promise.resolve();
  private store: preferences.Preferences;
  private constructor(store: preferences.Preferences) { this.store = store; }
  static async open(context: common.Context): Promise<AppearanceStore> {
    return new AppearanceStore(await preferences.getPreferences(context, { name: 't3-appearance' }));
  }
  terminalFontSize(): Promise<number | null> {
    return AppearanceStore.enqueue(async (): Promise<number | null> => {
      const value = await this.store.get('terminalFontSize', -1);
      return typeof value === 'number' && value !== -1 ? normalizeTerminalFontSize(value) : null;
    });
  }
  saveTerminalFontSize(value: number | null): Promise<void> {
    return this.saveValue('terminalFontSize', value === null ? null : normalizeTerminalFontSize(value));
  }
  fontPreferences(): Promise<FontPreferences> {
    return AppearanceStore.enqueue(async (): Promise<FontPreferences> => {
      const base = await this.store.get('baseFontSize', DEFAULT_BASE_FONT_SIZE);
      const code = await this.store.get('codeFontSize', -1);
      const terminal = await this.store.get('terminalFontSize', -1);
      const wordBreak = await this.store.get('codeWordBreak', false);
      return {
        codeWordBreak: wordBreak === true,
        baseFontSize: normalizeBaseFontSize(typeof base === 'number' ? base : DEFAULT_BASE_FONT_SIZE),
        codeFontSize: typeof code === 'number' && Number.isFinite(code) && code !== -1 ? normalizeCodeFontSize(code) : null,
        terminalFontSize: typeof terminal === 'number' && Number.isFinite(terminal) && terminal !== -1 ? normalizeTerminalFontSize(terminal) : null
      };
    });
  }
  saveBaseFontSize(value: number): Promise<void> {
    return this.saveValue('baseFontSize', normalizeBaseFontSize(value));
  }
  saveCodeFontSize(value: number | null): Promise<void> {
    return this.saveValue('codeFontSize', value === null ? null : normalizeCodeFontSize(value));
  }
  saveCodeWordBreak(value: boolean): Promise<void> {
    return this.saveValue('codeWordBreak', value);
  }
  themeSelection(): Promise<ThemeSelection> {
    return AppearanceStore.enqueue(async (): Promise<ThemeSelection> => {
      const value = await this.store.get('themeSelection', '');
      return readThemeSelection(typeof value === 'string' ? value : '');
    });
  }
  saveThemeSelection(value: ThemeSelection): Promise<void> {
    return this.saveValue('themeSelection', JSON.stringify(normalizeThemeSelection(value)));
  }
  projectGroupingMode(): Promise<string> {
    return AppearanceStore.enqueue(async (): Promise<string> => {
      const value = await this.store.get('projectGroupingMode', 'repository');
      return value === 'separate' || value === 'repository_path' ? value : 'repository';
    });
  }
  saveProjectGroupingMode(value: string): Promise<void> {
    return this.saveValue('projectGroupingMode', value === 'separate' || value === 'repository_path' ? value : 'repository');
  }
  private saveValue(key: string, value: preferences.ValueType | null): Promise<void> {
    return AppearanceStore.enqueue(async (): Promise<void> => {
      const previous = await this.store.get(key, -1);
      try {
        if (value === null) await this.store.delete(key);
        else await this.store.put(key, value);
        await this.store.flush();
      } catch (error) {
        // Preferences mutates its cache before flush has persisted the value.
        if (previous === -1) await this.store.delete(key);
        else await this.store.put(key, previous);
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    });
  }
  private static enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = AppearanceStore.pending.then(operation);
    AppearanceStore.pending = next.then(() => {}, () => {});
    return next;
  }
}
