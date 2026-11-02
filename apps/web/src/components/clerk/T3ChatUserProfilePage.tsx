import { T3CHAT_PLAN_TUNNEL_LIMITS, type RelayT3ChatLink } from "@t3tools/contracts/relay";
import { MessageSquareIcon } from "lucide-react";
import { i18n } from "@t3tools/shared/i18n";
import type { ReactNode } from "react";

import { useI18n } from "../../hooks/useI18n";
import { useManagedTunnelUsage } from "../../cloud/managedRelayState";
import { T3CHAT_SUBSCRIPTION_URL, TunnelUsageMeter } from "../cloud/TunnelUsage";
import { Button } from "../ui/button";
import {
  ClerkUserProfilePage,
  ClerkUserProfileRefreshButton,
  ClerkUserProfileRow,
} from "./ClerkUserProfilePage";
import { useT3ChatLink } from "./useT3ChatLink";

// Built per render so the link text follows the active language.
const upgradeLink = () => (
  <a className="underline" href={T3CHAT_SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer">
    {i18n.t("clerk.upgradeOnT3Chat")}
  </a>
);

function planLabel(link: RelayT3ChatLink): ReactNode {
  switch (link.plan) {
    case "premier":
      return i18n.t("clerk.planPremier", { count: T3CHAT_PLAN_TUNNEL_LIMITS.premier });
    case "pro":
      return (
        <>
          {i18n.t("clerk.planProPrefix", { count: T3CHAT_PLAN_TUNNEL_LIMITS.pro })} {upgradeLink()}{" "}
          {i18n.t("clerk.planProSuffix", { count: T3CHAT_PLAN_TUNNEL_LIMITS.premier })}
        </>
      );
    case "free":
      return (
        <>
          {upgradeLink()} {i18n.t("clerk.forMoreTunnels")}
        </>
      );
  }
}

/** Links a T3 Chat account so paid subscribers get more tunnels. */
export function T3ChatUserProfilePage() {
  const { t } = useI18n();
  const { linkState, pending, linkUrl, link: handleLink, unlink: handleUnlink } = useT3ChatLink();
  const usage = useManagedTunnelUsage();

  const data = linkState.data;
  const link = data?.link ?? null;

  return (
    <ClerkUserProfilePage
      title="T3 Chat"
      description={t("clerk.t3ChatDescription", {
        pro: T3CHAT_PLAN_TUNNEL_LIMITS.pro,
        premier: T3CHAT_PLAN_TUNNEL_LIMITS.premier,
      })}
      action={
        <ClerkUserProfileRefreshButton
          disabled={pending !== null}
          isPending={linkState.isPending}
          onClick={usage.refresh}
        />
      }
    >
      {linkState.error ? (
        <div className="border-t py-3 text-xs" role="alert">
          <p className="font-medium text-destructive-foreground">
            {t("clerk.couldNotLoadT3ChatLink")}
          </p>
          <p className="mt-0.5 text-muted-foreground">{linkState.error}</p>
        </div>
      ) : data === null ? null : !data.available ? (
        <p className="border-t py-4 text-xs text-muted-foreground">
          {t("clerk.t3ChatLinkingUnsupported")}
        </p>
      ) : (
        <ul className="border-t">
          <ClerkUserProfileRow icon={<MessageSquareIcon className="size-4" />}>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm leading-4.5 font-medium text-foreground">
                  {link ? link.email : t("clerk.notLinked")}
                </h3>
                <p className="mt-1 text-xs leading-4.5 text-muted-foreground">
                  {link ? (
                    planLabel(link)
                  ) : linkUrl ? (
                    <>
                      {t("clerk.confirmOnPrefix")}{" "}
                      <a
                        className="underline"
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        t3.chat
                      </a>
                      {t("clerk.thenSelectRefresh")}
                    </>
                  ) : (
                    t("clerk.confirmLinkOnT3Chat")
                  )}
                </p>
              </div>
              {link ? (
                <Button
                  size="sm"
                  variant="destructive-outline"
                  disabled={pending !== null}
                  onClick={() => void handleUnlink()}
                >
                  {pending === "unlink" ? t("clerk.unlinking") : t("clerk.unlink")}
                </Button>
              ) : (
                <Button size="sm" disabled={pending !== null} onClick={() => void handleLink()}>
                  {pending === "link" ? t("clerk.opening") : t("clerk.linkT3Chat")}
                </Button>
              )}
            </div>
          </ClerkUserProfileRow>
          {usage.used !== null && usage.limit !== null ? (
            <li className="border-t py-4">
              <TunnelUsageMeter used={usage.used} limit={usage.limit} />
            </li>
          ) : null}
        </ul>
      )}
    </ClerkUserProfilePage>
  );
}
