import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { SETTINGS_SECTION_LABELS, settingsSectionLabel, type SettingsPath } from "./settingsSearch";

function settingsBreadcrumbLabel(pathname: string, t: typeof i18n.t): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/settings/diagnostics") return t("settings.option.diagnostics");
  if (normalized === "/settings/open-source-licenses") return t("settings.misc.openSourceLicenses");
  return normalized in SETTINGS_SECTION_LABELS
    ? settingsSectionLabel(normalized as SettingsPath, t)
    : null;
}

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const sectionLabel = settingsBreadcrumbLabel(pathname, t);

  return (
    <WorkspaceBreadcrumb ariaLabel={t("settings.settingsBreadcrumb.settingsBreadcrumb")}>
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>{t("settings.title")}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? t("settings.title")}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
