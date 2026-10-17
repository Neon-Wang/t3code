import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../i18n/useI18n";
import type { MenuAction } from "@react-native-menu/menu";
import {
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  type EnvironmentId,
  FILL_PREVIEW_VIEWPORT,
  PREVIEW_ZOOM_LEVELS,
  type PreviewAdjustInput,
  type PreviewSessionSnapshot,
  type PreviewViewportSetting,
} from "@t3tools/contracts";
import { PREVIEW_VIEWPORT_PRESETS } from "@t3tools/shared/previewViewport";
import { Alert } from "react-native";

import { ControlPill, ControlPillMenu } from "../../components/ControlPill";
import { previewEnvironment } from "../../state/preview";
import { useAtomCommand } from "../../state/use-atom-command";

const APPEARANCES = [
  {
    id: "system",
    get title() {
      return i18n.t("mobile.browserTabMenu.system");
    },
  },
  {
    id: "light",
    get title() {
      return i18n.t("mobile.browserTabMenu.light");
    },
  },
  {
    id: "dark",
    get title() {
      return i18n.t("mobile.browserTabMenu.dark");
    },
  },
] as const;

/** One preset per kind of screen; the web's device toolbar offers the full list. */
const VIEWPORTS = [
  {
    id: "fill",
    get title() {
      return i18n.t("mobile.browserTabMenu.fitToScreen");
    },
    setting: FILL_PREVIEW_VIEWPORT,
  },
  ...(["Phone", "Tablet", "Desktop"] as const).flatMap((category) => {
    const preset = PREVIEW_VIEWPORT_PRESETS.find((candidate) => candidate.category === category);
    if (!preset) return [];
    const setting: PreviewViewportSetting = {
      _tag: "preset",
      presetId: preset.id,
      width: preset.width,
      height: preset.height,
    };
    return [{ id: `preset:${preset.id}`, title: `${category} (${preset.label})`, setting }];
  }),
];

/**
 * The browser tab's menu: appearance, zoom, viewport, a hard reload, and its
 * profile's site data. Each runs through the environment, as on web and
 * desktop, so every client and agent sees the same tab. None need control.
 */
export function BrowserTabMenu({
  environmentId,
  tab,
  disabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly tab: PreviewSessionSnapshot;
  readonly disabled: boolean;
}) {
  const { t } = useI18n();
  const adjust = useAtomCommand(previewEnvironment.adjust, "browser tab change");
  const resize = useAtomCommand(previewEnvironment.resize, "browser viewport change");
  const target = { threadId: tab.threadId as PreviewAdjustInput["threadId"], tabId: tab.tabId };
  const colorScheme = tab.colorScheme ?? "system";
  const zoomFactor = tab.zoomFactor ?? DEFAULT_PREVIEW_ZOOM_FACTOR;
  const zoomIndex = PREVIEW_ZOOM_LEVELS.indexOf(zoomFactor);
  const zoomTo = (step: -1 | 1) =>
    PREVIEW_ZOOM_LEVELS[
      Math.min(Math.max((zoomIndex < 0 ? 7 : zoomIndex) + step, 0), PREVIEW_ZOOM_LEVELS.length - 1)
    ]!;
  const viewportId =
    tab.viewport === undefined || tab.viewport._tag === "fill"
      ? "fill"
      : tab.viewport._tag === "preset"
        ? `preset:${tab.viewport.presetId}`
        : "custom";

  const actions: MenuAction[] = [
    {
      id: "hard-reload",
      title: t("mobile.browserTabMenu.hardReload"),
      image: "arrow.clockwise.circle",
    },
    {
      id: "appearance",
      title: t("mobile.browserTabMenu.appearance"),
      image: "circle.lefthalf.filled",
      subactions: APPEARANCES.map((option) => ({
        id: `appearance:${option.id}`,
        title: option.title,
        state: option.id === colorScheme ? "on" : "off",
      })),
    },
    {
      id: "zoom",
      title: t("mobile.BrowserTabMenu.zoom", { percent: Math.round(zoomFactor * 100) }),
      image: "plus.magnifyingglass",
      subactions: [
        { id: "zoom:in", title: t("mobile.browserTabMenu.zoomIn"), image: "plus.magnifyingglass" },
        {
          id: "zoom:out",
          title: t("mobile.browserTabMenu.zoomOut"),
          image: "minus.magnifyingglass",
        },
        {
          id: "zoom:reset",
          title: t("mobile.browserTabMenu.actualSize"),
          image: "1.magnifyingglass",
        },
      ],
    },
    {
      id: "viewport",
      title: t("mobile.browserTabMenu.viewport"),
      image: "rectangle.and.arrow.up.right.and.arrow.down.left",
      subactions: VIEWPORTS.map((option) => ({
        id: `viewport:${option.id}`,
        title: option.title,
        state: option.id === viewportId ? "on" : "off",
      })),
    },
    {
      id: "site-data",
      title: t("mobile.browserTabMenu.siteData"),
      image: "trash",
      subactions: [
        {
          id: "clear:cookies",
          title: t("mobile.browserTabMenu.clearCookies"),
          attributes: { destructive: true },
        },
        {
          id: "clear:cache",
          title: t("mobile.browserTabMenu.clearCache"),
          attributes: { destructive: true },
        },
      ],
    },
  ];

  const run = async (change: Omit<PreviewAdjustInput, "threadId" | "tabId">) => {
    const result = await adjust({ environmentId, input: { ...target, ...change } });
    if (result._tag === "Failure")
      Alert.alert(t("mobile.browserTabMenu.couldNotChangeThisBrowserTab"));
  };

  const onAction = (id: string) => {
    if (id === "hard-reload") return void run({ hardReload: true });
    if (id === "zoom:in") return void run({ zoomFactor: zoomTo(1) });
    if (id === "zoom:out") return void run({ zoomFactor: zoomTo(-1) });
    if (id === "zoom:reset") return void run({ zoomFactor: DEFAULT_PREVIEW_ZOOM_FACTOR });
    if (id === "clear:cookies") return void run({ clear: "cookies" });
    if (id === "clear:cache") return void run({ clear: "cache" });
    if (id.startsWith("appearance:")) {
      const option = APPEARANCES.find((candidate) => `appearance:${candidate.id}` === id);
      if (option) void run({ colorScheme: option.id });
      return;
    }
    if (id.startsWith("viewport:")) {
      const option = VIEWPORTS.find((candidate) => `viewport:${candidate.id}` === id);
      if (!option) return;
      void resize({ environmentId, input: { ...target, viewport: option.setting } }).then(
        (result) => {
          if (result._tag === "Failure")
            Alert.alert(t("mobile.browserTabMenu.couldNotChangeTheViewport"));
        },
      );
    }
  };

  const pill = (
    <ControlPill
      icon="ellipsis"
      accessibilityLabel={t("mobile.browserTabMenu.browserTabOptions")}
      disabled={disabled}
    />
  );
  if (disabled) return pill;
  return (
    <ControlPillMenu
      accessible
      accessibilityLabel={t("mobile.browserTabMenu.browserTabOptions")}
      accessibilityRole="button"
      actions={actions}
      onPressAction={({ nativeEvent }) => onAction(nativeEvent.event)}
    >
      {pill}
    </ControlPillMenu>
  );
}
