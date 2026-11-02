import { i18n } from "@t3tools/shared/i18n";
export function resolveAgentAwarenessPlatformPresentation(platform: string): {
  readonly supported: boolean;
  readonly subtitle: string | undefined;
} {
  return platform === "ios" || platform === "android"
    ? { supported: true, subtitle: undefined }
    : {
        supported: false,
        subtitle: i18n.t("mobile.settingsRouteScreenlogic.unavailableOnThisPlatform"),
      };
}
