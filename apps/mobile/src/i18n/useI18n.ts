import { useMemo, useSyncExternalStore } from "react";
import { createI18n, i18n } from "@t3tools/shared/i18n";

const subscribe = (listener: () => void) => i18n.subscribe(listener);
const getLocale = () => i18n.locale;

/** Locale-bound identity invalidates memoized UI labels without translating user content. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return useMemo(() => ({ locale, t: createI18n({ locale }).t }), [locale]);
}
