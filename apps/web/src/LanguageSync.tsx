import { useEffect } from "react";
import { i18n } from "@t3tools/shared/i18n";
import { useClientSettings } from "./hooks/useSettings";

export function LanguageSync() {
  const language = useClientSettings((settings) => settings.language);
  useEffect(() => {
    i18n.setLocale(language);
    document.documentElement.lang = language;
  }, [language]);
  return null;
}
