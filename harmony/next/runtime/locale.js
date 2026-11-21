import i18nSystem from "@ohos.i18n";
import { Atom } from "effect/reactivity";
import { decodeOptions, gtFallback } from "gt-i18n";
import { hashMessage } from "gt-i18n/internal";
import en from "../../../apps/mobile/src/i18n/translations/en.json";
import zh from "../../../apps/mobile/src/i18n/translations/zh.json";
import { mobileKeys, harmonyChinese } from "./catalog.js";

const listeners = new Set();
const systemLocale = () => (i18nSystem.System.getSystemLanguage().startsWith("zh") ? "zh" : "en");
let locale = systemLocale();
export function refreshLocale() {
  const next = systemLocale();
  if (locale === next) return;
  locale = next;
  for (const listener of listeners) listener(locale);
}
export const localeAtom = Atom.make((get) => {
  const update = (value) => get.setSelf(value);
  listeners.add(update);
  get.addFinalizer(() => listeners.delete(update));
  return locale;
});
export function translate(key, variables) {
  const id = mobileKeys[key];
  const text = id
    ? locale === "zh"
      ? zh[id]
      : en[id]
    : locale === "zh"
      ? harmonyChinese[key]
      : key;
  return variables ? gtFallback(text, { ...variables, $locale: locale }) : text;
}

// Pure mobile helpers call this resolver with GT's marked ICU messages.
export function m(message, variables = {}) {
  const options = decodeOptions(message) ?? variables;
  const source = options.$_source ?? message;
  const key = options.$_hash ?? hashMessage(source, { ...options, $format: "ICU" });
  return gtFallback((locale === "zh" ? zh[key] : en[key]) ?? source, {
    ...options,
    $locale: locale,
    $_fallback: source,
  });
}
export const keepMarked = (message) => message;
