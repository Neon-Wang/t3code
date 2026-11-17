import { useAtomValue } from "@effect/atom-react";
import type { IssueDetail, PullRequestComment } from "@t3tools/contracts";
import { issueEnvironment } from "../../state/issues";
import { usePullRequestConnected } from "../pull-requests/usePullRequestConnected";
import { issueTarget, type IssueParams } from "./issueTarget";
export function useIssuePermissions(params: IssueParams, detail: IssueDetail | null) {
  const { environmentId } = issueTarget(params);
  const connected = usePullRequestConnected(environmentId);
  const write = useAtomValue(issueEnvironment.update.permissionAtom(environmentId));
  const comment = useAtomValue(issueEnvironment.comment.permissionAtom(environmentId));
  const editComment = useAtomValue(issueEnvironment.updateComment.permissionAtom(environmentId));
  const react = useAtomValue(issueEnvironment.setReaction.permissionAtom(environmentId));
  const labels = useAtomValue(issueEnvironment.setLabels.permissionAtom(environmentId));
  const assignees = useAtomValue(issueEnvironment.setAssignees.permissionAtom(environmentId));
  return {
    connected,
    edit: connected && write && detail?.capabilities.edit === true && detail.viewerPermissions.edit,
    close:
      connected && write && detail?.capabilities.close === true && detail.viewerPermissions.close,
    comment:
      connected &&
      comment &&
      detail?.capabilities.comment === true &&
      detail.viewerPermissions.comment,
    editComment: (value: Pick<PullRequestComment, "canEdit">) =>
      connected && editComment && value.canEdit === true,
    react: connected && react && detail?.capabilities.reactions === true,
    labels:
      connected &&
      labels &&
      detail?.capabilities.labels === true &&
      detail.viewerPermissions.labels,
    assignees:
      connected &&
      assignees &&
      detail?.capabilities.assignees === true &&
      detail.viewerPermissions.assignees,
  };
}
