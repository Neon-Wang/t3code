import { useI18n } from "~/hooks/useI18n";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { getSettingsSectionLabel } from "./settingsSearch";

/**
 * `Settings / Section`. The scope a change applies to lives at the top of the
 * page content, see `SettingsScopeSentence`.
 */
export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  const sectionLabel =
    normalizedPathname === "/settings/diagnostics"
      ? t("settings.breadcrumb.diagnostics")
      : normalizedPathname === "/settings/open-source-licenses"
        ? t("settings.misc.openSourceLicenses")
        : getSettingsSectionLabel(normalizedPathname, t);

  return (
    <WorkspaceBreadcrumb ariaLabel={t("settings.settingsBreadcrumb.settingsBreadcrumb")}>
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>{t("settings.breadcrumb.root")}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? t("settings.breadcrumb.root")}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
