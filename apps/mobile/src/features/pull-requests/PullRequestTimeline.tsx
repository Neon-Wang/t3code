import {
  TimelineEvent,
  TimelineComment as SourceControlTimelineComment,
} from "../source-control/TimelineComment";
import { type I18n, i18n } from "@t3tools/shared/i18n";
import {
  parsePullRequestAnchor,
  pullRequestAnchorMatchesUrl,
} from "@t3tools/shared/pullRequestAnchor";
import type { PullRequestActivity, PullRequestComment } from "@t3tools/contracts";
import { StackActions, type NavigationProp } from "@react-navigation/native";
import { type ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { relativeTime } from "../../lib/time";
import { PullRequestAvatar } from "./PullRequestPresentation";
import { PullRequestCommentFooter } from "./PullRequestReactions";
import { discussionCommentCountLabel } from "./pullRequestDiffComments";
import type { PullRequestParams } from "./usePullRequestDiff";

type CommentActions = {
  readonly permissions: ComponentProps<typeof PullRequestCommentFooter>["permissions"];
  readonly onChanged: () => void;
};

function TimelineComment({
  comment,
  params,
  actions,
}: {
  comment: PullRequestComment;
  params: PullRequestParams;
  actions: CommentActions;
}) {
  const target = parsePullRequestAnchor(params.navigationUrl);
  const linked =
    target?.kind === "timeline" && pullRequestAnchorMatchesUrl(target.anchor, comment.url);
  return (
    <SourceControlTimelineComment
      comment={comment}
      linked={linked}
      footer={
        <PullRequestCommentFooter
          params={params}
          comment={comment}
          permissions={actions.permissions}
          onChanged={actions.onChanged}
        />
      }
    />
  );
}

export function pullRequestTimelineRows(
  activity: PullRequestActivity,
  params: PullRequestParams,
  navigation: Pick<NavigationProp<ReactNavigation.RootParamList>, "navigate" | "dispatch">,
  actions: CommentActions,
  t: I18n["t"],
) {
  const linkTarget = parsePullRequestAnchor(params.navigationUrl);
  const discussionIds = new Set(
    activity.reviewThreads.flatMap((thread) => thread.comments.map((comment) => comment.id)),
  );
  const events = [
    ...activity.comments
      .filter((comment) => !discussionIds.has(comment.id))
      .map((comment) => ({
        key: `comment:${comment.id}`,
        date: comment.createdAt,
        content: (
          <TimelineComment
            key={
              linkTarget?.kind === "timeline" &&
              pullRequestAnchorMatchesUrl(linkTarget.anchor, comment.url)
                ? `${comment.id}:${params.navigationId ?? params.navigationUrl}`
                : comment.id
            }
            comment={comment}
            params={params}
            actions={actions}
          />
        ),
      })),
    ...activity.reviewThreads.map((thread) => ({
      key: `discussion:${thread.id}`,
      date: thread.comments[0]?.createdAt ?? "",
      content: (
        <TimelineEvent icon="text.bubble" tone={thread.isResolved ? "success" : undefined}>
          <View className="flex-row items-center gap-2">
            <PullRequestAvatar actor={thread.comments[0]?.author ?? null} size={22} />
            <Text className="flex-1 text-sm">
              <Text className="font-t3-medium">
                {thread.comments[0]?.author?.login ??
                  i18n.t("mobile.pullRequestDiscussionScreen.unknownAuthor")}
              </Text>
              <Text className="text-foreground-muted">
                {i18n.t("mobile.pullRequestTimeline.startedADiscussion")}
              </Text>
            </Text>
            {thread.comments[0] ? (
              <Text className="text-2xs text-foreground-tertiary">
                {relativeTime(thread.comments[0].createdAt)}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.t(
              thread.isResolved
                ? "mobile.pullRequestTimeline.openResolvedDiscussion"
                : "mobile.pullRequestTimeline.openUnresolvedDiscussion",
              { path: thread.path },
            )}
            onPress={() =>
              navigation.navigate("PullRequestDiscussion", { ...params, discussionId: thread.id })
            }
            className="gap-2 rounded-2xl bg-grouped-card p-3 active:opacity-70"
          >
            <View className="flex-row items-center gap-2">
              <SymbolView name="doc.text" size={14} tintColorClassName="accent-icon-muted" />
              <Text className="flex-1 font-mono text-xs" numberOfLines={2}>
                {thread.path}
                {thread.line ? `:${thread.line}` : ""}
              </Text>
              <SymbolView name="chevron.right" size={12} tintColorClassName="accent-icon-muted" />
            </View>
            <Text className="text-xs text-foreground-muted">
              {thread.isResolved
                ? i18n.t("pr.resolved")
                : i18n.t("mobile.pullRequestTimeline.unresolved")}
              {thread.isOutdated ? ` · ${i18n.t("pr.outdatedText")}` : ""} ·{" "}
              {discussionCommentCountLabel(thread.commentCount ?? thread.comments.length, t)}
            </Text>
          </Pressable>
        </TimelineEvent>
      ),
    })),
    ...activity.commits.map((commit) => ({
      key: `commit:${commit.oid}`,
      date: commit.committedDate,
      content: (
        <TimelineEvent icon="commit">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.t("mobile.PullRequestTimeline.viewCommit", {
              id: commit.oid.slice(0, 7),
              title: commit.messageHeadline,
            })}
            onPress={() =>
              navigation.dispatch(
                StackActions.push("PullRequestFile", { ...params, commit: commit.oid, path: "" }),
              )
            }
            className="flex-row items-center gap-2 active:opacity-70"
          >
            <PullRequestAvatar actor={commit.authors?.[0] ?? null} size={22} />
            <Text className="min-w-0 flex-1 text-sm" numberOfLines={1}>
              {commit.messageHeadline}
            </Text>
            <Text className="font-mono text-2xs text-foreground-muted">
              {commit.oid.slice(0, 7)}
            </Text>
          </Pressable>
        </TimelineEvent>
      ),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (activity.commentsTruncated || activity.reviewThreadsTruncated)
    events.push({
      key: "truncated",
      date: "",
      content: (
        <Text className="py-3 text-xs text-foreground-muted">
          {i18n.t("mobile.pullRequestTimeline.moreActivityIsAvailableOnTheProvider")}
        </Text>
      ),
    });
  return events;
}
