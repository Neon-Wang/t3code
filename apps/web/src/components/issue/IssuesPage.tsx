import type { EnvironmentId, ProjectId, IssueListInput, IssueListResult } from "@t3tools/contracts";
import {
  environmentIssueKey,
  mergeIssueLists,
  type EnvironmentIssueEntry,
} from "@t3tools/client-runtime/issues";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowDownUpIcon,
  AtSignIcon,
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  CircleCheckIcon,
  CircleDotIcon,
  ClockIcon,
  GlobeIcon,
  LayersIcon,
  MessageSquareIcon,
  PenLineIcon,
  UserRoundCheckIcon,
  UsersIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { useDebouncedValue } from "~/state/queries";
import { useI18n } from "~/hooks/useI18n";
import { useIssueLists, useIssueFilterOptions, issueEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { usePullRequestScope } from "../pullRequest/usePullRequestListView";
import { ListColumn } from "../sourceControl/ListColumn";
import { CompactFilterMenu } from "../sourceControl/CompactFilterMenu";
import { SearchInput } from "../sourceControl/ListFilters";
import { ListRowLines, ListRowAuthor } from "../sourceControl/ListRow";
import {
  PULL_REQUEST_ROW_CLASS,
  PULL_REQUEST_ROW_NUMBER_CLASS,
} from "../pullRequest/PullRequestListRow";
import { PullRequestGroupHeader } from "../pullRequest/PullRequestListGroups";
import { PullRequestRowLabels } from "../pullRequest/PullRequestRow";
import { IssueIcon } from "./IssueIcon";
import { IssueFiltersMenu } from "./IssueFiltersMenu";
import { IssueDetailPanel } from "./IssueDetailPanel";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SidebarInset } from "../ui/sidebar";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";

export type IssueListSort = "updated" | "newest" | "oldest" | "comments";

const ISSUE_SORTS: Record<
  IssueListSort,
  (left: EnvironmentIssueEntry, right: EnvironmentIssueEntry) => number
> = {
  updated: (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  newest: (left, right) => right.createdAt.localeCompare(left.createdAt),
  oldest: (left, right) => left.createdAt.localeCompare(right.createdAt),
  comments: (left, right) =>
    right.commentCount - left.commentCount || right.updatedAt.localeCompare(left.updatedAt),
};

type IssueGroupKey = "authored" | "assigned" | "others";
const ISSUE_GROUP_ICONS = {
  authored: PenLineIcon,
  assigned: UserRoundCheckIcon,
  others: UsersIcon,
};

/** Mirrors the pull request list: the viewer's own issues, then ones assigned to them. */
function groupIssuesByInvolvement(
  entries: ReadonlyArray<EnvironmentIssueEntry>,
  viewerOf: (entry: EnvironmentIssueEntry) => string | undefined,
) {
  const buckets: Record<IssueGroupKey, EnvironmentIssueEntry[]> = {
    authored: [],
    assigned: [],
    others: [],
  };
  for (const entry of entries) {
    const viewer = viewerOf(entry)?.toLowerCase();
    if (viewer && entry.author?.login.toLowerCase() === viewer) buckets.authored.push(entry);
    else if (viewer && entry.assignees.some((actor) => actor.login.toLowerCase() === viewer))
      buckets.assigned.push(entry);
    else buckets.others.push(entry);
  }
  return (["authored", "assigned", "others"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, entries: buckets[key] }));
}

export interface IssuesSearch {
  state: IssueListInput["state"];
  involvement: NonNullable<IssueListInput["involvement"]>;
  environmentId?: EnvironmentId;
  projectId?: ProjectId;
  selectedProjectId?: ProjectId;
  selectedEnvironmentId?: EnvironmentId;
  selectedHost?: string;
  repository?: string;
  number?: number;
  host?: string;
  q?: string | undefined;
  labels?: string[];
  order?: IssueListSort;
}

export function IssuesPage() {
  const { t } = useI18n();
  const search = useSearch({ from: "/_chat/issues" });
  const navigate = useNavigate({ from: "/issues" });
  const update = (patch: { [K in keyof IssuesSearch]?: IssuesSearch[K] | undefined }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        return {
          state: next.state ?? previous.state,
          involvement: next.involvement ?? previous.involvement,
          ...(next.environmentId ? { environmentId: next.environmentId } : {}),
          ...(next.projectId ? { projectId: next.projectId } : {}),
          ...(next.selectedProjectId ? { selectedProjectId: next.selectedProjectId } : {}),
          ...(next.selectedEnvironmentId
            ? { selectedEnvironmentId: next.selectedEnvironmentId }
            : {}),
          ...(next.selectedHost ? { selectedHost: next.selectedHost } : {}),
          ...(next.host ? { host: next.host } : {}),
          ...(next.repository ? { repository: next.repository } : {}),
          ...(next.number ? { number: next.number } : {}),
          ...(next.q ? { q: next.q } : {}),
          ...(next.labels ? { labels: next.labels } : {}),
          ...(next.order && next.order !== "updated" ? { order: next.order } : {}),
        };
      },
      replace: true,
    });
  const {
    environmentQueries,
    scopedProject,
    scopedProjectId,
    selectedProject,
    projects,
    expectedHosts,
  } = usePullRequestScope({ ...search, state: "all", involvement: "all" });
  const query = useDebouncedValue(search.q?.trim() ?? "", 250);
  const scrollRef = useRef<HTMLDivElement>(null);
  const targets = environmentQueries.map(({ environmentId, projectIds }) => ({
    environmentId,
    input: {
      state: search.state,
      involvement: search.involvement,
      limit: 99,
      ...(scopedProjectId ? { projectId: scopedProjectId } : {}),
      ...(projectIds ? { projectIds } : {}),
      ...(search.host ? { host: search.host } : {}),
      ...(query ? { query } : {}),
      ...(search.labels?.length
        ? { filters: { labels: search.labels.map((label) => [label]) } }
        : {}),
    } satisfies IssueListInput,
  }));
  const scope = JSON.stringify(targets);
  const [pagination, setPagination] = useState<{
    scope: string;
    previous: ReadonlyArray<readonly [EnvironmentId, IssueListResult]>;
    cursors: Record<string, IssueListResult["nextCursors"]> | null;
  }>({ scope, previous: [], cursors: null });
  if (pagination.scope !== scope) setPagination({ scope, previous: [], cursors: null });
  const currentPage = pagination.scope === scope ? pagination : { previous: [], cursors: null };
  const list = useIssueLists(
    targets.flatMap((target) =>
      currentPage.cursors === null
        ? [target]
        : currentPage.cursors[target.environmentId]
          ? [
              {
                ...target,
                input: { ...target.input, cursors: currentPage.cursors[target.environmentId] },
              },
            ]
          : [],
    ),
  );
  const pages = [...currentPage.previous, ...list.values];
  const entries = mergeIssueLists(pages).toSorted(ISSUE_SORTS[search.order ?? "updated"]);
  const viewers = new Map(pages.map(([environmentId, page]) => [environmentId, page.viewers]));
  const groups =
    search.involvement === "all"
      ? groupIssuesByInvolvement(entries, (entry) => viewers.get(entry.environmentId)?.[entry.host])
      : [{ key: null, entries }];
  const groupLabels = {
    authored: t("pr.authored"),
    assigned: t("issue.assigned"),
    others: t("pr.others"),
  };
  const next = Object.fromEntries(
    list.values
      .filter(([, page]) => Object.keys(page.nextCursors).length > 0)
      .map(([id, page]) => [id, page.nextCursors]),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [labelQuery, setLabelQuery] = useState("");
  const labelSearch = useDebouncedValue(labelQuery.trim().slice(0, 100), 250);
  const options = useIssueFilterOptions(
    filtersOpen
      ? projects
          .filter(
            (project) =>
              (!scopedProjectId || project.id === scopedProjectId) &&
              project.repositoryIdentity?.provider === "github",
          )
          .map((project) => ({
            environmentId: project.environmentId,
            input: {
              projectId: project.id,
              kind: "labels" as const,
              ...(labelSearch ? { query: labelSearch } : {}),
              ...(search.host ? { host: search.host } : {}),
            },
          }))
      : [],
  );
  const labels = [
    ...new Map(
      options.values.flatMap(([, value]) => value.labels).map((label) => [label.name, label]),
    ).values(),
  ];
  const invalidate = useAtomCommand(issueEnvironment.invalidate);
  const refresh = () => {
    setPagination({ scope, previous: [], cursors: null });
    for (const { environmentId } of targets) void invalidate({ environmentId, input: {} });
  };
  const stateOptions = [
    { value: "open" as const, label: t("pr.stateOpen"), Icon: CircleDotIcon },
    { value: "closed" as const, label: t("pr.closed"), Icon: CircleCheckIcon },
    { value: "all" as const, label: t("pr.all"), Icon: LayersIcon },
  ];
  const involvementOptions = [
    { value: "all" as const, label: t("pr.all"), Icon: LayersIcon },
    { value: "assigned" as const, label: t("issue.assigned"), Icon: UserRoundCheckIcon },
    { value: "authored" as const, label: t("issue.authored"), Icon: PenLineIcon },
    { value: "mentioned" as const, label: t("issue.mentioned"), Icon: AtSignIcon },
  ];
  const selected =
    search.repository && search.number && selectedProject
      ? {
          environmentId: selectedProject.environmentId,
          reference: {
            projectId: selectedProject.id,
            repository: search.repository,
            number: search.number,
            ...((search.selectedHost ?? search.host)
              ? { host: search.selectedHost ?? search.host }
              : {}),
          },
        }
      : null;
  return (
    <SidebarInset className="h-dvh min-h-0 flex-row overflow-hidden">
      <ListColumn
        title={t("issue.title")}
        scopeLabel={t("issue.title")}
        breadcrumbLabel={t("issue.title")}
        area="issues"
        stateOptions={stateOptions}
        involvementOptions={involvementOptions}
        searchLabel={t("issue.search")}
        refreshLabel={t("issue.refresh")}
        refreshing={list.isPending}
        onRefresh={refresh}
        searchValue={search.q ?? ""}
        involvement={search.involvement}
        state={search.state}
        host={search.host}
        hostMenuOptions={[
          { value: "", label: t("pr.all"), Icon: GlobeIcon },
          ...expectedHosts.map(({ host }) => ({ value: host, label: host, Icon: GlobeIcon })),
        ]}
        onInvolvement={(involvement) => update({ involvement })}
        onState={(state) => update({ state })}
        onHost={(host) => update({ host })}
        searchInput={
          <SearchInput
            value={search.q ?? ""}
            label={t("issue.search")}
            placeholder={t("issue.searchPlaceholder")}
            busy={list.isPending}
            onChange={(q) => update({ q })}
            onSubmit={(q) => update({ q })}
          />
        }
        sortMenu={
          <CompactFilterMenu
            label={t("pr.sort")}
            triggerIcon={<ArrowDownUpIcon aria-hidden className="size-4" />}
            triggerLabel={t("pr.sort")}
            outlined
            value={search.order ?? "updated"}
            options={[
              { value: "updated", label: t("pr.recentlyUpdated"), Icon: ClockIcon },
              { value: "newest", label: t("pr.newestShown"), Icon: CalendarArrowDownIcon },
              { value: "oldest", label: t("pr.oldestShown"), Icon: CalendarArrowUpIcon },
              { value: "comments", label: t("pr.comments"), Icon: MessageSquareIcon },
            ]}
            onChange={(order) => update({ order })}
          />
        }
        filtersMenu={
          <IssueFiltersMenu
            onOpenChange={setFiltersOpen}
            state={search.state}
            stateOptions={stateOptions}
            onState={(state) => update({ state })}
            involvement={search.involvement}
            involvementOptions={involvementOptions}
            onInvolvement={(involvement) => update({ involvement })}
            labels={search.labels ?? []}
            labelOptions={labels}
            labelQuery={labelQuery}
            onLabelQuery={setLabelQuery}
            labelsPending={options.isPending}
            labelsError={options.error}
            labelsTruncated={options.values.some(([, value]) => value.truncated)}
            onLabels={(labels) => update({ labels: labels ? [...labels] : undefined })}
            projects={projects}
            projectId={scopedProject?.id}
            projectEnvironmentId={scopedProject?.environmentId}
            onProject={(projectId, environmentId) => update({ projectId, environmentId })}
          />
        }
        rightPanelControl={null}
        titlebarControls={null}
        rightPanelOpen={selected !== null}
        maximizedAway={false}
        scrollRef={scrollRef}
        listBody={
          <>
            {list.error ? (
              <p role="alert" className="text-xs text-destructive">
                {list.error}
              </p>
            ) : null}
            {list.values.flatMap(([id, page]) =>
              page.errors.map((error) => (
                <p
                  key={`${id}:${error.projectId}:${error.message}`}
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {error.message}
                </p>
              )),
            )}
            <div className="space-y-3">
              {groups.map((group) => (
                <section key={group.key ?? "all"} className="space-y-0.5">
                  {group.key ? (
                    <PullRequestGroupHeader
                      group={{ key: group.key, label: groupLabels[group.key] }}
                      count={group.entries.length}
                      icon={ISSUE_GROUP_ICONS[group.key]}
                    />
                  ) : null}
                  {group.entries.map((entry) => {
                    const isSelected =
                      selected?.environmentId === entry.environmentId &&
                      selected.reference.projectId === entry.projectId &&
                      selected.reference.number === entry.number &&
                      selected.reference.repository === entry.repository;
                    return (
                      <button
                        type="button"
                        key={environmentIssueKey(entry)}
                        aria-current={isSelected ? "true" : undefined}
                        className={cn(
                          PULL_REQUEST_ROW_CLASS,
                          "cursor-pointer px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                          isSelected ? "bg-accent" : "hover:bg-accent/60",
                        )}
                        onClick={() =>
                          update({
                            repository: entry.repository,
                            number: entry.number,
                            selectedProjectId: entry.projectId,
                            selectedEnvironmentId: entry.environmentId,
                            selectedHost: entry.host,
                          })
                        }
                      >
                        <IssueIcon
                          state={entry.state}
                          closeReason={entry.closeReason}
                          className="mt-0.75 self-start"
                        />
                        <ListRowLines
                          number={
                            <span className={PULL_REQUEST_ROW_NUMBER_CLASS}>#{entry.number}</span>
                          }
                          title={entry.title}
                          status={
                            entry.commentCount > 0 ? (
                              <span
                                className="inline-flex items-center gap-1 font-mono text-muted-foreground tabular-nums"
                                aria-label={`${t("pr.comments")} ${entry.commentCount}`}
                              >
                                <MessageSquareIcon aria-hidden className="size-3" />
                                {entry.commentCount}
                              </span>
                            ) : null
                          }
                          metaClassName="@container/pr-row-meta"
                          meta={
                            <>
                              <ListRowAuthor
                                actor={entry.author}
                                className="min-w-3.5 max-w-40"
                                labelClassName="sr-only @xs/pr-row-meta:not-sr-only @xs/pr-row-meta:truncate"
                              />
                              <span className="truncate">{entry.repository}</span>
                              <PullRequestRowLabels labels={entry.labels} />
                            </>
                          }
                          updatedAt={entry.updatedAt}
                        />
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
            {list.isPending ? <Spinner /> : null}
            {!list.isPending && entries.length === 0 && !list.error ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("issue.empty")}</EmptyTitle>
                  <EmptyDescription>{t("issue.emptyDescription")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {Object.keys(next).length > 0 ? (
              <Button
                variant="outline"
                disabled={list.isPending}
                onClick={() =>
                  setPagination({
                    scope,
                    previous: [...currentPage.previous, ...list.values],
                    cursors: next,
                  })
                }
              >
                {t("issue.loadMore")}
              </Button>
            ) : null}
          </>
        }
      />
      {selected ? (
        // Below md the detail covers the list, so its header lines up beside the floating sidebar toggle.
        <aside className="h-full min-w-0 w-1/2 min-[1100px]:w-[640px] shrink-0 border-l border-border max-md:absolute max-md:inset-0 max-md:w-full max-md:bg-background max-md:pt-3 max-md:[&_[data-detail-crumbs]]:pl-(--workspace-titlebar-content-left)">
          <IssueDetailPanel
            key={`${selected.environmentId}:${selected.reference.projectId}:${selected.reference.repository}:${selected.reference.number}`}
            {...selected}
            onClose={() =>
              update({
                number: undefined,
                repository: undefined,
                selectedProjectId: undefined,
                selectedEnvironmentId: undefined,
                selectedHost: undefined,
              })
            }
          />
        </aside>
      ) : null}
    </SidebarInset>
  );
}
