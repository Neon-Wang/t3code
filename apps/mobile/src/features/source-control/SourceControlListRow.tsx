import type { ReactNode } from "react";
import type { IssueListEntry } from "@t3tools/contracts";
import { Pressable, View } from "react-native";
import { useI18n } from "../../i18n/useI18n";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView, type AppSymbolName } from "../../components/ui/AppSymbol";
import { Menu } from "../../components/ui/Menu";
import type { MenuProps } from "../../components/ui/Menu.types";
import { cn } from "../../lib/cn";
import { RelativeTime } from "../../components/RelativeTime";
import {
  selectedThreadRowColors,
  THREAD_LIST_V2_SIDEBAR_ROW_STYLE,
  THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE,
} from "../threads/thread-list-v2-row-appearance";
import { PullRequestAvatar } from "../pull-requests/PullRequestPresentation";
import { pullRequestLabelColor } from "../pull-requests/pullRequestList";
export function SourceControlListRow(props: {
  item: Pick<IssueListEntry, "repository" | "number" | "title" | "author" | "labels" | "updatedAt">;
  selected: boolean;
  sidebar: boolean;
  busy: boolean;
  accessibilityLabel: string;
  status: { icon: AppSymbolName; tint: string };
  actions: MenuProps["actions"];
  onAction: (action: string) => void;
  onSelect: () => void;
  statusOverlay?: ReactNode;
  headerAccessory?: ReactNode;
  trailing?: ReactNode;
}) {
  const { t } = useI18n();
  const { item, status } = props;
  const foreground = props.selected
    ? selectedThreadRowColors.foregroundClassName
    : props.sidebar
      ? "text-drawer-foreground"
      : "text-foreground";
  const mutedForeground = props.selected
    ? selectedThreadRowColors.mutedForegroundClassName
    : props.sidebar
      ? "text-drawer-foreground-muted"
      : "text-foreground-muted";
  const tertiaryForeground = props.selected
    ? selectedThreadRowColors.mutedForegroundClassName
    : props.sidebar
      ? "text-drawer-foreground-muted"
      : "text-foreground-tertiary";
  return (
    <View style={props.sidebar ? THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE : undefined}>
      <Menu
        shouldOpenOnLongPress
        title={`#${item.number} · ${item.repository}`}
        actions={props.actions}
        onPressAction={({ nativeEvent }) => props.onAction(nativeEvent.event)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: props.selected, busy: props.busy }}
          accessibilityLabel={props.accessibilityLabel}
          accessibilityHint={t(
            "mobile.pullRequestListRow.doubleTapToOpenTouchAndHoldForQuickActions",
          )}
          onPress={() => props.onSelect()}
          disabled={props.busy}
          style={props.sidebar ? THREAD_LIST_V2_SIDEBAR_ROW_STYLE : undefined}
          className={cn(
            "flex-row gap-3 overflow-hidden",
            !props.sidebar && "px-4 active:bg-row-hover",
            props.sidebar && "bg-drawer",
            props.sidebar && !props.selected && "active:bg-thread-hover",
            props.selected && "bg-thread-selected",
            props.busy && "opacity-50",
          )}
        >
          <View className={cn("self-start", props.sidebar ? "pt-0.5" : "pt-2.5")}>
            <SymbolView name={status.icon} size={20} tintColorClassName={status.tint} />
            {props.statusOverlay}
          </View>
          <View
            className={cn(
              "min-w-0 flex-1 gap-1",
              !props.sidebar && "border-b border-border-subtle py-2.5",
            )}
          >
            <View className="flex-row items-center gap-1.5">
              <PullRequestAvatar actor={item.author} size={16} />
              <Text className={cn("min-w-0 flex-1 text-xs", mutedForeground)} numberOfLines={1}>
                {item.repository} <Text className={tertiaryForeground}>#{item.number}</Text>
              </Text>
              {props.headerAccessory}
              <Text className={cn("text-2xs tabular-nums", tertiaryForeground)}>
                <RelativeTime timestamp={item.updatedAt} />
              </Text>
            </View>
            <Text
              className={cn("text-base leading-5 font-t3-medium", foreground)}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.title}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <View className="min-w-0 flex-1 flex-row items-center gap-1">
                {item.labels.slice(0, 2).map((label) => {
                  const color = pullRequestLabelColor(label.color);
                  return (
                    <View
                      key={label.name}
                      className="min-w-0 shrink flex-row items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5"
                      style={{
                        maxWidth: 160,
                        ...(color ? { backgroundColor: `${color}20` } : {}),
                      }}
                    >
                      {color ? (
                        <View
                          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }}
                        />
                      ) : null}
                      <Text
                        className={cn("shrink text-2xs font-t3-medium", mutedForeground)}
                        numberOfLines={1}
                      >
                        {label.name}
                      </Text>
                    </View>
                  );
                })}
                {item.labels.length > 2 ? (
                  <Text className={cn("shrink-0 text-2xs", tertiaryForeground)}>
                    +{item.labels.length - 2}
                  </Text>
                ) : null}
              </View>
              {props.trailing}
            </View>
          </View>
        </Pressable>
      </Menu>
    </View>
  );
}
