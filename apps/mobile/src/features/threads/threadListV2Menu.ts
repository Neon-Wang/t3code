import { ThreadColor } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { I18n } from "@t3tools/shared/i18n";
import type { MenuAction } from "@react-native-menu/menu";
import { threadColors } from "./thread-colors";
import { getThreadListV2NewBranchMenuTitle } from "./thread-list-v2-row-appearance";
import { buildThreadTitleRegenerationMenuItems } from "./thread-title-regeneration-menu";
import {
  layoutThreadListV2RowMenuActions,
  type resolveThreadListV2SnoozePresets,
} from "./threadListV2";

type Translate = I18n["t"];

const buildCardMenuActions = (t: Translate): MenuAction[] => [
  { id: "settle", title: t("mobile.threads.settle"), image: "checkmark" },
  {
    id: "delete",
    title: t("mobile.threads.delete"),
    image: "trash",
    attributes: { destructive: true },
  },
];

const buildSlimMenuActions = (t: Translate): MenuAction[] => [
  { id: "unsettle", title: t("mobile.threads.unSettle"), image: "arrow.uturn.backward" },
  {
    id: "delete",
    title: t("mobile.threads.delete"),
    image: "trash",
    attributes: { destructive: true },
  },
];

const buildSnoozedMenuActions = (t: Translate): MenuAction[] => [
  { id: "unsnooze", title: t("mobile.threads.wakeThread"), image: "clock" },
  {
    id: "delete",
    title: t("mobile.threads.delete"),
    image: "trash",
    attributes: { destructive: true },
  },
];

const buildLegacyMenuActions = (t: Translate): MenuAction[] => [
  { id: "archive", title: t("mobile.threads.archive"), image: "archivebox" },
  {
    id: "delete",
    title: t("mobile.threads.delete"),
    image: "trash",
    attributes: { destructive: true },
  },
];

export interface ThreadListV2MenuInput {
  readonly t: Translate;
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
  readonly snoozePresets: ReturnType<typeof resolveThreadListV2SnoozePresets>;
}

export function buildThreadListV2SnoozeMenu(
  t: Translate,
  presets: ThreadListV2MenuInput["snoozePresets"],
): MenuAction[] {
  return [
    ...presets.map((preset) => ({
      id: `snooze:${preset.id}`,
      title: preset.label,
      subtitle: preset.whenLabel,
    })),
    { id: "snooze:custom", title: t("mobile.threads.custom") },
  ];
}

export function buildThreadListV2Menu(input: ThreadListV2MenuInput): MenuAction[] {
  const { t, nested, thread, color } = input;
  const staticMenus = {
    card: buildCardMenuActions(t),
    slim: buildSlimMenuActions(t),
    snoozed: buildSnoozedMenuActions(t),
    legacy: buildLegacyMenuActions(t),
  };
  const snoozePresetActions = buildThreadListV2SnoozeMenu(t, input.snoozePresets);
  const reorderMenuItems: MenuAction[] =
    input.reorderSupported === true
      ? [
          {
            id: "arrange",
            title: t("mobile.threads.arrangeThreads"),
            image: "line.3.horizontal",
          },
          {
            id: "move-up",
            title: t("mobile.threads.moveUp"),
            image: "arrow.up",
            attributes: { disabled: input.canMoveUp !== true },
          } satisfies MenuAction,
          {
            id: "move-down",
            title: t("mobile.threads.moveDown"),
            image: "arrow.down",
            attributes: { disabled: input.canMoveDown !== true },
          } satisfies MenuAction,
        ]
      : [];
  const pinMenuItems: MenuAction[] = input.pinningSupported
    ? [
        thread.pinnedAt != null
          ? { id: "unpin", title: t("mobile.threads.unpin"), image: "pin.slash" }
          : { id: "pin", title: t("mobile.threads.pin"), image: "pin" },
      ]
    : [];
  const autoSettleMenuItems: MenuAction[] = input.autoSettleOptOutSupported
    ? [
        {
          id: "auto-settle",
          title: t("mobile.threads.autoSettleBehavior"),
          image: "timer",
          subactions: [
            {
              id: "auto-settle:enabled",
              title: t("mobile.threadListV2Items.followSettings"),
              state: thread.autoSettleDisabledAt == null ? "on" : "off",
            },
            {
              id: "auto-settle:disabled",
              title: t("settings.misc.never"),
              state: thread.autoSettleDisabledAt == null ? "off" : "on",
            },
          ],
        } satisfies MenuAction,
      ]
    : [];
  const titleMenuItems: MenuAction[] = [
    { id: "rename", title: t("mobile.threads.rename"), image: "square.and.pencil" },
    ...buildThreadTitleRegenerationMenuItems({
      supported: input.titleRegenerationSupported,
      isRegenerating: input.isRegeneratingTitle,
    }),
    ...(input.canTurnIntoProject
      ? [
          {
            id: "turn-into-project",
            title: t("mobile.threadListV2Items.turnIntoProject"),
            image: "folder.badge.plus",
            attributes: { disabled: !input.canArchive },
          } satisfies MenuAction,
        ]
      : []),
  ];
  const colorMenuItems: MenuAction[] = input.supportsColors
    ? [
        {
          id: "color",
          title: t("thread.color.label"),
          image: "circle.fill",
          subactions: [
            ...ThreadColor.literals.map((value) => ({
              id: `color:${value}`,
              title: t(`thread.color.${value}`),
              image: "circle.fill",
              imageColor: threadColors[value].swatch,
              state: color === value ? ("on" as const) : ("off" as const),
            })),
            {
              id: "color:clear",
              title: t("thread.color.clear"),
              state: color === null ? "on" : "off",
            },
          ],
        },
      ]
    : [];

  const direct: MenuAction[] = [
    ...colorMenuItems,
    ...(thread.branch
      ? [
          {
            id: "new-thread-on-branch",
            title: getThreadListV2NewBranchMenuTitle(thread.branch),
            image: "square.and.pencil",
          },
        ]
      : []),
    { id: "copy-thread", title: t("mobile.threadListV2Items.copyThread"), image: "text.bubble" },
    { id: "copy-thread-id", title: t("mobile.threads.copyThreadID"), image: "doc.on.doc" },
  ];
  if (input.snoozed) {
    return layoutThreadListV2RowMenuActions({
      t,
      nested,
      direct: [...direct, staticMenus.snoozed[0]!],
      reorder: [],
      pin: [],
      secondary: [
        ...titleMenuItems,
        ...autoSettleMenuItems,
        staticMenus.legacy[0]!,
        staticMenus.snoozed[1]!,
      ],
    });
  }
  if (!input.settlementSupported) {
    return layoutThreadListV2RowMenuActions({
      t,
      nested,
      direct: [...direct, staticMenus.legacy[0]!],
      reorder: reorderMenuItems,
      pin: pinMenuItems,
      secondary: [...titleMenuItems, staticMenus.legacy[1]!],
    });
  }
  if (input.variant === "slim") {
    return layoutThreadListV2RowMenuActions({
      t,
      nested,
      direct: [...direct, staticMenus.slim[0]!],
      reorder: reorderMenuItems.filter(
        (action) => action.id !== "move-up" && action.id !== "move-down",
      ),
      pin: pinMenuItems,
      secondary: [
        ...titleMenuItems,
        ...autoSettleMenuItems,
        staticMenus.legacy[0]!,
        staticMenus.slim[1]!,
      ],
    });
  }
  return layoutThreadListV2RowMenuActions({
    t,
    nested,
    direct: [
      ...direct,
      staticMenus.card[0]!,
      ...(input.snoozeSecondary === "snooze"
        ? [
            {
              id: "snooze",
              title: t("mobile.threads.snooze"),
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
      staticMenus.legacy[0]!,
      staticMenus.card[1]!,
    ],
  });
}
