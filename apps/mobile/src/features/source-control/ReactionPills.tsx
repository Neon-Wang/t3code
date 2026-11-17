import { useI18n } from "../../i18n/useI18n";
import {
  applyPendingPullRequestReactions,
  PULL_REQUEST_REACTION_ORDER,
  pullRequestReactionEmoji,
  pullRequestReactionName,
  pullRequestReactionTooltip,
  pullRequestReactionsSignature,
} from "@t3tools/client-runtime/pull-request-reactions";
import type { PullRequestReaction, PullRequestReactionContent } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { Menu } from "../../components/ui/Menu";
import { cn } from "../../lib/cn";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
const EMPTY_PENDING: ReadonlyMap<PullRequestReactionContent, boolean> = new Map();
const PILL = "min-h-8 flex-row items-center gap-1 rounded-full border px-2.5 active:opacity-70";

export function ReactionPills(props: {
  readonly reactions: ReadonlyArray<PullRequestReaction>;
  readonly canReact: boolean;
  readonly setReaction: (
    content: PullRequestReactionContent,
    reacted: boolean,
  ) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly onChanged: () => void;
}) {
  const { t } = useI18n();
  // Keyed by what the host last reported, so a refresh that lands the change drops the overlay.
  const [pending, setPending] = useState({ signature: "", values: EMPTY_PENDING });
  const signature = pullRequestReactionsSignature(props.reactions);
  const values = pending.signature === signature ? pending.values : EMPTY_PENDING;
  const shown = applyPendingPullRequestReactions(props.reactions, values);
  const toggle = async (content: PullRequestReactionContent, reacted: boolean) => {
    setPending({ signature, values: new Map([...values, [content, reacted]]) });
    const result = await props.setReaction(content, reacted);
    if (AsyncResult.isFailure(result)) {
      setPending((current) => {
        const next = new Map(current.values);
        next.delete(content);
        return { signature: current.signature, values: next };
      });
      Dialog.alert(
        t("mobile.pullRequestReactions.couldntSaveReaction"),
        t("mobile.pullRequestReactions.tryAgainInAMoment"),
      );
      return;
    }
    props.onChanged();
  };
  return (
    <>
      {shown.map((reaction) => (
        <Pressable
          key={reaction.content}
          accessibilityRole="button"
          accessibilityLabel={pullRequestReactionTooltip(reaction)}
          accessibilityState={{ selected: reaction.viewerHasReacted, disabled: !props.canReact }}
          disabled={!props.canReact}
          onPress={() => void toggle(reaction.content, !reaction.viewerHasReacted)}
          className={cn(
            PILL,
            reaction.viewerHasReacted
              ? "border-primary bg-primary/10"
              : "border-border-subtle bg-grouped-card",
          )}
        >
          <Text className="text-sm">{pullRequestReactionEmoji(reaction.content)}</Text>
          <Text className="text-xs font-t3-medium text-foreground-muted">{reaction.count}</Text>
        </Pressable>
      ))}
      {props.canReact ? (
        <Menu
          accessibilityLabel={t("mobile.pullRequestReactions.addAReaction")}
          actions={PULL_REQUEST_REACTION_ORDER.map((content) => ({
            id: content,
            title: `${pullRequestReactionEmoji(content)}  ${pullRequestReactionName(content)}`,
            state: shown.some(
              (reaction) => reaction.content === content && reaction.viewerHasReacted,
            )
              ? ("on" as const)
              : ("off" as const),
          }))}
          onPressAction={({ nativeEvent }) => {
            const content = PULL_REQUEST_REACTION_ORDER.find((id) => id === nativeEvent.event);
            if (!content) return;
            const reacted = shown.some(
              (reaction) => reaction.content === content && reaction.viewerHasReacted,
            );
            void toggle(content, !reacted);
          }}
        >
          <View className={cn(PILL, "border-border-subtle")}>
            <SymbolView name="face.smiling" size={15} tintColorClassName="accent-icon-muted" />
          </View>
        </Menu>
      ) : null}
    </>
  );
}
