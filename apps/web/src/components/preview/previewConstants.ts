import { i18n } from "@t3tools/shared/i18n";
/** Cap for the per-thread "recently seen" URL list shown in the empty state. */
export const PREVIEW_RECENT_URL_LIMIT = 10;

/**
 * Common Chromium error codes mapped to a short human label. Used by the
 * unreachable view to drop the raw `ERR_*` code in favour of friendlier copy.
 */
export const PREVIEW_ERROR_CODE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  get ERR_NAME_NOT_RESOLVED() {
    return i18n.t("preview.error.nameNotResolved");
  },
  get ERR_NAME_RESOLUTION_FAILED() {
    return i18n.t("preview.error.nameNotResolved");
  },
  get ERR_CONNECTION_REFUSED() {
    return i18n.t("preview.error.connectionRefused");
  },
  get ERR_CONNECTION_RESET() {
    return i18n.t("preview.error.connectionReset");
  },
  get ERR_CONNECTION_CLOSED() {
    return i18n.t("preview.error.connectionClosed");
  },
  get ERR_CONNECTION_TIMED_OUT() {
    return i18n.t("preview.error.connectionTimeout");
  },
  get ERR_INTERNET_DISCONNECTED() {
    return i18n.t("preview.error.offline");
  },
  get ERR_TIMED_OUT() {
    return i18n.t("preview.error.connectionTimeout");
  },
  get ERR_CERT_AUTHORITY_INVALID() {
    return i18n.t("preview.error.certificateAuthority");
  },
  get ERR_CERT_COMMON_NAME_INVALID() {
    return i18n.t("preview.error.certificateHostname");
  },
  get ERR_CERT_DATE_INVALID() {
    return i18n.t("preview.error.certificateDate");
  },
  get ERR_TOO_MANY_REDIRECTS() {
    return i18n.t("preview.error.redirects");
  },
});
