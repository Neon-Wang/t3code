import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
("use client");

import type { DesktopPreviewColorScheme } from "@t3tools/contracts";
import { Minus, MoreVertical, Plus as PlusIcon, RotateCcw } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const COLOR_SCHEME_OPTIONS: ReadonlyArray<{
  value: DesktopPreviewColorScheme;
  label: string;
}> = [
  {
    value: "system",
    get label() {
      return i18n.t("settings.theme.system");
    },
  },
  {
    value: "light",
    get label() {
      return i18n.t("device.light");
    },
  },
  {
    value: "dark",
    get label() {
      return i18n.t("device.dark");
    },
  },
];

/**
 * What the menu's items do for the active tab. Desktop tabs run them through
 * the desktop bridge; server tabs, whether streamed or rendered natively by
 * the desktop app, run them through the environment server.
 */
export interface PreviewMoreMenuActions {
  readonly hardReload: () => void;
  readonly setColorScheme: (colorScheme: DesktopPreviewColorScheme) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  readonly clearCookies: () => void;
  readonly clearCache: () => void;
  /** Absent where there is no inspector to open, such as a streamed server tab. */
  readonly openDevTools?: () => void;
  /** Absent where the tab cannot get its own window. */
  readonly toggleNativePictureInPicture?: () => void;
}

interface Props {
  /** False until the tab can take these actions, such as before its page attaches. */
  enabled: boolean;
  actions: PreviewMoreMenuActions;
  /** Current zoom factor as a number (1.0 = 100%). */
  zoomFactor: number;
  /** Emulated `prefers-color-scheme` for the page. */
  colorScheme: DesktopPreviewColorScheme;
  /** Fixed viewport modes expose the device toolbar and resize rails. */
  deviceToolbarVisible: boolean;
  /** Switches between fill-panel mode and a fixed responsive viewport. */
  onToggleDeviceToolbar: () => void;
  /** Whether the separate native always-on-top preview window is open. */
  nativePictureInPicture: boolean;
  /** Profile display name, shown so the menu says which data is being cleared. */
  profileName: string | undefined;
  /** Reopens the tab in the other browser it can run in. */
  move?: { readonly label: string; readonly onMove: () => void };
}

const MenuTriggerButton = () => (
  <Tooltip>
    <TooltipTrigger
      render={
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              aria-label={i18n.t("preview.previewMenu")}
            />
          }
        />
      }
    >
      <MoreVertical />
    </TooltipTrigger>
    <TooltipPopup>{i18n.t("preview.more")}</TooltipPopup>
  </Tooltip>
);

/** Three-dot menu in the chrome row; the same items for every kind of tab. */
export function PreviewMoreMenu({
  enabled,
  actions,
  zoomFactor,
  colorScheme,
  deviceToolbarVisible,
  onToggleDeviceToolbar,
  nativePictureInPicture,
  profileName,
  move,
}: Props) {
  const { t } = useI18n();
  const zoomLabel = `${Math.round(zoomFactor * 100)}%`;
  const disabled = !enabled;
  return (
    <Menu>
      <MenuTriggerButton />
      <MenuPopup align="end" sideOffset={6}>
        <MenuItem onClick={actions.hardReload} disabled={disabled}>
          {t("preview.hardReload")}
        </MenuItem>
        {actions.openDevTools ? (
          <MenuItem onClick={actions.openDevTools} disabled={disabled}>
            {t("preview.openDevtools")}
          </MenuItem>
        ) : null}
        {actions.toggleNativePictureInPicture ? (
          <MenuItem onClick={actions.toggleNativePictureInPicture} disabled={disabled}>
            {nativePictureInPicture
              ? t("preview.closeSeparatePreviewWindow")
              : t("preview.openSeparatePreviewWindow")}
          </MenuItem>
        ) : null}
        {move ? <MenuItem onClick={move.onMove}>{move.label}</MenuItem> : null}
        <MenuItem onClick={onToggleDeviceToolbar} disabled={disabled}>
          {deviceToolbarVisible ? t("preview.hideDeviceToolbar") : t("preview.showDeviceToolbar")}
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger disabled={disabled}>{t("device.appearance")}</MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={colorScheme}
              onValueChange={(value) => actions.setColorScheme(value as DesktopPreviewColorScheme)}
            >
              {COLOR_SCHEME_OPTIONS.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        <MenuSeparator />
        {/*
          Zoom row: label + inline control cluster. `closeOnClick=false`
          keeps the menu open while the user clicks the +/− buttons.
        */}
        <MenuItem
          closeOnClick={false}
          onClick={(event: React.MouseEvent) => event.preventDefault()}
          className="justify-between"
          disabled={disabled}
        >
          <span>{t("preview.zoom")}</span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={actions.zoomOut}
              aria-label={t("preview.zoomOut")}
              disabled={disabled}
            >
              <Minus />
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
              {zoomLabel}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={actions.zoomIn}
              aria-label={t("preview.zoomIn")}
              disabled={disabled}
            >
              <PlusIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              onClick={actions.resetZoom}
              aria-label={t("preview.resetZoom")}
              disabled={disabled}
            >
              <RotateCcw />
            </Button>
          </span>
        </MenuItem>
        <MenuSeparator />
        {/*
          Grouped so the heading has a `MenuGroup` ancestor — `MenuGroupLabel`
          reads its context and throws without one. The heading also answers
          which profile the tab is in, which is otherwise invisible: it is fixed
          at open and nothing else in the chrome shows it.
        */}
        <MenuGroup>
          {profileName ? (
            // Truncation needs a block box: `text-overflow` on an inline child
            // never applies and a long name would push the popup past its width.
            <MenuGroupLabel className="max-w-64">
              <span className="block truncate">
                {t("preview.profile")} {profileName}
              </span>
            </MenuGroupLabel>
          ) : null}
          <MenuItem onClick={actions.clearCookies}>{t("preview.clearCookies")}</MenuItem>
          <MenuItem onClick={actions.clearCache}>{t("preview.clearCache")}</MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
