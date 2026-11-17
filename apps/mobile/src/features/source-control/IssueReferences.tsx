import type { ChangeRequestIssueLink } from "@t3tools/contracts";
import { issueKey } from "@t3tools/client-runtime/issues";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useI18n } from "../../i18n/useI18n";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useOpenWorkspaceDetail } from "../layout/useOpenWorkspaceDetail";
import type { IssueParams } from "../issues/issueTarget";
import { PullRequestSectionHeading } from "../pull-requests/PullRequestSectionHeading";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";

export function IssueReferences(props: {
  readonly links: readonly ChangeRequestIssueLink[];
  readonly show: "issues" | "pullRequests";
  readonly params: Pick<IssueParams, "environmentId" | "projectId" | "repository">;
  readonly host: string;
}) {
  const { t } = useI18n();
  const open = useOpenWorkspaceDetail();
  if (!props.links.length) return null;
  return (
    <View className="gap-3">
      <PullRequestSectionHeading>
        {t(props.show === "issues" ? "issue.linkedIssues" : "issue.linkedPRs")}
      </PullRequestSectionHeading>
      <View className="overflow-hidden rounded-xl bg-grouped-card">
        {props.links.map((link) => {
          const ref = props.show === "issues" ? link.issue : link.changeRequest;
          const same =
            ref.host.toLowerCase() === props.host.toLowerCase() &&
            ref.repository.toLowerCase() === props.params.repository.toLowerCase();
          return (
            <Pressable
              key={`${issueKey(ref)}:${link.kind}`}
              accessibilityRole="button"
              accessibilityLabel={`${t(props.show === "issues" ? "issue.title" : "pr.pullRequests")} #${ref.number}: ${ref.title}`}
              className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
              onPress={() => {
                if (same)
                  open({
                    name: props.show === "issues" ? "Issue" : "PullRequest",
                    params: {
                      environmentId: props.params.environmentId,
                      projectId: props.params.projectId,
                      host: ref.host,
                      repository: ref.repository,
                      number: ref.number,
                    },
                  });
                else void tryOpenExternalUrl(ref.url, "pull-request");
              }}
            >
              <SymbolView
                name={props.show === "issues" ? "circle" : PullRequestGlyph.pullRequest}
                size={16}
                tintColorClassName={
                  ref.state === "open" ? "accent-adaptive-emerald-600-400" : "accent-icon-muted"
                }
              />
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-sm font-t3-medium" numberOfLines={2}>
                  {ref.title || `#${ref.number}`}
                </Text>
                <Text className="text-xs text-foreground-muted">
                  {t(link.kind === "closes" ? "issue.closes" : "issue.mentions")} · {ref.repository}{" "}
                  #{ref.number}
                </Text>
              </View>
              <SymbolView
                name={same ? "chevron.right" : "arrow.up.right"}
                size={12}
                tintColorClassName="accent-icon-muted"
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
