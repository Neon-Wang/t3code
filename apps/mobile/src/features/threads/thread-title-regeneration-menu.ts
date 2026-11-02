import { i18n } from "@t3tools/shared/i18n";
import type { MenuAction } from "@react-native-menu/menu";

export function buildThreadTitleRegenerationMenuItems(input: {
  readonly supported: boolean;
  readonly isRegenerating: boolean;
}): MenuAction[] {
  if (!input.supported) return [];

  return [
    {
      id: "regenerate-title",
      title: input.isRegenerating
        ? i18n.t("mobile.threadTitleRegenerationMenu.regenerating")
        : i18n.t("sidebar.regenerateTitle"),
      image: "arrow.clockwise",
      ...(input.isRegenerating ? { attributes: { disabled: true } } : {}),
    },
  ];
}
