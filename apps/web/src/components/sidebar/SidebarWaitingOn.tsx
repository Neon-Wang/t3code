import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { waitingOn } from "@t3tools/client-runtime/state/waiting-on";
import { ActivityIcon, CircleDotDashedIcon, TerminalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n } from "../../hooks/useI18n";
import { cn } from "../../lib/utils";
import { shouldShowInstanceBadge } from "../../providerInstances";
import { useActiveChildThreads } from "../../state/threads";
import type { SidebarThreadSummary } from "../../types";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import type { SidebarProviderEntry } from "./SidebarThreadRow";

type WaitingOnItem = ReturnType<typeof waitingOn>[number];

const MAX_LEAD_ICONS = 3;

/**
 * What a waiting thread waits on: its running subagents and delegated tasks, then the background
 * work it holds for. A thread blocked on a wait has no roster, so its children come from the shells.
 */
function useWaitingOn(thread: SidebarThreadSummary): ReadonlyArray<WaitingOnItem> {
  const children = useActiveChildThreads(scopeThreadRef(thread.environmentId, thread.id));
  return waitingOn(thread, children);
}

function WaitingOnIcon(props: {
  item: WaitingOnItem;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
  className: string;
}) {
  const entry =
    props.item.providerInstanceId === null
      ? undefined
      : props.providerEntryByInstanceId.get(props.item.providerInstanceId);
  if (props.item.kind === "agent" && entry) {
    return (
      <ProviderInstanceIcon
        driverKind={entry.driverKind}
        displayName={entry.displayName}
        accentColor={entry.accentColor}
        acpRegistryAgentId={entry.acpRegistryAgentId}
        acpRegistryIconUrl={entry.acpRegistryIconUrl}
        showBadge={shouldShowInstanceBadge(entry, props.providerEntryByInstanceId.values())}
        size="compact"
        iconClassName={props.className}
      />
    );
  }
  const Icon =
    props.item.kind === "command"
      ? TerminalIcon
      : props.item.kind === "monitor"
        ? ActivityIcon
        : CircleDotDashedIcon;
  return <Icon aria-hidden className={cn("shrink-0", props.className)} />;
}

/** The waiting status's icon: who the thread waits on, or `fallback` when the roster is empty. */
export function SidebarWaitingLead(props: {
  thread: SidebarThreadSummary;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
  iconClassName: string;
  fallback: ReactNode;
}) {
  const items = useWaitingOn(props.thread);
  if (items.length === 0) return props.fallback;
  const hidden = items.length - MAX_LEAD_ICONS;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {items.slice(0, MAX_LEAD_ICONS).map((item) => (
        <WaitingOnIcon
          key={item.key}
          item={item}
          providerEntryByInstanceId={props.providerEntryByInstanceId}
          className={props.iconClassName}
        />
      ))}
      {hidden > 0 ? <span className="tabular-nums">+{hidden}</span> : null}
    </span>
  );
}

/** Rows for the thread hover card, one per thing the thread waits on. */
export function SidebarWaitingDetails(props: {
  thread: SidebarThreadSummary;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
}) {
  const { t } = useI18n();
  const items = useWaitingOn(props.thread);
  return items.map((item) => {
    const entry =
      item.providerInstanceId === null
        ? undefined
        : props.providerEntryByInstanceId.get(item.providerInstanceId);
    return (
      <div key={item.key} className="flex min-w-0 items-center gap-2">
        <WaitingOnIcon
          item={item}
          providerEntryByInstanceId={props.providerEntryByInstanceId}
          className="size-3"
        />
        <div className="min-w-0 truncate text-foreground/75">
          {t("sidebar.waitingOnItem", { title: item.title })}
          {entry ? <span className="text-muted-foreground"> · {entry.displayName}</span> : null}
        </div>
      </div>
    );
  });
}
