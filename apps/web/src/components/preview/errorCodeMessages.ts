import { i18n } from "@t3tools/shared/i18n";
import { PREVIEW_ERROR_CODE_MESSAGE_KEYS } from "./previewConstants";

/**
 * Resolve a friendly description for a Chromium / network error. Falls back
 * to the description string passed in when it isn't in our table.
 */
export function describePreviewError(description: string, t: typeof i18n.t = i18n.t): string {
  const friendly = PREVIEW_ERROR_CODE_MESSAGE_KEYS[description];
  if (friendly) return t(friendly);
  if (description.length > 0) return description;
  return t("preview.networkError");
}
