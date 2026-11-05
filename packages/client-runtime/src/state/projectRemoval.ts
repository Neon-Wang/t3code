import { i18n } from "@t3tools/shared/i18n";
import { isListedThreadLineage } from "@t3tools/contracts";

import type { EnvironmentProject, EnvironmentThreadShell } from "./models.ts";

export function planProjectRemoval<
  Thread extends Pick<EnvironmentThreadShell, "environmentId" | "projectId" | "lineage">,
>(options: {
  readonly members: ReadonlyArray<
    Pick<EnvironmentProject, "id" | "environmentId" | "title" | "workspaceRoot"> & {
      readonly environmentLabel?: string | null;
    }
  >;
  readonly groupMemberCount: number;
  readonly hasOtherMembers: boolean;
  readonly displayName: string;
  readonly threads: ReadonlyArray<Thread>;
  /** The members' threads this client does not hold: older settled threads its shell left out. */
  readonly unloadedThreadCount?: number;
}) {
  const { members, groupMemberCount, hasOtherMembers, displayName, threads } = options;
  const memberKeys = new Set(members.map((member) => `${member.environmentId}:${member.id}`));
  const projectThreads = threads.filter((thread) =>
    memberKeys.has(`${thread.environmentId}:${thread.projectId}`),
  );
  // Side chats and subagents go with their parent but never show in thread lists.
  const threadCount =
    projectThreads.filter((thread) => isListedThreadLineage(thread.lineage)).length +
    (options.unloadedThreadCount ?? 0);
  const isWholeGroup = members.length === groupMemberCount;
  const targetKind = hasOtherMembers || !isWholeGroup ? "checkout" : "project";
  const singleMember = members.length === 1 ? members[0]! : null;
  const targetLabel = singleMember?.title ?? displayName;
  const kindLabel = i18n.t(
    targetKind === "checkout" ? "settings.misc.checkout" : "settings.misc.projectNoun",
  );
  const confirmationMessage = [
    threadCount > 0
      ? i18n.t(
          threadCount === 1
            ? "shared.projectRemoval.removeWithThreads.one"
            : "shared.projectRemoval.removeWithThreads.other",
          { targetKind: kindLabel, targetLabel, count: threadCount },
        )
      : i18n.t("settings.projectSettingsPanel.removeTargetKindTargetLabel", {
          targetKind: kindLabel,
          targetLabel,
        }),
    ...(singleMember
      ? [
          i18n.t("settings.projectSettingsPanel.pathPath", { path: singleMember.workspaceRoot }),
          ...(singleMember.environmentLabel
            ? [
                i18n.t("settings.projectSettingsPanel.environmentEnvironment", {
                  environment: singleMember.environmentLabel,
                }),
              ]
            : []),
        ]
      : [
          i18n.t("settings.projectSettingsPanel.thisRemovesCountGroupedProjectEntries", {
            count: members.length,
          }),
        ]),
    i18n.t(
      threadCount > 0
        ? "shared.projectRemoval.threadsDeleted"
        : "shared.projectRemoval.archivedDeleted",
    ),
    i18n.t(
      isWholeGroup && !hasOtherMembers
        ? "settings.projectSettingsPanel.thisRemovesOnlyTheProjectEntriesNotThe"
        : "settings.projectSettingsPanel.otherEntriesInThisGroupedProjectAreUnaffected",
    ),
    i18n.t("settings.projectSettingsPanel.thisActionCannotBeUndone"),
  ].join("\n");

  return { projectThreads, isWholeGroup, targetKind, confirmationMessage };
}
