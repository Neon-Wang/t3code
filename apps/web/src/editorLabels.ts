import { i18n } from "@t3tools/shared/i18n";
import { EDITORS, type EditorId } from "@t3tools/contracts";

import { getLocalFileManagerName } from "~/lib/utils";

const editorLabels = new Map<EditorId, string>(EDITORS.map((editor) => [editor.id, editor.label]));

export function editorLabelForPlatform(
  editorId: EditorId,
  platform: string,
  t: typeof i18n.t = i18n.t,
): string {
  if (editorId === "file-manager") {
    return getLocalFileManagerName(platform, t);
  }

  return editorLabels.get(editorId) ?? t("helpers.editor");
}

export function openInEditorMenuLabel(
  editorId: EditorId | null,
  t: typeof i18n.t = i18n.t,
): string {
  return editorId === null || editorId === "file-manager"
    ? t("helpers.openInEditor")
    : t("helpers.openInValue", { arg0: editorLabels.get(editorId) ?? t("helpers.editor") });
}
