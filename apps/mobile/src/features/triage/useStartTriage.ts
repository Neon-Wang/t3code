import { pipe } from "effect/Function";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigation } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";

import * as Dialog from "../../components/ui/Dialog";
import { authClientMetadata } from "../../lib/authClientMetadata";
import { projectEnvironment } from "../../state/projects";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  createNewTaskDraft,
  setComposerDraftText,
  waitForComposerDraftsLoaded,
} from "../../state/use-composer-drafts";
import { useSelectWorkspaceDetail } from "../workspace/useSelectWorkspaceDetail";
import { i18n } from "@t3tools/shared/i18n";

const CLI_COMMAND = "npx t3 triage";

/**
 * In-app `t3 triage`, as on web: the server writes the session files and
 * clones the matching source, then a No project draft opens with the prompt.
 */
export function useStartTriage() {
  const navigation = useNavigation();
  const selectDetail = useSelectWorkspaceDetail();
  const prepare = useAtomCommand(serverEnvironment.prepareTriage, { reportFailure: false });
  const openScratch = useAtomCommand(projectEnvironment.openScratch, { reportFailure: false });

  const fail = (message: string) =>
    Dialog.alert(
      i18n.t("mobile.useStartTriage.couldNotStartTriage"),
      i18n.t("mobile.useStartTriage.runCommandInstead", { message, command: CLI_COMMAND }),
      [
        {
          text: i18n.t("settings.providers.copyCommand"),
          onPress: () =>
            void Clipboard.setStringAsync(CLI_COMMAND).catch(() =>
              Dialog.alert(
                i18n.t("mobile.promptlinkactions.couldNotCopy"),
                i18n.t("mobile.useStartTriage.typeCommandInstead", { command: CLI_COMMAND }),
              ),
            ),
        },
        { text: i18n.t("mobile.t3ConnectProfilePage.ok"), style: "cancel" },
      ],
    );
  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const activeRoute = () => {
    const state = navigation.getState();
    return state?.routes[state.index];
  };

  return async (environmentId: EnvironmentId) => {
    // If the user goes elsewhere while this waits, the draft stays closed
    // instead of pulling them away. Split view changes params, not the route.
    const startRoute = activeRoute();
    const routeChanged = () => {
      const route = activeRoute();
      if (route === startRoute) return false;
      if (route === undefined || startRoute === undefined) return true;
      return route.key !== startRoute.key || route.params !== startRoute.params;
    };
    const scratch = await openScratch({ environmentId, input: {} });
    if (scratch._tag === "Failure") {
      if (!isAtomCommandInterrupted(scratch)) {
        pipe(
          squashAtomCommandFailure(scratch),
          (failure) =>
            errorMessage(failure, i18n.t("mobile.useStartTriage.machineCannotStartScratch")),
          fail,
        );
      }
      return;
    }
    const prepared = await prepare({
      environmentId,
      input: { client: authClientMetadata(Constants.expoConfig?.version) },
    });
    if (prepared._tag === "Failure") {
      if (!isAtomCommandInterrupted(prepared)) {
        pipe(
          squashAtomCommandFailure(prepared),
          (failure) => errorMessage(failure, i18n.t("mobile.useStartTriage.serverCouldNotPrepare")),
          fail,
        );
      }
      return;
    }
    try {
      await waitForComposerDraftsLoaded();
    } catch {
      fail(i18n.t("mobile.useStartTriage.draftsCouldNotBeLoaded"));
      return;
    }
    if (routeChanged()) return;
    const draftId = createNewTaskDraft({
      environmentId,
      projectId: scratch.value.id,
    });
    setComposerDraftText(draftId, prepared.value.prompt);
    selectDetail({
      name: "Thread",
      params: {
        draft: {
          environmentId,
          projectId: scratch.value.id,
          title: i18n.t("mobile.useStartTriage.triage"),
          draftId,
        },
      },
    });
  };
}
