import { enMessages, type MessageKey } from "./en.ts";
import { zhCNMessages } from "./zh-CN.ts";

export type { MessageKey } from "./en.ts";

export type Locale = "en" | "zh-CN";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh-CN"] as const;

/** Language shown when no locale is resolved (per project decision). */
export const DEFAULT_LOCALE: Locale = "zh-CN";

type Params = Record<string, string | number>;

type Listener = () => void;

/**
 * Lightweight, zero-dependency, framework-agnostic message catalog usable from
 * web, desktop (which renders web), and mobile. Missing keys fall through the
 * active catalog -> en -> the key itself, so lookups never throw.
 *
 * Renderer language behavior: docs/user/language.md
 */
export class I18n {
  private _locale: Locale;
  private readonly listeners = new Set<Listener>();

  constructor(options: { locale: Locale }) {
    this._locale = options.locale;
  }

  get locale(): Locale {
    return this._locale;
  }

  /** Switch language and notify subscribers (used by React via useI18n). */
  setLocale(locale: Locale): void {
    if (locale === this._locale) return;
    this._locale = locale;
    for (const listener of this.listeners) listener();
  }

  /** Subscribe to future locale changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Translate a key. Lookup order: active locale, then English fallback, then
   * the raw key. Supports `{name}` interpolation via params.
   */
  t = (key: MessageKey, params?: Params): string => {
    const active = this._locale === "zh-CN" ? zhCNMessages : {};
    let text = active[key] ?? enMessages[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  };
}

/** Default instance at the project default locale (zh-CN). */
export const i18n = new I18n({ locale: DEFAULT_LOCALE });

/** Build a catalog for a specific locale. */
export function createI18n(options: { locale?: Locale } = {}): I18n {
  return new I18n({ locale: options.locale ?? DEFAULT_LOCALE });
}

/** Translate UI metadata supplied by provider/shared definitions, without changing their IDs. */
const keyByEnglish = new Map<string, MessageKey | null>();
for (const [key, english] of Object.entries(enMessages)) {
  const typedKey = key as MessageKey;
  if (!keyByEnglish.has(english)) {
    keyByEnglish.set(english, typedKey);
  } else {
    const previous = keyByEnglish.get(english);
    if (
      previous !== null &&
      previous !== undefined &&
      (zhCNMessages[previous] ?? english) !== (zhCNMessages[typedKey] ?? english)
    ) {
      // English homonyms need their call site's semantic key. A context-free
      // metadata lookup must never choose whichever catalog entry came first.
      keyByEnglish.set(english, null);
    }
  }
}

export function translateUiText(value: string, locale: Locale): string {
  const key = keyByEnglish.get(value);
  if (locale === "en") return value;
  if (key !== undefined && key !== null) return zhCNMessages[key] ?? value;
  // Work-log group captions are trusted UI metadata, not agent/user prose.
  for (const [pattern, key] of UI_COUNT_CAPTIONS) {
    const match = pattern.exec(value);
    if (match) return (zhCNMessages[key] ?? enMessages[key]).replaceAll("{count}", match[1]!);
  }
  return value;
}

const UI_COUNT_CAPTIONS: ReadonlyArray<readonly [RegExp, MessageKey]> = [
  [/^Linked (\d+) pull requests?$/, "v2.shared.group0"],
  [/^Unlinked (\d+) pull requests?$/, "v2.shared.group1"],
  [/^Watching (\d+) pull requests?$/, "v2.shared.group2"],
  [/^Stopped watching (\d+) pull requests?$/, "v2.shared.group3"],
  [/^Read (\d+) files?$/, "v2.shared.group4"],
  [/^Changed (\d+) files?$/, "v2.shared.group5"],
  [/^Ran (\d+) commands?$/, "v2.shared.group6"],
  [/^Created (\d+) threads?$/, "v2.shared.group7"],
  [/^Used device controls (\d+) times?$/, "v2.shared.group8"],
  [/^Used browser (\d+) times?$/, "v2.shared.group9"],
  [/^Searched the web (\d+) times?$/, "v2.shared.group10"],
  [/^Searched code (\d+) times?$/, "v2.shared.group11"],
  [/^Used (\d+) tools?$/, "v2.shared.group12"],
  [/^Received (\d+) updates?$/, "v2.shared.group13"],
];
