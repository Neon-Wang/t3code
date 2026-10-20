import { useI18n } from "./useI18n";
import { syncNativeLanguage } from "./nativeLabels";
import { useAtomValue } from "@effect/atom-react";
import { DEFAULT_LOCALE, i18n } from "@t3tools/shared/i18n";
import { AsyncResult } from "effect/reactivity";
import { useLayoutEffect, type ReactNode } from "react";
import { mobilePreferencesAtom } from "../state/preferences";

/** Resolve saved language before mounting screens, preserving their navigation state on changes. */
export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const { locale: activeLocale } = useI18n();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const ready = AsyncResult.isSuccess(preferences) || AsyncResult.isFailure(preferences);
  const locale = AsyncResult.isSuccess(preferences)
    ? (preferences.value.locale ?? DEFAULT_LOCALE)
    : DEFAULT_LOCALE;
  useLayoutEffect(() => {
    if (ready) {
      i18n.setLocale(locale);
      void syncNativeLanguage()?.catch(() => undefined);
    }
  }, [locale, ready]);
  return ready && activeLocale === locale ? children : null;
}
