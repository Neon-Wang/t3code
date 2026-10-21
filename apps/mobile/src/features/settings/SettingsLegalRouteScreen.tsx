import { SettingsLegalDocumentRouteScreen } from "./components/SettingsLegalDocumentRouteScreen";
import { LEGAL_URL } from "./lib/legal-document-url";
import { useI18n } from "../../i18n/useI18n";

export function SettingsLegalRouteScreen() {
  const { t } = useI18n();
  return (
    <SettingsLegalDocumentRouteScreen
      documentName={t("mobile.navigation.legal")}
      documentUrl={LEGAL_URL}
    />
  );
}
