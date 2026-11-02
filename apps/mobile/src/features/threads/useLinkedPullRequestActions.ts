import { useI18n } from "../../i18n/useI18n";
import {
  pullRequestLinkProject,
  resolveLinkPullRequestInput,
} from "@t3tools/client-runtime/pull-request-link-input";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { planThreadPullRequestMutation } from "@t3tools/client-runtime/thread-pull-request-compatibility";
import {
  capitalizeTerm,
  sourceControlClients,
} from "@t3tools/client-runtime/source-control-clients";
import { AuthOrchestrationOperateScope, type ThreadPullRequestLink } from "@t3tools/contracts";
import * as Clipboard from "expo-clipboard";

import * as Dialog from "../../components/ui/Dialog";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import type { MenuProps } from "../../components/ui/Menu.types";
import type { EnvironmentRuntimeState } from "../../state/remote-runtime-types";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

type MenuAction = MenuProps["actions"][number];

export function useLinkedPullRequestActions(input: {
  readonly thread: EnvironmentThreadShell | null;
  readonly project: EnvironmentProject | null;
  readonly runtime: EnvironmentRuntimeState | null;
}) {
  const { t } = useI18n();
  const { thread, project, runtime } = input;
  const terminology = sourceControlClients.get(project?.repositoryIdentity?.provider).changeRequest;
  const capabilities = runtime?.serverConfig?.environment.capabilities;
  const canOperate = useEnvironmentScope(
    thread?.environmentId ?? null,
    AuthOrchestrationOperateScope,
  );
  const canEdit = canOperate && capabilities !== undefined;
  const canWatch = canOperate && capabilities?.threadPullRequestWatch === true;
  const canStartWatch =
    canWatch &&
    thread !== null &&
    thread.archivedAt === null &&
    thread.settledAt === null &&
    thread.settledOverride !== "settled" &&
    thread.lineage.relationshipToParent !== "subagent";
  const link = useAtomCommand(threadEnvironment.linkPullRequest, { reportFailure: false });
  const unlink = useAtomCommand(threadEnvironment.unlinkPullRequest, { reportFailure: false });
  const watch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: false });

  const run = async (
    failureTitle: string,
    pending: Promise<AtomCommandResult<unknown, unknown>>,
  ) => {
    const result = await pending;
    if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
    const cause = squashAtomCommandFailure(result);
    Dialog.alert(
      failureTitle,
      cause instanceof Error ? cause.message : t("mobile.promptlinkactions.tryAgain"),
    );
  };

  const setLinked = (
    reference: { host: string; repository: string; number: number; url: string },
    linked: boolean,
  ) => {
    if (thread === null) return;
    const mutation = planThreadPullRequestMutation({
      capabilities,
      threadId: thread.id,
      reference,
      linked,
    });
    if (mutation === null) return;
    const environmentId = thread.environmentId;
    void run(
      linked
        ? t("mobile.linkedPullRequests.couldntLink", { term: terminology.singular })
        : t("mobile.linkedPullRequests.couldntUnlink", { term: terminology.singular }),
      mutation.type === "thread.pull-request.link"
        ? link({ environmentId, input: mutation.input })
        : unlink({ environmentId, input: mutation.input }),
    );
  };

  const promptLink = () => {
    const { singular } = terminology;
    Dialog.prompt({
      title: t("mobile.linkedPullRequests.link", { term: singular }),
      message: t("mobile.linkedPullRequests.pasteUrl", { term: singular }),
      placeholder: t("mobile.linkedPullRequests.urlOrNumber", { term: capitalizeTerm(singular) }),
      initialValue: "",
      confirmText: t("mobile.linkedPullRequests.linkConfirm"),
      onConfirm: (reference) => {
        const resolved = resolveLinkPullRequestInput({
          reference,
          project: pullRequestLinkProject(project?.repositoryIdentity),
          hasProject: () => true,
        });
        if (resolved === null) {
          Dialog.alert(
            t("mobile.linkedPullRequests.couldntLink", { term: singular }),
            t("mobile.linkedPullRequests.useUrlOrNumber", { term: singular }),
          );
          return;
        }
        if ("error" in resolved) {
          Dialog.alert(
            t("mobile.linkedPullRequests.couldntLink", { term: singular }),
            resolved.error,
          );
          return;
        }
        setLinked(resolved.link, true);
      },
    });
  };

  const menuActions = (link: ThreadPullRequestLink): MenuAction[] => {
    const open = link.snapshot === null || link.snapshot.state === "open";
    const watching = link.watch !== undefined;
    return [
      { id: "copy", title: t("mobile.linkedPullRequests.copyLink"), image: "link" },
      { id: "browser", title: t("mobile.linkedPullRequests.openInBrowser"), image: "safari" },
      ...((watching ? canWatch : canStartWatch) && open
        ? [
            {
              id: "watch",
              title: watching
                ? t("mobile.linkedPullRequests.stopWatching")
                : t("mobile.linkedPullRequests.watchForChanges"),
              image: watching ? "eye.slash" : "eye",
            },
          ]
        : []),
      ...(canEdit
        ? [
            {
              id: "unlink",
              title:
                link.source === "stack"
                  ? t("mobile.linkedPullRequests.dismissFromThread")
                  : t("mobile.linkedPullRequests.unlinkFromThread"),
              image: "xmark",
              attributes: { destructive: true },
            },
          ]
        : []),
    ];
  };

  const onMenuAction = (link: ThreadPullRequestLink, action: string) => {
    if (action === "copy") void Clipboard.setStringAsync(link.url);
    else if (action === "browser")
      void tryOpenExternalUrl(link.url, "pull-request").then((opened) => {
        if (!opened) {
          const { shortLabel, singular } = (
            sourceControlClients.findByChangeRequestUrl(link.url) ??
            sourceControlClients.get(undefined)
          ).changeRequest;
          Dialog.alert(
            t("mobile.threadGitControls.unableToOpenRequest", { label: shortLabel }),
            t("mobile.threadGitControls.requestCouldNotBeOpened", { term: singular }),
          );
        }
      });
    else if (action === "watch" && thread !== null)
      void run(
        t("mobile.linkedPullRequests.couldntChangeWatching"),
        watch({
          environmentId: thread.environmentId,
          input: {
            threadId: thread.id,
            host: link.host,
            repository: link.repository,
            number: link.number,
            watching: link.watch === undefined,
          },
        }),
      );
    else if (action === "unlink") setLinked(link, false);
  };

  return { canLink: canEdit, terminology, promptLink, menuActions, onMenuAction };
}

export type LinkedPullRequestActions = ReturnType<typeof useLinkedPullRequestActions>;
