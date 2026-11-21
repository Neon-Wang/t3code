import type { MenuAction } from "@react-native-menu/menu";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { ThreadColor } from "@t3tools/contracts";
import { msg } from "gt-react-native";
import type { MessageResolver } from "../../i18n/messages";
import { threadColors } from "./thread-colors";
import { getThreadListV2NewBranchMenuTitle } from "./thread-list-v2-row-appearance";
import { buildThreadTitleRegenerationMenuItems } from "./thread-title-regeneration-menu";
import {
  layoutThreadListV2RowMenuActions,
  type resolveThreadListV2SnoozePresets,
} from "./threadListV2";

const CARD_MENU_ACTIONS: MenuAction[] = [
  { id: "settle", title: msg("Settle", { $context: "verb, thread action" }), image: "checkmark" },
  {
    id: "delete",
    title: msg("Delete", { $context: "verb, thread action" }),
    image: "trash",
    attributes: { destructive: true },
  },
];

const SLIM_MENU_ACTIONS: MenuAction[] = [
  {
    id: "unsettle",
    title: msg("Un-settle", { $context: "verb, thread action" }),
    image: "arrow.uturn.backward",
  },
  {
    id: "delete",
    title: msg("Delete", { $context: "verb, thread action" }),
    image: "trash",
    attributes: { destructive: true },
  },
];

const SNOOZED_MENU_ACTIONS: MenuAction[] = [
  { id: "unsnooze", title: msg("Wake thread"), image: "clock" },
  {
    id: "delete",
    title: msg("Delete", { $context: "verb, thread action" }),
    image: "trash",
    attributes: { destructive: true },
  },
];

const LEGACY_MENU_ACTIONS: MenuAction[] = [
  {
    id: "archive",
    title: msg("Archive", { $context: "verb, thread action" }),
    image: "archivebox",
  },
  {
    id: "delete",
    title: msg("Delete", { $context: "verb, thread action" }),
    image: "trash",
    attributes: { destructive: true },
  },
];

const colorLabels = {
  red: msg("Red"),
  orange: msg("Orange"),
  yellow: msg("Yellow"),
  green: msg("Green"),
  teal: msg("Teal"),
  blue: msg("Blue"),
  purple: msg("Purple"),
  gray: msg("Gray"),
} satisfies Record<ThreadColor, string>;

export interface ThreadListV2MenuInput {
  readonly canShareWithGuest: boolean;
  readonly m: MessageResolver;
  readonly nested: boolean;
  readonly thread: Pick<EnvironmentThreadShell, "branch" | "pinnedAt" | "autoSettleDisabledAt">;
  readonly color: ThreadColor | null;
  readonly supportsColors: boolean;
  readonly variant: "card" | "slim";
  readonly snoozed: boolean;
  readonly settlementSupported: boolean;
  readonly pinningSupported: boolean;
  readonly autoSettleOptOutSupported: boolean;
  readonly titleRegenerationSupported: boolean;
  readonly isRegeneratingTitle: boolean;
  readonly canTurnIntoProject: boolean;
  readonly canArchive: boolean;
  readonly reorderSupported?: boolean;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
  readonly snoozeSecondary: "snooze" | null;
  readonly snoozePresetActions: MenuAction[];
}

export function buildThreadListV2SnoozeMenu(
  snoozePresets: ReturnType<typeof resolveThreadListV2SnoozePresets>,
  m: MessageResolver,
): MenuAction[] {
  return [
    ...snoozePresets.map((preset) => ({
      id: `snooze:${preset.id}`,
      title: preset.label,
      subtitle: preset.whenLabel,
    })),
    { id: "snooze:custom", title: m(msg("Custom…", { $context: "custom snooze time" })) },
  ];
}

export function buildThreadListV2Menu(props: ThreadListV2MenuInput): MenuAction[] {
  const {
    m,
    nested,
    thread,
    color,
    canShareWithGuest,
    supportsColors,
    snoozePresetActions,
    canTurnIntoProject,
    isRegeneratingTitle,
  } = props;
  const reorderMenuItems =
    props.reorderSupported === true
      ? [
          { id: "arrange", title: m(msg("Arrange threads…")), image: "line.3.horizontal" },
          {
            id: "move-up",
            title: m(msg("Move up")),
            image: "arrow.up",
            attributes: { disabled: props.canMoveUp !== true },
          } satisfies MenuAction,
          {
            id: "move-down",
            title: m(msg("Move down")),
            image: "arrow.down",
            attributes: { disabled: props.canMoveDown !== true },
          } satisfies MenuAction,
        ]
      : [];
  const pinMenuItems = props.pinningSupported
    ? [
        thread.pinnedAt != null
          ? {
              id: "unpin",
              title: m(msg("Unpin", { $context: "verb, thread action" })),
              image: "pin.slash",
            }
          : { id: "pin", title: m(msg("Pin", { $context: "verb, thread action" })), image: "pin" },
      ]
    : [];
  const autoSettleMenuItems = props.autoSettleOptOutSupported
    ? [
        {
          id: "auto-settle",
          title: m(msg("Auto-settle behavior")),
          image: "timer",
          subactions: [
            {
              id: "auto-settle:enabled",
              title: m(msg("Follow settings")),
              state: thread.autoSettleDisabledAt == null ? "on" : "off",
            },
            {
              id: "auto-settle:disabled",
              title: m(msg("Never", { $context: "never auto-settle this thread" })),
              state: thread.autoSettleDisabledAt == null ? "off" : "on",
            },
          ],
        } satisfies MenuAction,
      ]
    : [];
  const titleMenuItems = [
    {
      id: "rename",
      title: m(msg("Rename", { $context: "verb, thread action" })),
      image: "square.and.pencil",
    },
    ...buildThreadTitleRegenerationMenuItems(
      {
        supported: props.titleRegenerationSupported,
        isRegenerating: isRegeneratingTitle,
      },
      m,
    ),
    { id: "mark-unread", title: m(msg("Mark unread")), image: "envelope.badge" },
    ...(canTurnIntoProject
      ? [
          {
            id: "turn-into-project",
            title: m(msg("Turn into project")),
            image: "folder.badge.plus",
            attributes: { disabled: !props.canArchive },
          } satisfies MenuAction,
        ]
      : []),
  ];

  const localized = (action: MenuAction): MenuAction => ({ ...action, title: m(action.title) });
  const direct: MenuAction[] = [
    ...(supportsColors
      ? [
          {
            id: "color",
            title: m(msg("Color")),
            image: "circle.fill",
            subactions: [
              ...ThreadColor.literals.map((value) => ({
                id: `color:${value}`,
                title: m(colorLabels[value]),
                image: "circle.fill",
                imageColor: threadColors[value].swatch,
                state: color === value ? ("on" as const) : ("off" as const),
              })),
              {
                id: "color:clear",
                title: m(msg("Clear color")),
                state: color === null ? ("on" as const) : ("off" as const),
              },
            ],
          },
        ]
      : []),
    ...(thread.branch
      ? [
          {
            id: "new-thread-on-branch",
            title: getThreadListV2NewBranchMenuTitle(thread.branch, m),
            image: "square.and.pencil",
          },
        ]
      : []),
    { id: "copy-thread", title: m(msg("Copy thread")), image: "text.bubble" },
    { id: "copy-thread-id", title: m(msg("Copy thread ID")), image: "doc.on.doc" },
    ...(canShareWithGuest
      ? [{ id: "share-guest", title: m(msg("Share with guest")), image: "person.badge.plus" }]
      : []),
  ];
  if (props.snoozed) {
    return layoutThreadListV2RowMenuActions(
      {
        nested,
        direct: [...direct, localized(SNOOZED_MENU_ACTIONS[0]!)],
        reorder: [],
        pin: [],
        secondary: [
          ...titleMenuItems,
          ...autoSettleMenuItems,
          localized(LEGACY_MENU_ACTIONS[0]!),
          localized(SNOOZED_MENU_ACTIONS[1]!),
        ],
      },
      m,
    );
  }
  if (!props.settlementSupported) {
    return layoutThreadListV2RowMenuActions(
      {
        nested,
        direct: [...direct, localized(LEGACY_MENU_ACTIONS[0]!)],
        reorder: reorderMenuItems,
        pin: pinMenuItems,
        secondary: [...titleMenuItems, localized(LEGACY_MENU_ACTIONS[1]!)],
      },
      m,
    );
  }
  if (props.variant === "slim") {
    return layoutThreadListV2RowMenuActions(
      {
        nested,
        direct: [...direct, localized(SLIM_MENU_ACTIONS[0]!)],
        reorder: reorderMenuItems.filter(
          (action) => action.id !== "move-up" && action.id !== "move-down",
        ),
        pin: pinMenuItems,
        secondary: [
          ...titleMenuItems,
          ...autoSettleMenuItems,
          localized(LEGACY_MENU_ACTIONS[0]!),
          localized(SLIM_MENU_ACTIONS[1]!),
        ],
      },
      m,
    );
  }
  return layoutThreadListV2RowMenuActions(
    {
      nested,
      direct: [
        ...direct,
        localized(CARD_MENU_ACTIONS[0]!),
        ...(props.snoozeSecondary === "snooze"
          ? [
              {
                id: "snooze",
                title: m(msg("Snooze", { $context: "verb, thread action" })),
                image: "clock",
                subactions: snoozePresetActions,
              },
            ]
          : []),
      ],
      reorder: reorderMenuItems,
      pin: pinMenuItems,
      secondary: [
        ...titleMenuItems,
        ...autoSettleMenuItems,
        localized(LEGACY_MENU_ACTIONS[0]!),
        localized(CARD_MENU_ACTIONS[1]!),
      ],
    },
    m,
  );
}
