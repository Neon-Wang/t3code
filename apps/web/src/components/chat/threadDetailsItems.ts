import type { ClientSettings } from "@t3tools/contracts";
import type { MessageKey } from "@t3tools/shared/i18n";

// Ids are stored in client settings, so never rename one.
export const THREAD_DETAILS_ITEMS = [
  {
    id: "environment",
    labelKey: "chat.threadDetails.environmentAndWorktree",
    defaultVisible: true,
  },
  { id: "openIn", labelKey: "helpers.openInEditor", defaultVisible: true },
  { id: "scripts", labelKey: "scripts.projectScripts", defaultVisible: true },
  { id: "branch", labelKey: "chat.threadDetails.branchAndPullRequest", defaultVisible: true },
  { id: "gitActions", labelKey: "branchToolbar.git.gitActions", defaultVisible: true },
  { id: "changes", labelKey: "v2.surfaces.copy8", defaultVisible: true },
  { id: "servers", labelKey: "chat.servers", defaultVisible: true },
  { id: "automations", labelKey: "v2.chat.automations", defaultVisible: true },
  { id: "lineage", labelKey: "v2.chat.lineage", defaultVisible: true },
  { id: "sideChats", labelKey: "chat.sideChats", defaultVisible: true },
  { id: "usage", labelKey: "chat.ui.usageLimits", defaultVisible: false },
  { id: "context", labelKey: "chat.threadDetails.contextWindow", defaultVisible: false },
] as const satisfies ReadonlyArray<{
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly defaultVisible: boolean;
}>;

export type ThreadDetailsItemId = (typeof THREAD_DETAILS_ITEMS)[number]["id"];
export type ThreadDetailsVisibility = Readonly<Record<ThreadDetailsItemId, boolean>>;

type ThreadDetailsItem = (typeof THREAD_DETAILS_ITEMS)[number];
type ThreadDetailsItemSettings = Pick<
  ClientSettings,
  "threadDetailsItems" | "threadDetailsUsageEnabled"
>;

// People who turned on the retired Labs toggle keep Usage and Context until they change them here.
function defaultVisible(item: ThreadDetailsItem, settings: ThreadDetailsItemSettings) {
  return item.id === "usage" || item.id === "context"
    ? settings.threadDetailsUsageEnabled
    : item.defaultVisible;
}

export function resolveThreadDetailsVisibility(
  settings: ThreadDetailsItemSettings,
): ThreadDetailsVisibility {
  return Object.fromEntries(
    THREAD_DETAILS_ITEMS.map((item) => [
      item.id,
      settings.threadDetailsItems[item.id] ?? defaultVisible(item, settings),
    ]),
  ) as Record<ThreadDetailsItemId, boolean>;
}

/** Stores only choices that differ from the default, so a later default change reaches everyone else. */
export function setThreadDetailsItem(
  settings: ThreadDetailsItemSettings,
  item: ThreadDetailsItem,
  visible: boolean,
): ClientSettings["threadDetailsItems"] {
  const { [item.id]: _previous, ...rest } = settings.threadDetailsItems;
  return visible === defaultVisible(item, settings) ? rest : { ...rest, [item.id]: visible };
}

export function isDefaultThreadDetailsVisibility(visibility: ThreadDetailsVisibility) {
  return THREAD_DETAILS_ITEMS.every((item) => visibility[item.id] === item.defaultVisible);
}

/** Also clears the retired Labs flag, so Usage and Context return to off. */
export const RESET_THREAD_DETAILS_ITEMS = {
  threadDetailsItems: {},
  threadDetailsUsageEnabled: false,
} satisfies Partial<ClientSettings>;
