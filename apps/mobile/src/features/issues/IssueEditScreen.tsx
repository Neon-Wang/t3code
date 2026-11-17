import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import type { PullRequestComment } from "@t3tools/contracts";
import { useState } from "react";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/useI18n";
import { issueEnvironment } from "../../state/issues";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { SheetContent } from "../source-control/SheetContent";
import {
  SourceControlMarkdown,
  SourceControlMarkdownRepository,
} from "../source-control/SourceControlMarkdown";
import { issueTarget, type IssueParams } from "./issueTarget";
import { useIssuePermissions } from "./useIssuePermissions";
import { useIssueAction } from "./useIssueAction";
export type IssueEditParams = IssueParams &
  (
    | { field: "title" | "body" | "newComment" }
    | { field: "comment"; comment: Pick<PullRequestComment, "id" | "body" | "canEdit"> }
  );
export function IssueEditScreen({ route }: StaticScreenProps<IssueEditParams>) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const params = route.params;
  const target = issueTarget(params);
  const detail = useEnvironmentQuery(issueEnvironment.detail(target));
  const permissions = useIssuePermissions(params, detail.data);
  const update = useAtomCommand(issueEnvironment.update, { reportFailure: false });
  const comment = useAtomCommand(issueEnvironment.comment, { reportFailure: false });
  const updateComment = useAtomCommand(issueEnvironment.updateComment, { reportFailure: false });
  const action = useIssueAction();
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const original =
    params.field === "comment"
      ? params.comment.body
      : params.field === "newComment"
        ? ""
        : (detail.data?.[params.field] ?? null);
  const value = draft ?? original ?? "";
  const allowed =
    params.field === "comment"
      ? permissions.editComment(params.comment)
      : params.field === "newComment"
        ? permissions.comment
        : permissions.edit;
  const title =
    params.field === "title"
      ? t("pr.editTitle")
      : params.field === "body"
        ? t("pr.editDescription")
        : params.field === "comment"
          ? t("pr.editComment")
          : t("pr.comment");
  const save = async () => {
    if (
      !allowed ||
      original === null ||
      value === original ||
      (params.field !== "body" && !value.trim())
    )
      return;
    const success = await action.run(() =>
      params.field === "comment"
        ? updateComment({
            ...target,
            input: { ...target.input, commentId: params.comment.id, body: value },
          })
        : params.field === "newComment"
          ? comment({ ...target, input: { ...target.input, body: value } })
          : update({
              ...target,
              input: {
                ...target.input,
                ...(params.field === "title" ? { title: value.trim() } : { body: value }),
              },
            }),
    );
    if (success) navigation.goBack();
  };
  return (
    <SourceControlMarkdownRepository params={params} changeRequest={detail.data}>
      <SheetContent
        title={title}
        subtitle={`#${params.number} · ${params.repository}`}
        busy={action.busy}
        footer={
          <Button
            label={t(params.field === "newComment" ? "pr.comment" : "action.save")}
            disabled={
              !allowed ||
              action.busy ||
              value === original ||
              (params.field !== "body" && !value.trim())
            }
            onPress={() => void save()}
          />
        }
      >
        {!allowed ? (
          <Text className="text-sm text-foreground-muted">
            {t(
              permissions.connected
                ? "issue.readOnly"
                : "mobile.pullRequestEditScreen.reconnectToSaveChanges",
            )}
          </Text>
        ) : null}
        {action.error || detail.error ? (
          <Text selectable className="text-sm text-danger-foreground">
            {action.error ?? detail.error}
          </Text>
        ) : null}
        {params.field !== "title" ? (
          <Button
            label={t(preview ? "action.edit" : "pr.preview")}
            onPress={() => setPreview(!preview)}
          />
        ) : null}
        {preview ? (
          <SourceControlMarkdown markdown={value} />
        ) : (
          <TextInput
            accessibilityLabel={title}
            value={value}
            onChangeText={setDraft}
            multiline={params.field !== "title"}
            maxLength={params.field === "title" ? 256 : 65536}
            editable={allowed && !action.busy}
            className="min-h-12 rounded-xl bg-grouped-card p-3 text-base text-foreground"
            style={
              params.field !== "title" ? { minHeight: 180, textAlignVertical: "top" } : undefined
            }
          />
        )}
      </SheetContent>
    </SourceControlMarkdownRepository>
  );
}
