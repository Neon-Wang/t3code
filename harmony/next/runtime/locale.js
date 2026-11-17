import i18nSystem from "@ohos.i18n";
import { Atom } from "effect/reactivity";
import { i18n } from "@t3tools/shared/i18n";

export function refreshLocale() {
  i18n.setLocale(i18nSystem.System.getSystemLanguage().startsWith("zh") ? "zh-CN" : "en");
}
refreshLocale();
export const translate = (key) => i18n.t(key);

export const localeAtom = Atom.make((get) => {
  const unsubscribe = i18n.subscribe(() => get.setSelf(i18n.locale));
  get.addFinalizer(unsubscribe);
  return i18n.locale;
});
