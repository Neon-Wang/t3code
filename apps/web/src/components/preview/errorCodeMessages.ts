import { i18n } from "@t3tools/shared/i18n";
import { PREVIEW_ERROR_CODE_MESSAGES } from "./previewConstants";

export function describePreviewError(description: string): string {
  const friendly = PREVIEW_ERROR_CODE_MESSAGES[description];
  if (friendly) return friendly;
  if (description.length > 0) return description;
  return i18n.t("preview.networkError");
}
