import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { useState } from "react";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import { parseIssueLink } from "@t3tools/client-runtime/issues";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useProjects, useThreadShell } from "~/state/entities";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { useEnvironmentScope } from "~/state/session";
import { useI18n } from "~/hooks/useI18n";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";

const dialogThread = Atom.make<ScopedThreadRef | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("issues:link-dialog"),
);
export function openLinkIssueDialog(ref: ScopedThreadRef) {
  appAtomRegistry.set(dialogThread, ref);
}
export function LinkIssueDialogHost() {
  const ref = useAtomValue(dialogThread);
  return ref ? (
    <LinkIssueDialog key={`${ref.environmentId}:${ref.threadId}`} threadRef={ref} />
  ) : null;
}
function LinkIssueDialog({ threadRef }: { threadRef: ScopedThreadRef }) {
  const { t } = useI18n();
  const thread = useThreadShell(threadRef);
  const projects = useProjects();
  const identity = projects.find(
    (project) =>
      project.environmentId === threadRef.environmentId && project.id === thread?.projectId,
  )?.repositoryIdentity;
  const repository = identity ? sourceControlClients.repositorySelector(identity) : null;
  const own =
    identity?.provider === "github" && repository
      ? { host: sourceControlClients.changeRequestHost(identity, identity.provider), repository }
      : null;
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = parseIssueLink(value, own);
  const link = useOrchestrationCommand(threadEnvironment.linkIssue, { reportFailure: false });
  const allowed = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const close = () => appAtomRegistry.set(dialogThread, null);
  const submit = async () => {
    if (!target || pending || !allowed) return;
    setPending(true);
    setError(null);
    const result = await link({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, ...target, source: "manual" },
    });
    setPending(false);
    if (result._tag === "Success") close();
    else {
      const failure = squashAtomCommandFailure(result);
      setError(failure instanceof Error ? failure.message : t("issue.linkFailed"));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("issue.link")}</DialogTitle>
          <DialogDescription>{t("issue.linkDescription")}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <Input
            autoFocus
            value={value}
            placeholder={t("issue.linkPlaceholder")}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {target ? (
            <p className="truncate text-xs text-muted-foreground">
              {target.host}/{target.repository} #{target.number}
            </p>
          ) : value ? (
            <p role="alert" className="text-xs text-destructive">
              {t("issue.invalidLink")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={close}>
            {t("action.cancel")}
          </Button>
          <Button disabled={!allowed || !target || pending} onClick={() => void submit()}>
            {pending ? t("pr.linking") : t("issue.link")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
