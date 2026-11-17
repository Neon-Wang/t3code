import { useAtomValue } from "@effect/atom-react";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { environmentIssueKey } from "@t3tools/client-runtime/issues";
import { ProjectId, type IssueListInput } from "@t3tools/contracts";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, Platform, RefreshControl, ScrollView, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { useContentTopInset } from "../../components/ui/useBarInset";
import { useI18n } from "../../i18n/useI18n";
import { useProjects } from "../../state/entities";
import { useWorkspaceState } from "../../state/workspace";
import { environmentServerConfigsAtom } from "../../state/server";
import { useDebouncedValue } from "../../state/queries";
import { NativeScrollView } from "../../native/NativeScrollViewMarker";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { SourceControlListRow } from "../source-control/SourceControlListRow";
import { ListFilterMenu } from "../layout/workspace/ListFilterMenu";
import { useWorkspaceTabs } from "../layout/workspace/WorkspaceTabsContext";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";
import type { PullRequestFilterMenu } from "../pull-requests/PullRequestListFilters";
import { issueStatus } from "./issueTarget";
import { DEFAULT_ISSUE_LIST_CONTROLS, useIssueListControls } from "./issueList";
import { useSearchScrollRestoration } from "../layout/workspace/useSearchScrollRestoration";
import { useIssueList } from "./useIssueList";

export function IssuesScreen(
  props: {
    sidebar?: boolean;
    renderFrame?: (filters: PullRequestFilterMenu | null, list: ReactNode) => ReactNode;
  } = {},
) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const workspace = useWorkspaceTabs()!;
  const tab = workspace.state.tabs.issues;
  const top = useContentTopInset();
  const listRef = useRef<LegendListRef>(null);
  const [initialScrollOffset] = useState(() => workspace.getScrollOffset("issues"));
  useSearchScrollRestoration(tab.searchMode, () => {
    void listRef.current?.scrollToOffset({ offset: tab.scrollOffset, animated: false });
  });
  const selected = useNavigationState(
    (state) =>
      state.routes.findLast((route) => route.name === "Issue")?.params as
        | import("./issueTarget").IssueParams
        | undefined,
  );
  const [controls, setControls] = useIssueListControls();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const { environments } = useWorkspaceState();
  const projects = useProjects();
  const select = useSelectWorkspaceDetail();
  const query = useDebouncedValue(
    tab.searchMode === "resting" ? "" : tab.query.trim().slice(0, 200),
    180,
  );
  const targets = useMemo(
    () =>
      environments
        .filter(
          (e) =>
            configs.has(e.environmentId) &&
            (!controls.environmentId || e.environmentId === controls.environmentId),
        )
        .map((e) => ({
          environmentId: e.environmentId,
          input: {
            state: controls.state,
            involvement: controls.involvement,
            ...(controls.projectId ? { projectId: ProjectId.make(controls.projectId) } : {}),
            ...(query ? { query } : {}),
            filters: {
              ...(controls.labels.length
                ? { labels: controls.labels.map((label) => [label]) }
                : {}),
              ...(controls.author ? { author: controls.author } : {}),
            },
            limit: 50,
          } satisfies IssueListInput,
        })),
    [environments, configs, controls, query],
  );
  const result = useIssueList(targets);
  const entries = useMemo(
    () =>
      [...result.entries].sort((a, b) =>
        controls.sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : controls.sort === "oldest"
            ? a.updatedAt.localeCompare(b.updatedAt)
            : b.updatedAt.localeCompare(a.updatedAt),
      ),
    [result.entries, controls.sort],
  );
  const choices = (
    field: string,
    entries: readonly (readonly [string, string])[],
    selected: string,
  ) =>
    entries.map(([id, title]) => ({
      id: `${field}:${id}`,
      title,
      state: id === selected ? ("on" as const) : ("off" as const),
    }));
  const states = [
    ["open", t("pr.stateOpen")],
    ["closed", t("pr.closed")],
    ["all", t("mobile.pullRequestListFilters.allStates")],
  ] as const;
  const involvement = [
    ["all", t("issue.title")],
    ["assigned", t("issue.assigned")],
    ["authored", t("issue.authored")],
    ["mentioned", t("issue.mentioned")],
  ] as const;
  const openPicker = (kind: "labels" | "authors") =>
    navigation.navigate("IssueFilterSearch", {
      kind,
      targets: targets.flatMap((target) =>
        projects
          .filter(
            (p) =>
              p.environmentId === target.environmentId &&
              (!controls.projectId || p.id === controls.projectId) &&
              p.repositoryIdentity,
          )
          .map((p) => ({ environmentId: target.environmentId, projectId: p.id })),
      ),
    });
  const onSelect = (id: string) => {
    if (id === "labels" || id === "authors") {
      openPicker(id);
      return;
    }
    if (id === "reset") {
      setControls(DEFAULT_ISSUE_LIST_CONTROLS);
      return;
    }
    const [field, ...rest] = id.split(":");
    const value = rest.join(":");
    if (field === "environment")
      setControls({ ...controls, environmentId: value || null, projectId: null });
    if (field === "project") {
      const project = projects.find((p) => `${p.environmentId}/${p.id}` === value);
      setControls({
        ...controls,
        environmentId: project?.environmentId ?? controls.environmentId,
        projectId: project?.id ?? null,
      });
    }
    if (field === "sort" && (value === "updated" || value === "created" || value === "oldest"))
      setControls({ ...controls, sort: value });
    if (field === "state" && (value === "open" || value === "closed" || value === "all"))
      setControls({ ...controls, state: value });
    if (
      field === "involvement" &&
      (value === "all" || value === "assigned" || value === "authored" || value === "mentioned")
    )
      setControls({ ...controls, involvement: value });
  };
  const menus = [
    {
      id: "environment",
      title: t("mobile.navigation.environments"),
      subactions: choices(
        "environment",
        [
          ["", t("mobile.threadListFilters.allEnvironments")],
          ...environments.map((e) => [e.environmentId, e.environmentLabel] as const),
        ],
        controls.environmentId ?? "",
      ),
    },
    { id: "state", title: t("pr.state"), subactions: choices("state", states, controls.state) },
    {
      id: "involvement",
      title: t("issue.title"),
      subactions: choices("involvement", involvement, controls.involvement),
    },
    { id: "labels", title: t("pr.labels") },
    { id: "authors", title: t("pr.author") },
    {
      id: "project",
      title: t("issue.allProjects"),
      subactions: choices(
        "project",
        [
          ["", t("issue.allProjects")],
          ...projects
            .filter(
              (p) =>
                (!controls.environmentId || p.environmentId === controls.environmentId) &&
                p.repositoryIdentity,
            )
            .map((p) => [`${p.environmentId}/${p.id}`, p.title] as const),
        ],
        controls.projectId ? `${controls.environmentId}/${controls.projectId}` : "",
      ),
    },
    {
      id: "sort",
      title: t("pr.sort"),
      subactions: choices(
        "sort",
        [
          ["updated", t("pr.recentlyUpdated")],
          ["created", t("mobile.pullRequestListFilters.newestCreated")],
          ["oldest", t("mobile.pullRequestListFilters.oldestUpdated")],
        ],
        controls.sort,
      ),
    },
    { id: "reset", title: t("mobile.pullRequestListFilters.resetFilters") },
  ];
  const filters = {
    actions: menus,
    onSelect,
    customized: JSON.stringify(controls) !== JSON.stringify(DEFAULT_ISSUE_LIST_CONTROLS),
  };
  const list = (
    <LegendList
      ref={listRef}
      initialScrollOffset={initialScrollOffset}
      data={entries}
      renderScrollComponent={(p) => <NativeScrollView {...p} />}
      keyExtractor={environmentIssueKey}
      renderItem={({ item }) => (
        <SourceControlListRow
          item={item}
          sidebar={props.sidebar === true}
          selected={
            selected?.environmentId === item.environmentId &&
            selected.projectId === item.projectId &&
            selected.repository === item.repository &&
            selected.number === item.number
          }
          busy={false}
          status={issueStatus(item)}
          accessibilityLabel={`Issue ${item.number}, ${item.title}, ${issueStatus(item).label}`}
          onSelect={() => {
            Keyboard.dismiss();
            select({ name: "Issue", params: { ...item, initialSummary: item } });
          }}
          actions={[{ id: "browser", title: t("mobile.linkedPullRequests.openInBrowser") }]}
          onAction={() => void tryOpenExternalUrl(item.url, "pull-request")}
        />
      )}
      estimatedItemSize={100}
      recycleItems
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: top, paddingBottom: workspace.bottomClearance + 16 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      onScroll={(event) =>
        workspace.recordScrollOffset("issues", event.nativeEvent.contentOffset.y)
      }
      refreshControl={
        <RefreshControl
          refreshing={(result.pending || result.busy) && result.entries.length > 0}
          onRefresh={result.refresh}
        />
      }
      ListHeaderComponent={
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 8 }}
          >
            {menus.map((menu) => (
              <ListFilterMenu
                key={menu.id}
                label={
                  menu.id === "state"
                    ? states.find(([v]) => v === controls.state)![1]
                    : menu.id === "involvement"
                      ? involvement.find(([v]) => v === controls.involvement)![1]
                      : menu.id === "labels" && controls.labels.length
                        ? t("mobile.pullRequestListFilters.labelsCount", {
                            count: controls.labels.length,
                          })
                        : menu.id === "authors" && controls.author
                          ? controls.author
                          : menu.title
                }
                accessibilityLabel={menu.title}
                actions={
                  "subactions" in menu ? menu.subactions! : [{ id: menu.id, title: menu.title }]
                }
                onSelect={onSelect}
              />
            ))}
          </ScrollView>
          {[...new Set(result.errors)].map((error) => (
            <Text key={error} selectable className="px-4 py-2 text-sm text-danger-foreground">
              {error}
            </Text>
          ))}
          {result.errors.length && result.entries.length ? (
            <View className="px-4 pb-3">
              <Button label={t("action.retry")} onPress={result.refresh} />
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        result.pending ? (
          <AppActivityIndicator className="my-8" />
        ) : (
          <EmptyState
            title={t("issue.empty")}
            detail={t("issue.emptyDescription")}
            variant="plain"
            action={
              result.errors.length ? (
                <Button label={t("action.retry")} onPress={result.refresh} />
              ) : undefined
            }
          />
        )
      }
      ListFooterComponent={
        result.hasMore ? (
          <View className="p-4">
            <Button
              label={t("issue.loadMore")}
              disabled={result.busy}
              onPress={() => void result.loadMore()}
            />
          </View>
        ) : null
      }
    />
  );
  return props.renderFrame ? props.renderFrame(filters, list) : list;
}
