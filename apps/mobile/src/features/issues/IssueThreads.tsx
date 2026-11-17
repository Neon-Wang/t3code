import { useAtomValue } from "@effect/atom-react";
import { issueKey } from "@t3tools/client-runtime/issues";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope, type IssueDetail } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { useI18n } from "../../i18n/useI18n";
import { useEnvironmentScope } from "../../state/session";
import { environmentThreadShells } from "../../state/threads";
import {
  createNewTaskDraft,
  setComposerDraftText,
  updateComposerDraftSettings,
  waitForComposerDraftsLoaded,
  flushComposerDrafts,
} from "../../state/use-composer-drafts";
import { useOpenWorkspaceDetail } from "../layout/useOpenWorkspaceDetail";
import { PullRequestSectionHeading } from "../pull-requests/PullRequestSectionHeading";
import { usePullRequestConnected } from "../pull-requests/usePullRequestConnected";
import { issueTarget, type IssueParams } from "./issueTarget";

export function IssueThreads({ params, issue }: { params: IssueParams; issue: IssueDetail }) {
  const { t } = useI18n();
  const target = issueTarget(params);
  const open = useOpenWorkspaceDetail();
  const connected = usePullRequestConnected(target.environmentId);
  const allowed = useEnvironmentScope(target.environmentId, AuthOrchestrationOperateScope);
  const shells = useAtomValue(environmentThreadShells.visibleThreadShellsAtom);
  const threads = shells.filter(
    (thread) =>
      thread.environmentId === target.environmentId &&
      thread.archivedAt === null &&
      thread.issues?.some((linked) => issueKey(linked) === issueKey(issue)),
  );
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (pending.current || !connected || !allowed) return;
    pending.current = true;
    setBusy(true);
    const result = await settlePromise(async () => {
      await waitForComposerDraftsLoaded();
      const draftId = createNewTaskDraft({
        environmentId: target.environmentId,
        projectId: target.input.projectId,
      });
      updateComposerDraftSettings(draftId, { issueUrl: issue.url });
      setComposerDraftText(draftId, t("issue.threadPrompt", { url: issue.url }));
      await flushComposerDrafts();
      open({
        name: "Thread",
        params: { draft: { draftId, title: `#${issue.number} ${issue.title}` } },
      });
    });
    pending.current = false;
    setBusy(false);
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      Dialog.alert(
        t("mobile.usePullRequestThreads.couldntOpenAThread"),
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  };
  return (
    <View className="gap-3">
      <PullRequestSectionHeading>{t("issue.linkedThreads")}</PullRequestSectionHeading>
      {threads.length ? (
        threads.map((thread) => (
          <Pressable
            key={thread.id}
            accessibilityRole="button"
            className="rounded-xl bg-grouped-card px-4 py-3 active:opacity-70"
            onPress={() =>
              open({
                name: "Thread",
                params: { environmentId: target.environmentId, threadId: thread.id },
              })
            }
          >
            <Text className="text-sm font-t3-medium">{thread.title}</Text>
          </Pressable>
        ))
      ) : (
        <Text className="text-sm text-foreground-muted">{t("issue.noLinkedThreads")}</Text>
      )}
      <Button
        label={t("issue.startThread")}
        disabled={!connected || !allowed || busy}
        onPress={() => void start()}
      />
    </View>
  );
}
