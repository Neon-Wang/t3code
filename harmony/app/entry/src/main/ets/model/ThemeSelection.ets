export interface ThemeSelection { light: string; dark: string; mode: string; }
export const THEME_IDS: string[] = ['t3-code', 't3-chat', 'grove', 'ocean', 'ember', 'iris'];
export function normalizeThemeSelection(value: ThemeSelection): ThemeSelection {
  return {
    light: THEME_IDS.includes(value.light) ? value.light : 't3-code',
    dark: THEME_IDS.includes(value.dark) ? value.dark : 't3-code',
    mode: value.mode === 'light' || value.mode === 'dark' ? value.mode : 'system'
  };
}
export function readThemeSelection(value: string): ThemeSelection {
  try {
    const parsed = JSON.parse(value) as ThemeSelection | null;
    if (parsed !== null) return normalizeThemeSelection(parsed);
  } catch (_) {}
  return { light: 't3-code', dark: 't3-code', mode: 'system' };
}
export function resolveThemeKey(selection: ThemeSelection, systemDark: boolean): string {
  const normalized = normalizeThemeSelection(selection);
  const dark = normalized.mode === 'dark' || (normalized.mode === 'system' && systemDark);
  return `${dark ? normalized.dark : normalized.light}-${dark ? 'dark' : 'light'}`;
}
