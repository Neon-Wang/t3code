import { i18n } from "@t3tools/shared/i18n";
import { EDITORS, type EditorId } from "@t3tools/contracts";

import { getLocalFileManagerName } from "~/lib/utils";

const editorLabels = new Map<EditorId, string>(EDITORS.map((editor) => [editor.id, editor.label]));

export function editorLabelForPlatform(editorId: EditorId, platform: string): string {
  if (editorId === "file-manager") {
    return getLocalFileManagerName(platform);
  }

  return editorLabels.get(editorId) ?? "Editor";
}

export function openInEditorMenuLabel(editorId: EditorId | null): string {
  return editorId === null || editorId === "file-manager"
    ? i18n.t("helpers.openInEditor")
    : i18n.t("settings.projectFaviconPickerDialog.openInFileManagerName", {
        fileManagerName: editorLabels.get(editorId) ?? "Editor",
      });
}
