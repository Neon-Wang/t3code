export const DEFAULT_TERMINAL_FONT_SIZE: number = 10.5;
export const MIN_TERMINAL_FONT_SIZE: number = 6;
export const MAX_TERMINAL_FONT_SIZE: number = 14;
export function normalizeTerminalFontSize(value: number): number {
  return Number.isFinite(value) ? Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, value)) : DEFAULT_TERMINAL_FONT_SIZE;
}
export interface TerminalMetrics { fontSize: number; width: number; height: number; baseline: number; }
export function terminalMetrics(value: number): TerminalMetrics {
  const fontSize = normalizeTerminalFontSize(value);
  return { fontSize, width: Math.ceil(fontSize * 8 / 13), height: Math.ceil(fontSize * 18 / 13),
    baseline: Math.ceil(fontSize * 14 / 13) };
}
