import { useAtomSet } from "@effect/atom-react";
import { i18n, type Locale } from "@t3tools/shared/i18n";
import { SettingsRow } from "../features/settings/components/SettingsRow";
import { SettingsSection } from "../features/settings/components/SettingsSection";
import { updateMobilePreferencesAtom } from "../state/preferences";
import { useI18n } from "./useI18n";

export function LanguageSection() {
  const { locale, t } = useI18n();
  const save = useAtomSet(updateMobilePreferencesAtom);
  function select(next: Locale) {
    i18n.setLocale(next);
    save({ locale: next });
  }
  return (
    <SettingsSection title={t("settings.label.language")}>
      <SettingsRow
        icon={locale === "zh-CN" ? "checkmark" : undefined}
        label="简体中文"
        onPress={() => select("zh-CN")}
      />
      <SettingsRow
        icon={locale === "en" ? "checkmark" : undefined}
        label="English"
        onPress={() => select("en")}
      />
    </SettingsSection>
  );
}
