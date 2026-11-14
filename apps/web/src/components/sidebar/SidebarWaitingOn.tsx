import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import { ActivityIcon, CircleDotDashedIcon, TerminalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n } from "../../hooks/useI18n";
import { cn } from "../../lib/utils";
import { shouldShowInstanceBadge } from "../../providerInstances";
import { useActiveChildThreads } from "../../state/threads";
import type { SidebarThreadSummary } from "../../types";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import type { SidebarProviderEntry } from "./SidebarThreadRow";

interface WaitingOnItem {
  readonly key: string;
  readonly kind: "agent" | "command" | "monitor" | "task";
  readonly title: string;
  readonly providerInstanceId: string | null;
}

const MAX_LEAD_ICONS = 3;

/**
 * What a waiting thread waits on: its running subagents and delegated tasks, then the background
 * work it holds for. A thread blocked on a wait has no roster, so its children come from the shells.
 */
function useWaitingOn(thread: SidebarThreadSummary): ReadonlyArray<WaitingOnItem> {
  const children = useActiveChildThreads(scopeThreadRef(thread.environmentId, thread.id));
  const items: WaitingOnItem[] = children.map((child) => ({
    key: `thread:${child.environmentId}:${child.id}`,
    kind: "agent",
    title: formatSubagentDisplayTitle(child.title),
    providerInstanceId: child.runtime?.providerInstanceId ?? child.modelSelection.instanceId,
  }));
  const childIds = new Set<string>(children.map((child) => child.id));
  for (const task of thread.pendingBackgroundTasks) {
    if (!backgroundWorkHoldsCompletion([task])) continue;
    if (task.kind === "subagent") {
      if (task.childThreadId !== undefined && childIds.has(task.childThreadId)) continue;
      items.push({
        key: `task:${task.taskId}`,
        kind: "agent",
        title: task.description ?? task.taskId,
        providerInstanceId: task.providerInstanceId ?? null,
      });
      continue;
    }
    items.push({
      key: `task:${task.taskId}`,
      kind: task.kind === "command" ? "command" : task.kind === "monitor" ? "monitor" : "task",
      title: task.description ?? task.command ?? task.taskId,
      providerInstanceId: null,
    });
  }
  return items;
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
