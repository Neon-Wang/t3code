import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { readableFailure } from "./pullRequestDetail.logic";
import { toastManager } from "../ui/toast";
import type { ComponentProps } from "react";
import type { EnvironmentId, PullRequestDetail, PullRequestRef } from "@t3tools/contracts";
import {
  capitalizeTerm,
  sourceControlClients,
} from "@t3tools/client-runtime/source-control-clients";
import { canEditPullRequestChangeRequest } from "@t3tools/client-runtime/pull-request-editing";
import { useI18n } from "../../hooks/useI18n";
import { useAtomCommand } from "~/state/use-atom-command";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { TitleEditor } from "../sourceControl/TitleEditor";
export function PullRequestTitleEditor({
  environmentId,
  reference,
  detail,
  ...props
}: Omit<ComponentProps<typeof TitleEditor>, "label" | "onUpdate" | "editable" | "detail"> & {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  detail: PullRequestDetail;
}) {
  const { t } = useI18n();
  const update = useAtomCommand(pullRequestEnvironment.update, { reportFailure: false });
  return (
    <TitleEditor
      {...props}
      detail={detail}
      editable={canEditPullRequestChangeRequest(detail)}
      label={t("pr.termTitle", {
        term: capitalizeTerm(sourceControlClients.get(detail.provider).changeRequest.singular),
      })}
      onUpdate={async (title) => {
        const result = await update({ environmentId, input: { ...reference, title } });
        if (result._tag === "Failure") {
          toastManager.add({
            type: "error",
            title: t("pr.theTitleCouldNotBeSaved"),
            description: readableFailure(
              squashAtomCommandFailure(result),
              t("pr.theHostRefusedTheNewTitle"),
            ),
          });
          return false;
        }
        return true;
      }}
    />
  );
}
