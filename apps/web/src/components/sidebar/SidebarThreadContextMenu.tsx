import type { ContextMenuItem } from "@t3tools/contracts";
import { ThreadColor } from "@t3tools/contracts";
import { Fragment, useEffect } from "react";
import { create } from "zustand";
import {
  ArchiveIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  GitBranchIcon,
  HashIcon,
  MailOpenIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PaletteIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RefreshCwIcon,
  SettingsIcon,
  TimerIcon,
  TrashIcon,
  UserPlusIcon,
} from "lucide-react";
import {
  Menu,
  MenuItem,
  MenuItemDetail,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
} from "../ui/menu";
import type { ThreadActionMenuId } from "../threadActionMenu.logic";
import { threadColors } from "./threadColors";

type Request = {
  readonly items: ReadonlyArray<ContextMenuItem<ThreadActionMenuId>>;
  readonly position: { x: number; y: number };
  readonly resolve: (choice: ThreadActionMenuId | null) => void;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

export function requestSidebarThreadContextMenu(
  items: Request["items"],
  position: Request["position"],
): Promise<ThreadActionMenuId | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { items, position, resolve } }));
}

function finish(choice: ThreadActionMenuId | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(choice);
}

const icons = {
  archive: ArchiveIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  copy: CopyIcon,
  folder: FolderIcon,
  "folder-plus": FolderPlusIcon,
  "folder-tree": FolderTreeIcon,
  "git-branch": GitBranchIcon,
  hash: HashIcon,
  "mail-open": MailOpenIcon,
  "message-square": MessageSquareIcon,
  "message-square-plus": MessageSquarePlusIcon,
  palette: PaletteIcon,
  pencil: PencilIcon,
  pin: PinIcon,
  "pin-off": PinOffIcon,
  "refresh-cw": RefreshCwIcon,
  settings: SettingsIcon,
  timer: TimerIcon,
  trash: TrashIcon,
  "user-plus": UserPlusIcon,
};

function ThreadMenuItems({ items }: { items: Request["items"] }) {
  return items.map((item) => {
    const Icon = item.icon ? icons[item.icon as keyof typeof icons] : undefined;
    const color = ThreadColor.literals.find((value) => item.id === `color:${value}`);
    const label = (
      <>
        {color ? (
          <span
            aria-hidden
            className="size-3.5 shrink-0 rounded-sm"
            style={{ backgroundColor: threadColors[color].swatch }}
          />
        ) : Icon ? (
          <Icon />
        ) : null}
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.detail ? <MenuItemDetail>{item.detail}</MenuItemDetail> : null}
        {item.checked ? <CheckIcon aria-hidden className="size-3.5" /> : null}
      </>
    );
    return (
      <Fragment key={item.id}>
        {item.separatorBefore ? <MenuSeparator /> : null}
        {item.children ? (
          <MenuSub>
            <MenuSubTrigger disabled={item.disabled}>{label}</MenuSubTrigger>
            <MenuPopup side="right" align="start">
              <ThreadMenuItems items={item.children} />
            </MenuPopup>
          </MenuSub>
        ) : (
          <MenuItem
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : "default"}
            role={item.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={item.checked}
            onClick={() => finish(item.id)}
          >
            {label}
          </MenuItem>
        )}
      </Fragment>
    );
  });
}

export function SidebarThreadContextMenu() {
  const request = useRequest((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolve the pending menu request when its sidebar unmounts
  useEffect(() => () => finish(null), []);
  if (!request) return null;
  return (
    <Menu
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <MenuPopup
        side="bottom"
        align="start"
        sideOffset={0}
        anchor={{
          getBoundingClientRect: () => new DOMRect(request.position.x, request.position.y, 0, 0),
        }}
      >
        <ThreadMenuItems items={request.items} />
      </MenuPopup>
    </Menu>
  );
}
