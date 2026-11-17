import { pullRequestProjectKey } from "../pullRequest/PullRequestListFilters";
import type { EnvironmentId, ProjectId, IssueListInput, IssueListResult } from "@t3tools/contracts";
import { environmentIssueKey, groupIssues, mergeIssueLists } from "@t3tools/client-runtime/issues";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  CircleDotIcon,
  CircleCheckIcon,
  LayersIcon,
  TagIcon,
  UserIcon,
  AtSignIcon,
  GlobeIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useDebouncedValue } from "~/state/queries";
import { useI18n } from "~/hooks/useI18n";
import { useIssueLists, useIssueFilterOptions, issueEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { usePullRequestScope } from "../pullRequest/usePullRequestListView";
import { ListColumn } from "../sourceControl/ListColumn";
import { CompactFilterMenu } from "../sourceControl/CompactFilterMenu";
import { SearchInput } from "../sourceControl/ListFilters";
import { ListRowLines, ListRowAuthor } from "../sourceControl/ListRow";
import { PullRequestLabelChip } from "../pullRequest/pullRequestPresentation";
import { IssueIcon } from "./IssueIcon";
import { IssueDetailPanel } from "./IssueDetailPanel";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SidebarInset } from "../ui/sidebar";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
import { Menu, MenuTrigger, MenuPopup, MenuCheckboxItem } from "../ui/menu";

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
  group?: "repository" | "state" | "none";
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
          ...(next.group ? { group: next.group } : {}),
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
  const entries = mergeIssueLists([...currentPage.previous, ...list.values]);
  const groups = groupIssues(entries, search.group ?? "repository");
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
    { value: "assigned" as const, label: t("issue.assigned"), Icon: UserIcon },
    { value: "authored" as const, label: t("issue.authored"), Icon: UserIcon },
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
            outlined
            label={t("issue.groupRepository")}
            value={search.group ?? "repository"}
            options={[
              { value: "repository", label: t("issue.groupRepository"), Icon: LayersIcon },
              { value: "state", label: t("issue.groupState"), Icon: CircleDotIcon },
              { value: "none", label: t("issue.groupNone"), Icon: LayersIcon },
            ]}
            onChange={(group) => update({ group })}
          />
        }
        filtersMenu={
          <Menu open={filtersOpen} onOpenChange={setFiltersOpen}>
            <MenuTrigger render={<Button variant="outline" />}>
              <TagIcon className="size-4" />
              {t("pr.labels")}
              {search.labels?.length ? ` (${search.labels.length})` : ""}
            </MenuTrigger>
            <MenuPopup>
              <SearchInput
                label={t("pr.searchLabels")}
                placeholder={t("pr.searchLabels")}
                value={labelQuery}
                onChange={setLabelQuery}
                onSubmit={setLabelQuery}
              />
              {options.values.some(([, value]) => value.truncated) ? (
                <p className="p-2 text-xs text-muted-foreground">{t("pr.labelsTruncated")}</p>
              ) : null}
              {options.isPending ? <Spinner /> : null}
              {options.error ? (
                <p role="alert" className="p-2 text-xs text-destructive">
                  {options.error}
                </p>
              ) : null}
              {[...new Set([...labels.map((label) => label.name), ...(search.labels ?? [])])].map(
                (label) => (
                  <MenuCheckboxItem
                    key={label}
                    checked={search.labels?.includes(label) ?? false}
                    disabled={!search.labels?.includes(label) && (search.labels?.length ?? 0) >= 10}
                    onCheckedChange={(checked) =>
                      update({
                        labels: checked
                          ? [...(search.labels ?? []), label]
                          : search.labels?.filter((item) => item !== label),
                      })
                    }
                  >
                    {label}
                  </MenuCheckboxItem>
                ),
              )}
            </MenuPopup>
          </Menu>
        }
        rightPanelControl={null}
        titlebarControls={null}
        rightPanelOpen={selected !== null}
        maximizedAway={false}
        scrollRef={scrollRef}
        listBody={
          <>
            <div className="flex flex-wrap items-center gap-1">
              <CompactFilterMenu
                label={t("pr.filterByState")}
                value={search.state}
                options={stateOptions}
                onChange={(state) => update({ state })}
              />
              <CompactFilterMenu
                label={t("pr.filterByInvolvement")}
                value={search.involvement}
                options={involvementOptions}
                onChange={(involvement) => update({ involvement })}
              />
              <CompactFilterMenu
                label={t("issue.allProjects")}
                value={scopedProject ? pullRequestProjectKey(scopedProject) : ""}
                options={[
                  { value: "", label: t("issue.allProjects"), Icon: LayersIcon },
                  ...projects.map((project) => ({
                    value: pullRequestProjectKey(project),
                    label: project.title,
                    Icon: LayersIcon,
                  })),
                ]}
                onChange={(key) => {
                  const project = projects.find(
                    (project) => pullRequestProjectKey(project) === key,
                  );
                  update({ projectId: project?.id, environmentId: project?.environmentId });
                }}
              />
            </div>
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
            {groups.map((group) => (
              <section key={group.key} className="space-y-1">
                {group.key ? (
                  <h2 className="flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground">
                    {search.group === "state"
                      ? group.key === "open"
                        ? t("pr.stateOpen")
                        : t("pr.closed")
                      : group.key}
                    <span>{group.entries.length}</span>
                  </h2>
                ) : null}
                {group.entries.map((entry) => (
                  <button
                    type="button"
                    key={environmentIssueKey(entry)}
                    className={`group/pr-row flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left hover:bg-accent/60 ${selected?.environmentId === entry.environmentId && selected.reference.projectId === entry.projectId && selected.reference.number === entry.number && selected.reference.repository === entry.repository ? "bg-accent" : ""}`}
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
                    <IssueIcon state={entry.state} closeReason={entry.closeReason} />
                    <ListRowLines
                      number={
                        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          #{entry.number}
                        </span>
                      }
                      title={entry.title}
                      updatedAt={entry.updatedAt}
                      meta={
                        <>
                          <ListRowAuthor actor={entry.author} />
                          <span className="truncate">{entry.repository}</span>
                          {entry.labels.map((label) => (
                            <PullRequestLabelChip key={label.name} label={label} />
                          ))}
                        </>
                      }
                    />
                  </button>
                ))}
              </section>
            ))}
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
        <aside className="h-full min-w-0 w-1/2 min-[1100px]:w-[640px] shrink-0 border-l border-border max-md:absolute max-md:inset-0 max-md:w-full">
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
