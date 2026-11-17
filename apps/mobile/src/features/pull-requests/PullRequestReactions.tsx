import { useNavigation } from "@react-navigation/native";
import { useI18n } from "../../i18n/useI18n";
import type { PullRequestComment, PullRequestReaction } from "@t3tools/contracts";
import { Pressable, View } from "react-native";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { composerPullRequests } from "../../state/pull-requests";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";
import { usePullRequestPermissions } from "./usePullRequestPermissions";
import { ReactionPills as SourceControlReactionPills } from "../source-control/ReactionPills";

const PILL = "min-h-8 flex-row items-center gap-1 rounded-full border px-2.5 active:opacity-70";
function ReactionPills(props: {
  readonly params: PullRequestParams;
  readonly reactions: ReadonlyArray<PullRequestReaction>;
  readonly canReact: boolean;
  readonly subjectId?: string;
  readonly onChanged: () => void;
}) {
  const target = pullRequestTarget(props.params);
  const setReaction = useAtomCommand(composerPullRequests.setReaction, { reportFailure: false });
  return (
    <SourceControlReactionPills
      reactions={props.reactions}
      canReact={props.canReact}
      onChanged={props.onChanged}
      setReaction={(content, reacted) =>
        setReaction({
          ...target,
          input: {
            ...target.input,
            ...(props.subjectId === undefined ? {} : { subjectId: props.subjectId }),
            content,
            reacted,
          },
        })
      }
    />
  );
}

/** Reactions on the change request itself, which is where its description's reactions live. */
export function PullRequestReactions(props: { readonly params: PullRequestParams }) {
  const target = pullRequestTarget(props.params);
  const detail = useEnvironmentQuery(composerPullRequests.detail(target));
  const activity = useEnvironmentQuery(composerPullRequests.activity(target));
  const { canReact } = usePullRequestPermissions(props.params, detail.data);
  const reactions = activity.data?.reactions ?? [];
  if (!activity.data || (reactions.length === 0 && !canReact)) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <ReactionPills
        params={props.params}
        reactions={reactions}
        canReact={canReact}
        onChanged={activity.refresh}
      />
    </View>
  );
}

export function PullRequestCommentFooter(props: {
  readonly params: PullRequestParams;
  readonly comment: Pick<
    PullRequestComment,
    "id" | "kind" | "body" | "author" | "canEdit" | "reactions"
  >;
  readonly permissions: Pick<
    ReturnType<typeof usePullRequestPermissions>,
    "canEditComment" | "canReact"
  >;
  readonly onChanged: () => void;
  readonly onEdit?: () => void;
}) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const { comment } = props;
  const reactions = comment.reactions ?? [];
  const editableKind = comment.kind === "review" ? null : comment.kind;
  const canEdit = editableKind !== null && props.permissions.canEditComment(comment);
  const { canReact } = props.permissions;
  if (reactions.length === 0 && !canReact && !canEdit) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <ReactionPills
        params={props.params}
        reactions={reactions}
        canReact={canReact}
        subjectId={comment.id}
        onChanged={props.onChanged}
      />
      {canEdit && editableKind !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("pr.editComment")}
          onPress={() => {
            props.onEdit?.();
            navigation.navigate("PullRequestEdit", {
              ...props.params,
              field: "comment",
              comment: {
                id: comment.id,
                kind: editableKind,
                body: comment.body,
                author: comment.author,
                ...(comment.canEdit === undefined ? {} : { canEdit: comment.canEdit }),
              },
            });
          }}
          className={cn(PILL, "ml-auto border-transparent")}
        >
          <SymbolView name="pencil" size={13} tintColorClassName="accent-icon-muted" />
          <Text className="text-xs font-t3-medium text-foreground-muted">{t("action.edit")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
