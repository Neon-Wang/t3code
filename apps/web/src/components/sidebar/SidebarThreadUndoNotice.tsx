import { useI18n } from "../../hooks/useI18n";
import { useAtomValue } from "@effect/atom-react";

import { undoLatestThreadAction, useThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { shortcutLabelForCommand } from "../../keybindings";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { Alert, AlertDescription } from "../ui/alert";
import { InlineButton } from "../ui/button";

const THREAD_UNDO_ACTION_KEYS = {
  Settled: "sidebar.ui.undoAction.settled",
  Snoozed: "sidebar.ui.undoAction.snoozed",
  Unpinned: "sidebar.ui.undoAction.unpinned",
  Archived: "sidebar.ui.undoAction.archived",
} as const;

export function SidebarThreadUndoNotice() {
  const { t } = useI18n();
  const notice = useThreadUndoNotice((state) => state.notice);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);

  if (!notice) return null;
  const shortcut = shortcutLabelForCommand(keybindings, "thread.undo");

  return (
    <Alert role="status" variant="sidebar">
      <AlertDescription>
        {t(notice.count === 1 ? "sidebar.ui.undoThreadOne" : "sidebar.ui.undoThreadMany", {
          action: t(THREAD_UNDO_ACTION_KEYS[notice.action]),
          count: notice.count,
        })}{" "}
        <InlineButton onClick={undoLatestThreadAction}>
          {shortcut ? t("sidebar.ui.undoShortcut", { shortcut }) : t("sidebar.ui.undo")}
        </InlineButton>
      </AlertDescription>
    </Alert>
  );
}
