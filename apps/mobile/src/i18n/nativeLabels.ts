import { i18n } from "@t3tools/shared/i18n";
import { tailnetNative } from "../features/tailnet/native";

export function syncNativeLanguage() {
  return tailnetNative?.setInterfaceLanguage(i18n.locale, {
    connectionChannel: i18n.t("mobile.notifications.connectionChannel"),
    connectionDescription: i18n.t("mobile.notifications.connectionDescription"),
    connectionTitle: i18n.t("mobile.notifications.connectionTitle"),
    connectionBody: i18n.t("mobile.notifications.connectionBody"),
    stopBackground: i18n.t("mobile.notifications.stopBackground"),
    tasksChannel: i18n.t("mobile.notifications.tasksChannel"),
    tasksDescription: i18n.t("mobile.notifications.tasksDescription"),
  });
}
