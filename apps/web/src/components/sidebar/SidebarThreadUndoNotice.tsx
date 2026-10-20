import { useI18n } from "../../hooks/useI18n";
import { useAtomValue } from "@effect/atom-react";

import { undoLatestThreadAction, useThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Alert, AlertDescription } from "../ui/alert";
import { InlineButton } from "../ui/button";

export function SidebarThreadUndoNotice() {
  const { t } = useI18n();
  const notice = useThreadUndoNotice((state) => state.notice);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);

  if (!notice) return null;
  const shortcut = shortcutLabelForCommand(keybindings, "thread.undo");
  const actionMessages = {
    Settled: "v2.surfaces.undoSettled",
    Snoozed: "v2.surfaces.undoSnoozed",
    Unpinned: "v2.surfaces.undoUnpinned",
    Archived: "v2.surfaces.undoArchived",
    Discarded: "v2.surfaces.undoDiscarded",
  } as const;

  return (
    <Alert role="status" variant="sidebar">
      <AlertDescription>
        {t(actionMessages[notice.action], { count: notice.count })},{" "}
        <InlineButton onClick={undoLatestThreadAction}>
          {shortcut ? t("sidebar.ui.undoShortcut", { shortcut: shortcut }) : t("sidebar.ui.undo")}
        </InlineButton>
      </AlertDescription>
    </Alert>
  );
}
