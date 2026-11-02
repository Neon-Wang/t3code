import type { ScheduledTaskWebhookEndpoint } from "@t3tools/contracts";
import type { I18n } from "@t3tools/shared/i18n";
import { isLocalLoopbackHost } from "@t3tools/shared/hostClassification";

export interface WebhookAddress {
  readonly address: string;
  readonly copyable: boolean;
  readonly note: string | null;
}
type Translate = I18n["t"];

export function webhookAddress(
  endpoint: ScheduledTaskWebhookEndpoint,
  httpBaseUrl: string | null,
  t: Translate,
): WebhookAddress {
  if (endpoint.url !== null) {
    return { address: endpoint.url, copyable: true, note: null };
  }
  if (httpBaseUrl === null) {
    return {
      address: endpoint.path,
      copyable: false,
      note: t("shared.webhook.linkForPublicUrl"),
    };
  }
  const url = new URL(endpoint.path, httpBaseUrl);
  return {
    address: url.href,
    copyable: true,
    note: isLocalLoopbackHost(url.hostname)
      ? t("shared.webhook.localOnly")
      : t("shared.webhook.reachable"),
  };
}
