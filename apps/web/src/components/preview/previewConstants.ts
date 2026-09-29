import type { MessageKey } from "@t3tools/shared/i18n";

/** Cap for the per-thread "recently seen" URL list shown in the empty state. */
export const PREVIEW_RECENT_URL_LIMIT = 10;

/**
 * Common Chromium error codes mapped to a short human label. Used by the
 * unreachable view to drop the raw `ERR_*` code in favour of friendlier copy.
 */
export const PREVIEW_ERROR_CODE_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = Object.freeze({
  ERR_NAME_NOT_RESOLVED: "preview.error.nameNotResolved",
  ERR_NAME_RESOLUTION_FAILED: "preview.error.nameNotResolved",
  ERR_CONNECTION_REFUSED: "preview.error.connectionRefused",
  ERR_CONNECTION_RESET: "preview.error.connectionReset",
  ERR_CONNECTION_CLOSED: "preview.error.connectionClosed",
  ERR_CONNECTION_TIMED_OUT: "preview.error.connectionTimeout",
  ERR_INTERNET_DISCONNECTED: "preview.error.offline",
  ERR_TIMED_OUT: "preview.error.connectionTimeout",
  ERR_CERT_AUTHORITY_INVALID: "preview.error.certificateAuthority",
  ERR_CERT_COMMON_NAME_INVALID: "preview.error.certificateHostname",
  ERR_CERT_DATE_INVALID: "preview.error.certificateDate",
  ERR_TOO_MANY_REDIRECTS: "preview.error.redirects",
});
