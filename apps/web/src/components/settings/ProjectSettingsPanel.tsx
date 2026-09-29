import { useI18n } from "~/hooks/useI18n";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/unstable/reactivity";
import { type EnvironmentId, type ProjectIconOverride } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { InfoIcon, Trash2Icon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import {
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProjectFavicon } from "../ProjectFavicon";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";
import { ProjectActionsSettings } from "./ProjectActionsSettings";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { projectGroupTitleNeedsUpdate } from "./ProjectSettingsPanel.logic";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";

const ProjectIconPickerDialog = lazy(() =>
  import("./ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

function memberKey(member: { environmentId: string; id: string }): string {
  return `${member.environmentId}:${member.id}`;
}

/** `project` is the Projects page shortcut: the new-thread defaults people change most. */
export type ProjectSettingsCategory = "general" | "integrations" | "source-control" | "project";

export function ProjectSettingsPanel({
  projectKey,
  environmentId = null,
  checkoutKey = null,
}: {
  projectKey: string;
  environmentId?: EnvironmentId | null;
  checkoutKey?: string | null;
}) {
  const { t } = useI18n();
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate({ from: "/settings" });
  const pathname = useLocation({ select: (location) => location.pathname });

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const members = useMemo(
    () =>
      selected?.memberProjects.filter(
        (member) =>
          (environmentId === null || member.environmentId === environmentId) &&
          (checkoutKey === null || member.physicalProjectKey === checkoutKey),
      ) ?? [],
    [selected, environmentId, checkoutKey],
  );

  // Remember the members of the last rendered group so a grouping-rule change
  // (which changes the group key) can follow the project to its new group.
  const lastSelectionRef = useRef<{
    key: string;
    environmentId: EnvironmentId | null;
    checkoutKey: string | null;
    memberKeys: string[];
  } | null>(null);
  useEffect(() => {
    if (!selected || members.length === 0) return;
    lastSelectionRef.current = {
      key: selected.projectKey,
      environmentId,
      checkoutKey,
      memberKeys: members.map((member) => member.physicalProjectKey),
    };
  }, [selected, members, environmentId, checkoutKey]);

  // A grouping-rule change replaces the group key mid-visit; follow the
  // project to its new key instead of parking on the not-found state.
  useEffect(() => {
    if (members.length > 0) return;
    const last = lastSelectionRef.current;
    if (
      last?.key !== projectKey ||
      last.environmentId !== environmentId ||
      last.checkoutKey !== checkoutKey
    )
      return;
    const successor = groups.find((group) =>
      group.memberProjects.some((member) => last.memberKeys.includes(member.physicalProjectKey)),
    );
    if (successor) {
      void navigate({
        to: pathname,
        search: () => ({
          project: successor.projectKey,
          machine: environmentId ?? undefined,
          checkout: checkoutKey ?? undefined,
        }),
        replace: true,
        hashScrollIntoView: false,
      });
    }
  }, [groups, navigate, pathname, projectKey, members.length, environmentId, checkoutKey]);

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0
          ? t("settings.projectSettingsPanel.addAProjectFromTheSidebarToConfigure")
          : t("settings.projectSettingsPanel.thisProjectIsNoLongerAvailable")}
      </div>
    );
  }
  if (members.length === 0)
    return (
      <p className="p-8 text-sm text-muted-foreground">
        {t("settings.projectSettingsPanel.thisCheckoutIsNoLongerAvailableInThe")}
      </p>
    );
  const scopedGroup = {
    ...selected,
    memberProjects: members,
    environmentId: members[0]!.environmentId,
    id: members[0]!.id,
  };
  return (
    <ProjectDetail
      key={`${selected.projectKey}:${environmentId ?? "all"}:${checkoutKey ?? "all"}`}
      group={scopedGroup}
      hasOtherMembers={members.length < selected.memberProjects.length}
    />
  );
}

function ProjectDetail({
  group,
  hasOtherMembers,
}: {
  group: SidebarProjectSnapshot;
  hasOtherMembers: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate({ from: "/settings" });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const representative =
    group.memberProjects.find(
      (member) => environmentById.get(member.environmentId)?.serverConfig != null,
    ) ?? group.memberProjects[0]!;
  const threads = useThreadShells();
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const projectNameEditedRef = useRef(false);

  const faviconPath = representative.faviconPath ?? null;
  const projectIcon = representative.projectIcon ?? null;
  const pickProjectFavicon =
    typeof window !== "undefined" &&
    group.memberProjects.every(
      (member) =>
        member.environmentId === primaryEnvironmentId &&
        canPickExternalProjectFavicon(member.workspaceRoot, navigator.platform),
    )
      ? window.desktopBridge?.pickProjectFavicon
      : undefined;

  const reportFailure = useCallback(
    (title: string, result: AtomCommandResult<void, unknown>) => {
      if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title,
          description:
            error instanceof Error
              ? error.message
              : t("settings.projectSettingsPanel.anErrorOccurred"),
        }),
      );
    },
    [t],
  );

  // Group-shared fields live on each physical project record, so a
  // group-level edit fans out to every member.
  const updateAllMembers = useCallback(
    async (
      input: Partial<{
        title: string;
        faviconPath: string | null;
        projectIcon: ProjectIconOverride | null;
      }>,
      failureTitle: string,
    ): Promise<AtomCommandResult<void, unknown>> => {
      const unavailable = group.memberProjects.find((member) => {
        const environment = environmentById.get(member.environmentId);
        return environment?.connection.phase !== "connected" || !environment.serverConfig;
      });
      if (unavailable) {
        const error = new Error(
          t("settings.projectSettingsPanel.connectEnvironmentAndTryAgain", {
            environment:
              unavailable.environmentLabel ?? t("settings.misc.selectedEnvironmentDefinite"),
          }),
        );
        const result: AtomCommandResult<void, unknown> = AsyncResult.failure(Cause.fail(error));
        reportFailure(failureTitle, result);
        return result;
      }
      for (const member of group.memberProjects) {
        const result = mapAtomCommandResult(
          await updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, ...input },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          // A partial fan-out is possible: earlier members already took the
          // write. Name the environment so the user knows where it stopped.
          reportFailure(
            group.memberProjects.length > 1
              ? t("settings.projectSettingsPanel.failureTitleOnEnvironment", {
                  failureTitle: failureTitle,
                  environment: member.environmentLabel ?? t("settings.misc.currentEnvironment"),
                })
              : failureTitle,
            result,
          );
          return result;
        }
      }
      return AsyncResult.success(undefined);
    },
    [t, environmentById, group.memberProjects, reportFailure, updateProject],
  );

  const renameGroup = useCallback(
    async (nextTitle: string, wasEdited: boolean) => {
      const title = nextTitle.trim();
      if (!title) {
        toastManager.add({
          type: "warning",
          title: t("settings.projectSettingsPanel.projectTitleCannotBeEmpty"),
        });
        return;
      }
      if (
        !projectGroupTitleNeedsUpdate(
          group.memberProjects.map((member) => member.title),
          title,
          wasEdited,
        )
      ) {
        return;
      }
      await updateAllMembers({ title }, t("settings.projectSettingsPanel.failedToRenameProject"));
    },
    [t, group.memberProjects, updateAllMembers],
  );

  // ----- project icon -----
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setProjectIcon = useCallback(
    async (input: { faviconPath: string | null; projectIcon: ProjectIconOverride | null }) => {
      if (savingFaviconRef.current) return;
      savingFaviconRef.current = true;
      setIsSavingFavicon(true);
      try {
        await updateAllMembers(input, t("settings.projectSettingsPanel.failedToUpdateProjectIcon"));
      } finally {
        savingFaviconRef.current = false;
        setIsSavingFavicon(false);
      }
    },
    [t, updateAllMembers],
  );

  const hasMultipleCheckouts = group.memberProjects.length > 1;

  const removeMembers = useCallback(
    async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
      const api = readLocalApi();
      if (!api) return;

      const memberKeys = new Set(members.map(memberKey));
      const projectThreads = threads.filter((thread) =>
        memberKeys.has(`${thread.environmentId}:${thread.projectId}`),
      );
      const isWholeGroup = members.length === group.memberProjects.length;
      const targetKind =
        hasOtherMembers || !isWholeGroup
          ? t("settings.misc.checkout")
          : t("settings.misc.projectNoun");
      const singleMember = members.length === 1 ? members[0]! : null;
      const targetLabel = singleMember?.title ?? group.displayName;
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            projectThreads.length > 0
              ? t("settings.misc.removeProjectWithThreads", {
                  targetKind,
                  targetLabel,
                  count: projectThreads.length,
                })
              : t("settings.projectSettingsPanel.removeTargetKindTargetLabel", {
                  targetKind: targetKind,
                  targetLabel: targetLabel,
                }),
            ...(singleMember
              ? [
                  t("settings.projectSettingsPanel.pathPath", { path: singleMember.workspaceRoot }),
                  ...(singleMember.environmentLabel
                    ? [
                        t("settings.projectSettingsPanel.environmentEnvironment", {
                          environment: singleMember.environmentLabel,
                        }),
                      ]
                    : []),
                ]
              : [
                  t("settings.projectSettingsPanel.thisRemovesCountGroupedProjectEntries", {
                    count: members.length,
                  }),
                ]),
            ...(projectThreads.length > 0
              ? [
                  t(
                    "settings.projectSettingsPanel.thisPermanentlyClearsConversationHistoryForThoseThreads",
                  ),
                ]
              : [
                  t(
                    "settings.projectSettingsPanel.thisPermanentlyClearsAnyArchivedConversationHistory",
                  ),
                ]),
            isWholeGroup && !hasOtherMembers
              ? t("settings.projectSettingsPanel.thisRemovesOnlyTheProjectEntriesNotThe")
              : t("settings.projectSettingsPanel.otherEntriesInThisGroupedProjectAreUnaffected"),
            t("settings.projectSettingsPanel.thisActionCannotBeUndone"),
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;

      const draftStore = useComposerDraftStore.getState();
      for (const member of members) {
        const memberThreads = projectThreads.filter(
          (thread) =>
            thread.environmentId === member.environmentId && thread.projectId === member.id,
        );
        const result = mapAtomCommandResult(
          await deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              force: true,
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          reportFailure(
            t("settings.projectSettingsPanel.failedToRemoveTitle", { title: member.title }),
            result,
          );
          return;
        }
        const projectRef = scopeProjectRef(member.environmentId, member.id);
        releaseProjectDraftUploads(
          projectRef,
          memberThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
        );
        const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
        if (projectDraftThread) {
          draftStore.clearDraftThread(projectDraftThread.draftId);
        }
        draftStore.clearProjectDraftThreadId(projectRef);
      }

      if (isWholeGroup && !hasOtherMembers) {
        void navigate({ to: "/", replace: true });
      }
    },
    [
      t,
      deleteProject,
      group.displayName,
      group.memberProjects.length,
      hasOtherMembers,
      navigate,
      reportFailure,
      threads,
    ],
  );

  const checkoutChoices = (
    <SettingsSection title={t("settings.projectSettingsPanel.checkouts")}>
      {group.memberProjects.map((member) => (
        <SettingsRow
          key={member.physicalProjectKey}
          title={member.environmentLabel ?? t("settings.settingInheritance.environment")}
          description={member.workspaceRoot}
          control={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void removeMembers([member])}
              aria-label={t("settings.projectSettingsPanel.removeCheckoutWorkspaceRoot", {
                workspaceRoot: member.workspaceRoot,
              })}
            >
              {t("action.remove")}
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );

  return (
    <>
      <SettingsPageContainer className="gap-6">
        <Alert variant="info">
          <InfoIcon aria-hidden />
          <AlertDescription>
            {t("settings.projectSettingsPanel.canTFindASettingKeepThisProject")}
          </AlertDescription>
        </Alert>
        <SettingsSection
          id="project-overview"
          title={t("settings.projectSettingsPanel.project")}
          hideTitle
        >
          <SettingsRow
            title={t("settings.projectSettingsPanel.name")}
            description={t("settings.projectSettingsPanel.theSharedNameForThisProjectGroupIn")}
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                size="sm"
                className="w-full sm:w-64"
                aria-label={t("settings.projectSettingsPanel.projectName")}
                defaultValue={group.displayName}
                onChange={() => {
                  projectNameEditedRef.current = true;
                }}
                onBlur={(event) => {
                  const wasEdited = projectNameEditedRef.current;
                  projectNameEditedRef.current = false;
                  void renameGroup(event.currentTarget.value, wasEdited);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            }
          />
          <SettingsRow
            title={t("settings.projectSettingsPanel.projectIcon")}
            description={
              projectIcon?.kind === "lucide"
                ? `${projectIcon.name} · ${projectIcon.color}`
                : projectIcon?.kind === "monogram"
                  ? `${projectIcon.text} · ${projectIcon.color}`
                  : projectIcon?.kind === "emoji"
                    ? projectIcon.emoji
                    : (faviconPath ?? t("settings.projectDefaultsSettings.automatic"))
            }
            resetAction={
              group.memberProjects.some(
                (member) => member.faviconPath != null || member.projectIcon != null,
              ) ? (
                <SettingResetButton
                  label={t("settings.projectSettingsPanel.projectIcon459")}
                  disabled={isSavingFavicon}
                  onClick={() => void setProjectIcon({ faviconPath: null, projectIcon: null })}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon project={representative} className="size-6" />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label={t("settings.projectSettingsPanel.chooseAProjectIcon")}
                  disabled={isSavingFavicon}
                  onClick={() => setIconPickerOpen(true)}
                >
                  {t("settings.projectSettingsPanel.chooseIcon")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label={t("settings.projectSettingsPanel.chooseAProjectIconFile")}
                  disabled={isSavingFavicon}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  {t("settings.projectSettingsPanel.chooseFile")}
                </Button>
              </div>
            }
          />
        </SettingsSection>
        <ProjectDefaultsSettings category="project" />
        <ProjectActionsSettings />
        {hasMultipleCheckouts ? checkoutChoices : null}
        <SettingsSection title={t("settings.projectSettingsPanel.danger")}>
          <SettingsRow
            title={
              hasOtherMembers
                ? t("settings.projectSettingsPanel.removeCheckout")
                : group.memberProjects.length > 1
                  ? t("settings.projectSettingsPanel.removeThisProjectEverywhere")
                  : t("settings.projectSettingsPanel.removeProject")
            }
            description={
              hasOtherMembers
                ? t("settings.projectSettingsPanel.deletesTheSelectedMachineSCheckoutEntriesAnd")
                : group.memberProjects.length > 1
                  ? t(
                      "settings.projectSettingsPanel.deletesAllCountCheckoutEntriesAndTheirThreads",
                      { count: group.memberProjects.length },
                    )
                  : t("settings.projectSettingsPanel.deletesTheProjectEntryAndItsThreadsFiles")
            }
            control={
              <Button
                size="sm"
                variant="destructive-outline"
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {hasOtherMembers
                  ? t("settings.projectSettingsPanel.removeCheckout")
                  : group.memberProjects.length > 1
                    ? t("settings.projectSettingsPanel.removeAllEntries")
                    : t("settings.projectSettingsPanel.removeProject")}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setProjectIcon({ faviconPath: path, projectIcon: null })}
        open={faviconPickerOpen}
        projectName={group.displayName}
      />
      {iconPickerOpen ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            current={projectIcon}
            projectName={representative.title}
            open
            onOpenChange={setIconPickerOpen}
            onSelect={(icon) => void setProjectIcon({ faviconPath: null, projectIcon: icon })}
          />
        </Suspense>
      ) : null}
    </>
  );
}
