import { SourceControlListRow } from "../source-control/SourceControlListRow";
import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../i18n/useI18n";
import {
  capitalizeTerm,
  sourceControlClients,
} from "@t3tools/client-runtime/source-control-clients";
import { memo } from "react";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import type { MenuProps } from "../../components/ui/Menu.types";
import { cn } from "../../lib/cn";
import { selectedThreadRowColors } from "../threads/thread-list-v2-row-appearance";
import { PullRequestConflictBadge, PullRequestDiffStats } from "./PullRequestPresentation";
import {
  pullRequestListReviewStatus,
  pullRequestListRowsAreEqual,
  type EnvironmentPullRequestListEntry,
} from "./pullRequestList";
import {
  pullRequestChecksStatus,
  pullRequestConflict,
  pullRequestStatus,
} from "./pullRequestStatus";
import { PullRequestGlyph } from "./pullRequestGlyphs";

export const PullRequestListRow = memo(
  function PullRequestListRow(props: {
    readonly item: EnvironmentPullRequestListEntry;
    readonly onSelect: (item: EnvironmentPullRequestListEntry) => void;
    readonly selected: boolean;
    readonly sidebar: boolean;
    readonly busy: boolean;
    readonly getActions: (item: EnvironmentPullRequestListEntry) => MenuProps["actions"];
    readonly onAction: (item: EnvironmentPullRequestListEntry, action: string) => void;
  }) {
    const { t } = useI18n();
    const { item } = props;
    const mutedForeground = props.selected
      ? selectedThreadRowColors.mutedForegroundClassName
      : props.sidebar
        ? "text-drawer-foreground-muted"
        : "text-foreground-muted";
    const status = pullRequestStatus(item);
    const conflict = pullRequestConflict(item);
    const review = pullRequestListReviewStatus(item);
    const checks = item.checksState ? pullRequestChecksStatus(item.checksState) : null;
    const accessibilityLabel = [
      `${capitalizeTerm(sourceControlClients.get(item.provider).changeRequest.singular)} ${item.number}`,
      item.title,
      status.label,
      conflict ? conflict.label.toLowerCase() : null,
      t("mobile.pullRequestListRow.byAuthor", {
        author: item.author?.login ?? t("mobile.pullRequestListRow.unknownAuthor"),
      }),
      review ? review.accessibleLabel : null,
      item.checksState
        ? t("mobile.pullRequestListRow.checksState", { state: item.checksState })
        : null,
      item.stack
        ? t("mobile.pullRequestListRow.stackPosition", {
            position: item.stack.position,
            size: item.stack.size,
          })
        : null,
      item.labels.length ? item.labels.map((label) => label.name).join(", ") : null,
      t("mobile.pullRequestListRow.additionsDeletions", {
        additions: item.additions,
        deletions: item.deletions,
      }),
    ]
      .filter(Boolean)
      .join(t("mobile.pullRequestListRow.separator"));
    return (
      <SourceControlListRow
        item={item}
        selected={props.selected}
        sidebar={props.sidebar}
        busy={props.busy}
        accessibilityLabel={accessibilityLabel}
        status={status}
        actions={props.getActions(item)}
        onAction={(action) => props.onAction(item, action)}
        onSelect={() => props.onSelect(item)}
        statusOverlay={
          conflict ? (
            <PullRequestConflictBadge
              surfaceClassName={
                props.selected
                  ? "text-thread-selected"
                  : props.sidebar
                    ? "text-drawer"
                    : "text-screen"
              }
            />
          ) : null
        }
        headerAccessory={
          item.stack ? (
            <View className="flex-row items-center gap-1">
              <SymbolView
                name={PullRequestGlyph.stack}
                size={12}
                tintColorClassName={
                  props.selected
                    ? selectedThreadRowColors.mutedIconTintClassName
                    : props.sidebar
                      ? "accent-drawer-foreground-muted"
                      : "accent-foreground-muted"
                }
              />
              <Text className={cn("text-2xs tabular-nums", mutedForeground)}>
                {item.stack.position}/{item.stack.size}
              </Text>
            </View>
          ) : null
        }
        trailing={
          <>
            {" "}
            {checks ? (
              <View
                className="shrink-0"
                accessibilityLabel={i18n.t("mobile.PullRequestListRow.checks", {
                  status: item.checksState ?? "",
                })}
              >
                <SymbolView name={checks.icon} size={13} tintColorClassName={checks.tint} />
              </View>
            ) : null}
            {review ? (
              <View className="shrink-0" accessibilityLabel={review.accessibleLabel}>
                <SymbolView name={review.icon} size={13} tintColorClassName={review.tint} />
              </View>
            ) : null}
            {item.additions || item.deletions ? (
              <PullRequestDiffStats additions={item.additions} deletions={item.deletions} compact />
            ) : null}
          </>
        }
      />
    );
  },
  (previous, next) =>
    pullRequestListRowsAreEqual(previous.item, next.item) &&
    previous.selected === next.selected &&
    previous.sidebar === next.sidebar &&
    previous.busy === next.busy &&
    previous.onSelect === next.onSelect &&
    previous.onAction === next.onAction &&
    previous.getActions === next.getActions,
);
