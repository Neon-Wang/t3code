import type { EnvironmentId, IssueListInput, ProjectId } from "@t3tools/contracts";
import { FolderGit2Icon, LayersIcon, ListFilterIcon, TagIcon } from "lucide-react";

import { useI18n } from "~/hooks/useI18n";
import type { ProjectFaviconProject } from "../ProjectFavicon";
import {
  PullRequestFilterRadioSubmenu,
  pullRequestProjectKey,
  type PullRequestFilterOption,
} from "../pullRequest/PullRequestListFilters";
import { pullRequestLabelColor } from "../pullRequest/pullRequestList.logic";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSearchInput,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";

const ALL_PROJECTS_VALUE = "all";
const MAX_LABELS = 10;

type IssueInvolvement = NonNullable<IssueListInput["involvement"]>;

/** The Issues page's "Filters" menu, laid out like the pull request one. */
export function IssueFiltersMenu({
  onOpenChange,
  state,
  stateOptions,
  onState,
  involvement,
  involvementOptions,
  onInvolvement,
  labels,
  labelOptions,
  labelQuery,
  onLabelQuery,
  labelsPending,
  labelsError,
  labelsTruncated,
  onLabels,
  projects,
  projectId,
  projectEnvironmentId,
  onProject,
}: {
  onOpenChange: (open: boolean) => void;
  state: IssueListInput["state"];
  stateOptions: ReadonlyArray<PullRequestFilterOption<IssueListInput["state"]>>;
  onState: (state: IssueListInput["state"]) => void;
  involvement: IssueInvolvement;
  involvementOptions: ReadonlyArray<PullRequestFilterOption<IssueInvolvement>>;
  onInvolvement: (involvement: IssueInvolvement) => void;
  labels: ReadonlyArray<string>;
  labelOptions: ReadonlyArray<{ readonly name: string; readonly color: string | null }>;
  labelQuery: string;
  onLabelQuery: (query: string) => void;
  labelsPending: boolean;
  labelsError: string | null;
  labelsTruncated: boolean;
  onLabels: (labels: ReadonlyArray<string> | undefined) => void;
  projects: ReadonlyArray<ProjectFaviconProject & { readonly id: ProjectId }>;
  projectId: ProjectId | undefined;
  projectEnvironmentId: EnvironmentId | undefined;
  onProject: (projectId: ProjectId | undefined, environmentId: EnvironmentId | undefined) => void;
}) {
  const { t } = useI18n();
  const filterCount = [state !== "open", involvement !== "all", projectId, ...labels].filter(
    Boolean,
  ).length;
  const selected = new Set(labels.map((name) => name.toLowerCase()));
  const visibleLabels = [
    ...labels
      .filter(
        (name) => !labelOptions.some((option) => option.name.toLowerCase() === name.toLowerCase()),
      )
      .map((name) => ({ name, color: null })),
    ...labelOptions,
  ];
  const projectValue =
    projectId === undefined || projectEnvironmentId === undefined
      ? ALL_PROJECTS_VALUE
      : pullRequestProjectKey({ id: projectId, environmentId: projectEnvironmentId });
  const projectOptions: ReadonlyArray<PullRequestFilterOption<string>> = [
    { value: ALL_PROJECTS_VALUE, label: t("pr.allProjects"), Icon: LayersIcon },
    ...projects.map((project) => ({
      value: pullRequestProjectKey(project),
      label: project.title,
      Icon: FolderGit2Icon,
      project,
    })),
  ];
  return (
    <Menu onOpenChange={onOpenChange}>
      <MenuTrigger render={<Button variant="outline" />}>
        <ListFilterIcon className="size-4" />
        <span>{t("pr.filters")}</span>
        {filterCount > 0 ? (
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
            {filterCount}
          </span>
        ) : null}
      </MenuTrigger>
      <MenuPopup align="end" side="bottom">
        <PullRequestFilterRadioSubmenu
          label={t("pr.state")}
          value={state}
          options={stateOptions}
          onChange={onState}
        />
        <PullRequestFilterRadioSubmenu
          label={t("pr.involvement")}
          value={involvement}
          options={involvementOptions}
          onChange={onInvolvement}
        />
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            <TagIcon aria-hidden className="size-3.5" />
            <span className="flex-1">{t("pr.labels")}</span>
            <span className="text-xs text-muted-foreground">
              {labels.length === 0 ? t("pr.any") : t("pr.valueSelected", { arg0: labels.length })}
            </span>
          </MenuSubTrigger>
          <MenuSubPopup>
            <MenuSearchInput
              autoFocus
              busy={labelsPending}
              value={labelQuery}
              onChange={(event) => onLabelQuery(event.currentTarget.value)}
              placeholder={t("pr.searchLabels")}
              aria-label={t("pr.searchLabels")}
            />
            {labelsTruncated ? (
              <p className="max-w-64 px-2 py-1 text-xs text-muted-foreground">
                {t("pr.labelsTruncated")}
              </p>
            ) : null}
            {visibleLabels.length === 0 && !labelsPending ? (
              <MenuItem disabled>
                {labelsError === null ? t("pr.noLabelsFound") : t("pr.couldNotSearchLabels")}
              </MenuItem>
            ) : null}
            {visibleLabels.map((option) => {
              const key = option.name.toLowerCase();
              const dot = pullRequestLabelColor(option.color);
              const checked = selected.has(key);
              return (
                <MenuCheckboxItem
                  key={key}
                  checked={checked}
                  disabled={!checked && labels.length >= MAX_LABELS}
                  onCheckedChange={(next) => {
                    const remaining = labels.filter((name) => name.toLowerCase() !== key);
                    const updated = next ? [...labels, option.name] : remaining;
                    onLabels(updated.length === 0 ? undefined : updated);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
                      {...(dot ? { style: { backgroundColor: dot } } : {})}
                    />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  </span>
                </MenuCheckboxItem>
              );
            })}
          </MenuSubPopup>
        </MenuSub>
        <MenuSeparator />
        <PullRequestFilterRadioSubmenu
          label={t("pr.project")}
          value={projectValue}
          options={projectOptions}
          onChange={(next) => {
            const project = projects.find((candidate) => pullRequestProjectKey(candidate) === next);
            if (project) onProject(project.id, project.environmentId);
            else if (projectId !== undefined) onProject(undefined, undefined);
          }}
        />
      </MenuPopup>
    </Menu>
  );
}
