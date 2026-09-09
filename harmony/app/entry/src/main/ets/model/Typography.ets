import { DEFAULT_TERMINAL_FONT_SIZE, normalizeTerminalFontSize } from './TerminalMetrics';

export const DEFAULT_BASE_FONT_SIZE: number = 16;
export const MIN_BASE_FONT_SIZE: number = 11;
export const MAX_BASE_FONT_SIZE: number = 22;
export const DEFAULT_CODE_FONT_SIZE: number = 12;
export const MIN_CODE_FONT_SIZE: number = 8;
export const MAX_CODE_FONT_SIZE: number = 18;
export interface FontPreferences { baseFontSize: number; codeFontSize: number | null; terminalFontSize: number | null; codeWordBreak: boolean; }
export interface Typography {
  baseFontSize: number;
  codeWordBreak: boolean;
  codeFontSize: number;
  terminalFontSize: number;
  isCodeFontSizeCustom: boolean;
  isTerminalFontSizeCustom: boolean;
}
export interface CodeMetrics {
  fontSize: number; lineNumberFontSize: number; rowHeight: number;
  gutterWidth: number; codePadding: number; textVerticalInset: number;
}
export interface MarkdownMetrics {
  s: number; m: number; h1: number; h2: number; h3: number; h4: number; h5: number; h6: number;
  bodyLineHeight: number; codeBlockFontSize: number; codeBlockLineHeight: number;
}
export function normalizeBaseFontSize(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_BASE_FONT_SIZE, Math.max(MIN_BASE_FONT_SIZE, Math.round(value))) : DEFAULT_BASE_FONT_SIZE;
}
export function normalizeCodeFontSize(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, Math.round(value))) : DEFAULT_CODE_FONT_SIZE;
}
export function resolveTypography(base: number, code: number | null, terminal: number | null, codeWordBreak: boolean = false): Typography {
  const baseFontSize = normalizeBaseFontSize(base);
  const scale = baseFontSize / DEFAULT_BASE_FONT_SIZE;
  return {
    baseFontSize,
    codeWordBreak,
    codeFontSize: code === null ? normalizeCodeFontSize(Math.round(DEFAULT_CODE_FONT_SIZE * scale)) : normalizeCodeFontSize(code),
    terminalFontSize: terminal === null ? normalizeTerminalFontSize(Math.round(DEFAULT_TERMINAL_FONT_SIZE * scale * 2) / 2) : normalizeTerminalFontSize(terminal),
    isCodeFontSizeCustom: code !== null,
    isTerminalFontSizeCustom: terminal !== null
  };
}
export function scaledFontSize(size: number, base: number): number {
  return Math.max(8, Math.round(size * normalizeBaseFontSize(base) / DEFAULT_BASE_FONT_SIZE));
}
export function codeMetrics(size: number): CodeMetrics {
  const fontSize = normalizeCodeFontSize(size);
  const scale = fontSize / DEFAULT_CODE_FONT_SIZE;
  return { fontSize, lineNumberFontSize: Math.max(8, Math.round(11 * scale)),
    rowHeight: Math.max(14, Math.round(22 * scale)), gutterWidth: 46, codePadding: 7, textVerticalInset: 2 };
}
export function markdownMetrics(base: number): MarkdownMetrics {
  const m = normalizeBaseFontSize(base), scale = m / DEFAULT_BASE_FONT_SIZE;
  const codeBlockFontSize = Math.max(10, Math.round(13 * scale));
  return { s: Math.max(10, Math.round(14 * scale)), m,
    h1: Math.max(16, Math.round(21 * scale)), h2: Math.max(14, Math.round(19 * scale)),
    h3: Math.max(13, Math.round(17 * scale)), h4: Math.max(12, Math.round(15 * scale)),
    h5: Math.max(12, Math.round(15 * scale)), h6: Math.max(12, Math.round(15 * scale)),
    bodyLineHeight: Math.max(18, Math.round(23 * scale)), codeBlockFontSize, codeBlockLineHeight: codeBlockFontSize + 6 };
}
