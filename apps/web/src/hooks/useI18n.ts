import { useMemo, useSyncExternalStore } from "react";

import { createI18n, i18n } from "@t3tools/shared/i18n";

const subscribe = (listener: () => void) => i18n.subscribe(listener);
const getLocale = () => i18n.locale;

/**
 * Subscribe a component to locale changes so any `t()` call it makes re-renders
 * when the language switches. A locale-bound translator changes identity on
 * every switch so React Compiler and memoized labels invalidate their caches.
 */
export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return useMemo(() => ({ locale, t: createI18n({ locale }).t }), [locale]);
}
