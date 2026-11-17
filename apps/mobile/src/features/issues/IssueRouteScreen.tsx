import { LabelPill } from "../source-control/LabelPill";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { issueTimeline } from "@t3tools/client-runtime/issues";
import { executeAtomQuery, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RegistryContext } from "@effect/atom-react";
import type { IssueActivity } from "@t3tools/contracts";
import { use, useRef, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SymbolView } from "../../components/ui/AppSymbol";
import { Menu } from "../../components/ui/Menu";
import { RelativeTime } from "../../components/RelativeTime";
import { useI18n } from "../../i18n/useI18n";
import { issueEnvironment } from "../../state/issues";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useAndroidWorkspaceBack } from "../layout/workspace/useAndroidWorkspaceNavigation";
import { SourceControlMarkdownRepository } from "../source-control/SourceControlMarkdown";
import { ReactionPills } from "../source-control/ReactionPills";
import { TimelineComment, TimelineEvent } from "../source-control/TimelineComment";
import { PullRequestAvatar } from "../pull-requests/PullRequestPresentation";
import { PullRequestDescription } from "../pull-requests/PullRequestDescription";
import { issueTarget, issueStatus, type IssueParams } from "./issueTarget";
import { useIssuePermissions } from "./useIssuePermissions";
import { useIssueAction } from "./useIssueAction";

export function IssueRouteScreen({ route }: StaticScreenProps<IssueParams>) {
  return <IssueDetail key={JSON.stringify(issueTarget(route.params))} params={route.params} />;
}
function IssueDetail({ params }: { params: IssueParams }) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const registry = use(RegistryContext);
  const back = useAndroidWorkspaceBack("issues");
  const target = issueTarget(params);
  const detail = useEnvironmentQuery(issueEnvironment.detail(target));
  const activity = useEnvironmentQuery(issueEnvironment.activity(target));
  const issue = detail.data;
  const permissions = useIssuePermissions(params, issue);
  const update = useAtomCommand(issueEnvironment.update, { reportFailure: false });
  const setReaction = useAtomCommand(issueEnvironment.setReaction, { reportFailure: false });
  const invalidate = useAtomCommand(issueEnvironment.invalidate, { reportFailure: false });
  const action = useIssueAction();
  const [section, setSection] = useState<"overview" | "activity">("overview");
  const [expanded, setExpanded] = useState(false);
  const [extra, setExtra] = useState<{ head: IssueActivity | null; pages: IssueActivity[] }>({
    head: activity.data,
    pages: [],
  });
  if (extra.head !== activity.data) setExtra({ head: activity.data, pages: [] });
  const pages = activity.data
    ? [activity.data, ...(extra.head === activity.data ? extra.pages : [])]
    : [];
  const cursor = pages.at(-1)?.nextCursor;
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const pending = useRef(false);
  const loadMore = async () => {
    if (!cursor || pending.current) return;
    pending.current = true;
    setLoadingMore(true);
    setPageError(null);
    try {
      const result = await executeAtomQuery(
        registry,
        issueEnvironment.activity({ ...target, input: { ...target.input, cursor } }),
        { reportFailure: false },
      );
      if (result._tag === "Failure") {
        setPageError(String(squashAtomCommandFailure(result)));
        return;
      }
      setExtra((previous) =>
        previous.head === activity.data
          ? { ...previous, pages: [...previous.pages, result.value] }
          : previous,
      );
    } finally {
      pending.current = false;
      setLoadingMore(false);
    }
  };
  const refresh = () => {
    setPageError(null);
    void action
      .run(() =>
        invalidate({ environmentId: target.environmentId, input: { reference: target.input } }),
      )
      .then((success) => {
        if (success) {
          detail.refresh();
          activity.refresh();
        }
      });
  };
  const identity = issue ?? params.initialSummary;
  const status = identity ? issueStatus(identity) : null;
  const stateActions =
    issue?.state === "open"
      ? [
          { id: "completed", title: t("issue.completed") },
          { id: "not_planned", title: t("issue.notPlanned") },
        ]
      : [{ id: "open", title: t("issue.reopen") }];
  const changeState = (id: string) => {
    if (!permissions.close || action.busy) return;
    if (id === "open" || id === "completed" || id === "not_planned")
      void action.run(() =>
        update({
          ...target,
          input: {
            ...target.input,
            state: id === "open" ? "open" : "closed",
            ...(id !== "open" ? { closeReason: id } : {}),
          },
        }),
      );
  };
  return (
    <SourceControlMarkdownRepository params={params} changeRequest={issue}>
      <View className="flex-1 bg-screen">
        <AppBar
          title={`#${params.number}`}
          subtitle={params.repository}
          onBack={back}
          menus={[
            {
              title: t("issue.title"),
              icon: "ellipsis",
              items: [
                {
                  id: "browser",
                  title: t("mobile.linkedPullRequests.openInBrowser"),
                  onPress: () => {
                    if (identity) void tryOpenExternalUrl(identity.url, "pull-request");
                  },
                },
                {
                  id: "title",
                  title: t("pr.editTitle"),
                  disabled: !permissions.edit,
                  onPress: () => navigation.navigate("IssueEdit", { ...params, field: "title" }),
                },
                {
                  id: "body",
                  title: t("pr.editDescription"),
                  disabled: !permissions.edit,
                  onPress: () => navigation.navigate("IssueEdit", { ...params, field: "body" }),
                },
              ],
            },
          ]}
        />
        <ScreenContent>
          <ScreenScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            refreshControl={
              <RefreshControl
                refreshing={(detail.isPending || action.busy) && !!identity}
                onRefresh={refresh}
              />
            }
          >
            {detail.error || action.error ? (
              <View className="gap-2 pb-4">
                <Text selectable className="text-danger-foreground">
                  {detail.error ?? action.error}
                </Text>
                <Button label={t("action.retry")} onPress={refresh} />
              </View>
            ) : null}
            {!identity && detail.isPending ? <AppActivityIndicator className="my-8" /> : null}
            {identity && status ? (
              <View className="gap-5">
                <View className="gap-3">
                  <Menu
                    accessibilityLabel={status.label}
                    actions={stateActions.map((a) => ({
                      ...a,
                      attributes: { disabled: !permissions.close || action.busy },
                    }))}
                    onPressAction={({ nativeEvent }) => changeState(nativeEvent.event)}
                  >
                    <View className="min-h-8 flex-row items-center gap-1.5">
                      <SymbolView name={status.icon} size={14} tintColorClassName={status.tint} />
                      <Text className="text-xs font-t3-medium">{status.label}</Text>
                    </View>
                  </Menu>
                  <Text selectable className="text-xl font-t3-bold leading-7">
                    {identity.title}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <PullRequestAvatar actor={identity.author} size={20} />
                    <Text className="min-w-0 flex-1 text-xs font-t3-medium">
                      {identity.author?.login}
                    </Text>
                    <Text className="text-2xs text-foreground-muted">
                      <RelativeTime timestamp={identity.updatedAt} />
                    </Text>
                  </View>
                </View>
                <SegmentedControl
                  options={[
                    { value: "overview", label: t("mobile.pullRequestRouteScreen.overview") },
                    { value: "activity", label: t("mobile.pullRequestRouteScreen.activity") },
                  ]}
                  selected={section}
                  onSelect={setSection}
                  role="tab"
                  size="compact"
                />
                {section === "overview" && issue ? (
                  <>
                    <View className="flex-row flex-wrap gap-2">
                      {issue.labels.map((label) => (
                        <LabelPill key={label.name} label={label} />
                      ))}
                      {permissions.labels ? (
                        <Chip
                          label={t("action.edit")}
                          icon="tag"
                          size="small"
                          accessibilityLabel={t("mobile.pullRequestRouteScreen.editLabels")}
                          onPress={() =>
                            navigation.navigate("IssuePicker", { ...params, kind: "labels" })
                          }
                        />
                      ) : null}
                    </View>
                    <View className="gap-2">
                      <Text className="text-sm font-t3-medium">{t("issue.assignees")}</Text>
                      <View className="flex-row flex-wrap items-center gap-2">
                        {issue.assignees.map((actor) => (
                          <View key={actor.login} className="flex-row items-center gap-1.5">
                            <PullRequestAvatar actor={actor} size={20} />
                            <Text className="text-xs">{actor.login}</Text>
                          </View>
                        ))}
                        {permissions.assignees ? (
                          <Chip
                            label={t("action.edit")}
                            size="small"
                            accessibilityLabel={t("issue.changeAssignees")}
                            onPress={() =>
                              navigation.navigate("IssuePicker", { ...params, kind: "assignees" })
                            }
                          />
                        ) : null}
                      </View>
                    </View>
                    <PullRequestDescription
                      onCollapse={() => setExpanded(false)}
                      markdown={issue.body}
                      expanded={expanded}
                      onExpandedChange={setExpanded}
                      footer={
                        <View className="flex-row flex-wrap gap-1.5">
                          <ReactionPills
                            reactions={activity.data?.reactions ?? []}
                            canReact={permissions.react}
                            onChanged={activity.refresh}
                            setReaction={(content, reacted) =>
                              setReaction({
                                ...target,
                                input: { ...target.input, content, reacted },
                              })
                            }
                          />
                        </View>
                      }
                    />
                  </>
                ) : section === "activity" ? (
                  <View>
                    {activity.error || pageError ? (
                      <View className="gap-2 pb-4">
                        <Text selectable className="text-danger-foreground">
                          {activity.error ?? pageError}
                        </Text>
                        <Button
                          label={t("action.retry")}
                          onPress={pageError ? () => void loadMore() : refresh}
                        />
                      </View>
                    ) : null}
                    {activity.isPending && !activity.data ? (
                      <AppActivityIndicator className="my-8" />
                    ) : null}
                    {issueTimeline(pages).map((row) =>
                      row.kind === "comment" ? (
                        <TimelineComment
                          key={row.id}
                          comment={row.comment}
                          footer={
                            <View className="flex-row flex-wrap items-center gap-1.5">
                              <ReactionPills
                                reactions={row.comment.reactions ?? []}
                                canReact={permissions.react}
                                onChanged={activity.refresh}
                                setReaction={(content, reacted) =>
                                  setReaction({
                                    ...target,
                                    input: {
                                      ...target.input,
                                      subjectId: row.comment.id,
                                      content,
                                      reacted,
                                    },
                                  })
                                }
                              />
                              {permissions.editComment(row.comment) ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={t("pr.editComment")}
                                  className="ml-auto min-h-8 flex-row items-center gap-1 px-2.5"
                                  onPress={() =>
                                    navigation.navigate("IssueEdit", {
                                      ...params,
                                      field: "comment",
                                      comment: row.comment,
                                    })
                                  }
                                >
                                  <SymbolView
                                    name="pencil"
                                    size={13}
                                    tintColorClassName="accent-icon-muted"
                                  />
                                  <Text className="text-xs text-foreground-muted">
                                    {t("action.edit")}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          }
                        />
                      ) : (
                        <TimelineEvent
                          key={row.id}
                          icon={row.event.kind === "closed" ? "checkmark.circle" : "circle"}
                        >
                          <Text className="text-sm">
                            {row.event.actor?.login}{" "}
                            {t(
                              row.event.kind === "assigned"
                                ? "issue.assignedEvent"
                                : row.event.kind === "cross-referenced"
                                  ? "issue.crossReferenced"
                                  : `issue.${row.event.kind}`,
                            )}{" "}
                            {row.event.label?.name ?? row.event.assignee?.login}
                          </Text>
                          <Text className="text-2xs text-foreground-muted">
                            <RelativeTime timestamp={row.at} />
                          </Text>
                        </TimelineEvent>
                      ),
                    )}
                    {!activity.isPending && !activity.error && issueTimeline(pages).length === 0 ? (
                      <Text className="py-6 text-foreground-muted">{t("issue.noActivity")}</Text>
                    ) : null}
                    {cursor ? (
                      <Button
                        label={t("issue.moreActivity")}
                        disabled={loadingMore}
                        onPress={() => void loadMore()}
                      />
                    ) : null}
                  </View>
                ) : null}
                <Button
                  label={t("pr.comment")}
                  disabled={!permissions.comment || action.busy}
                  onPress={() =>
                    navigation.navigate("IssueEdit", { ...params, field: "newComment" })
                  }
                />
              </View>
            ) : null}
          </ScreenScrollView>
        </ScreenContent>
      </View>
    </SourceControlMarkdownRepository>
  );
}
