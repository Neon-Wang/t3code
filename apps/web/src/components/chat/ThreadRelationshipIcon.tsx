import { i18n } from "@t3tools/shared/i18n";
import type { ProviderDriverKind, ServerProvider } from "@t3tools/contracts";
import { BotIcon, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

export function threadRelationshipStatusLabel(status: string | null): string {
  switch (status) {
    case "preparing":
    case "starting":
      return i18n.t("device.starting");
    case "running":
    case "in_progress":
      return i18n.t("pr.running");
    case "pending":
    case "queued":
      return i18n.t("chat.ui.queued");
    case "waiting":
    case "blocked":
      return i18n.t("chat.timeline.tools.t3_thread_wait.running");
    case "completed":
      return i18n.t("action.done");
    case "failed":
    case "error":
      return i18n.t("pr.failed");
    case "cancelled":
    case "interrupted":
      return i18n.t("agents.stopped");
    case "rolled_back":
      return i18n.t("v2.chat.reverted");
    case "resolved_native":
      return i18n.t("v2.chat.resolvedNative");
    case "resolved_portable":
      return i18n.t("v2.chat.resolvedPortable");
    case "consumed":
      return i18n.t("v2.chat.consumed");
    case "superseded":
      return i18n.t("v2.chat.superseded");
    case "idle":
      return i18n.t("chat.ui.idle");
    default:
      return i18n.t("common.unknown");
  }
}

/** Shared by lineage and timeline links, including the provider glyph and status badge. */
export function ThreadRelationshipIcon({
  driver,
  provider,
  status,
  fallbackIcon: FallbackIcon = BotIcon,
}: {
  driver?: ProviderDriverKind | undefined;
  provider?: ServerProvider | undefined;
  status: string | null;
  fallbackIcon?: LucideIcon;
}) {
  const iconClassName = "size-4 shrink-0 text-muted-foreground";
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      {driver ? (
        <ProviderInstanceIcon
          driverKind={driver}
          displayName={provider?.displayName ?? driver}
          acpRegistryIconUrl={provider?.iconUrl}
          iconClassName={iconClassName}
          className="z-auto"
        />
      ) : (
        <FallbackIcon className={iconClassName} />
      )}
      <span
        className={cn(
          "absolute -bottom-1 -right-1 size-2 rounded-full border-2 border-card",
          status === "running" ||
            status === "in_progress" ||
            status === "pending" ||
            status === "waiting"
            ? "bg-info"
            : status === "failed" || status === "error"
              ? "bg-destructive"
              : status === "completed"
                ? "bg-success"
                : "bg-muted-foreground/45",
        )}
        aria-hidden="true"
      />
    </span>
  );
}
