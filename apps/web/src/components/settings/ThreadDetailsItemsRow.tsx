import { ChevronDownIcon } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { ThreadDetailsItemsMenuItems } from "../chat/ThreadDetailsItemsMenu";
import {
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  THREAD_DETAILS_ITEMS,
} from "../chat/threadDetailsItems";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function ThreadDetailsItemsRow() {
  const { t } = useI18n();
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  const enabled = THREAD_DETAILS_ITEMS.filter((item) => visibility[item.id]).length;
  return (
    <SettingsRow
      {...searchableSetting("thread-details-items", t)}
      description={t("settings.threadDetails.description")}
      resetAction={
        isDefaultThreadDetailsVisibility(visibility) ? null : (
          <SettingResetButton
            label={t("settings.threadDetails.resetLabel")}
            onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
          />
        )
      }
      control={
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between sm:w-40"
                aria-label={t("settings.threadDetails.enabledAria", {
                  enabled,
                  total: THREAD_DETAILS_ITEMS.length,
                })}
              />
            }
          >
            {t("settings.threadDetails.enabledCount", {
              enabled,
              total: THREAD_DETAILS_ITEMS.length,
            })}
            <ChevronDownIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end">
            <ThreadDetailsItemsMenuItems />
          </MenuPopup>
        </Menu>
      }
    />
  );
}
