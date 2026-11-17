import type { StaticScreenProps } from "@react-navigation/native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { Button } from "../../components/ui/Button";
import { SelectionRow } from "../../components/ui/SelectionRow";
import { useI18n } from "../../i18n/useI18n";
import { issueEnvironment } from "../../state/issues";
import { useEnvironmentQuery } from "../../state/query";
import { useDebouncedValue } from "../../state/queries";
import { useAtomCommand } from "../../state/use-atom-command";
import { SearchSheet } from "../source-control/SearchSheet";
import { LabelDot } from "../source-control/LabelDot";
import { PullRequestAvatar } from "../pull-requests/PullRequestPresentation";
import { pullRequestLabelColor } from "../pull-requests/pullRequestList";
import { issueTarget, type IssueParams } from "./issueTarget";
import { useIssuePermissions } from "./useIssuePermissions";
import { useIssueAction } from "./useIssueAction";
export function IssuePickersScreen({
  route,
}: StaticScreenProps<IssueParams & { kind: "labels" | "assignees" }>) {
  const { t } = useI18n();
  const params = route.params;
  const target = issueTarget(params);
  const labels = params.kind === "labels";
  const [query, setQuery] = useState("");
  const sent = useDebouncedValue(query.trim().slice(0, 100), 250);
  const detail = useEnvironmentQuery(issueEnvironment.detail(target));
  const permissions = useIssuePermissions(params, detail.data);
  const requested = { ...target, input: { ...target.input, ...(sent ? { query: sent } : {}) } };
  const labelResult = useEnvironmentQuery(
    labels ? issueEnvironment.labelCandidates(requested) : null,
  );
  const assigneeResult = useEnvironmentQuery(
    labels ? null : issueEnvironment.assigneeCandidates(requested),
  );
  const setLabels = useAtomCommand(issueEnvironment.setLabels, { reportFailure: false });
  const setAssignees = useAtomCommand(issueEnvironment.setAssignees, { reportFailure: false });
  const action = useIssueAction();
  const result = labels ? labelResult : assigneeResult;
  const candidates = labels
    ? (labelResult.data?.candidates ?? []).map((c) => ({
        id: c.name,
        title: c.name,
        subtitle: c.description ?? undefined,
        selected: c.isApplied,
        leading: <LabelDot color={pullRequestLabelColor(c.color)} />,
      }))
    : (assigneeResult.data?.candidates ?? []).map((c) => ({
        id: c.id,
        title: c.login,
        subtitle: c.name ?? undefined,
        selected: c.isAssigned,
        leading: <PullRequestAvatar actor={c} />,
      }));
  const allowed = labels ? permissions.labels : permissions.assignees;
  return (
    <SearchSheet
      title={t(labels ? "pr.labels" : "issue.assignees")}
      placeholder={t(labels ? "pr.searchLabels" : "issue.searchAssignees")}
      closeAccessibilityLabel={t("action.close")}
      clearAccessibilityLabel={t("action.clear")}
      query={query}
      onQueryChange={setQuery}
    >
      {({ paddingBottom }) => (
        <FlatList
          data={candidates}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom }}
          renderItem={({ item, index }) => (
            <SelectionRow
              title={item.title}
              subtitle={item.subtitle}
              selected={item.selected}
              role="checkbox"
              leading={item.leading}
              disabled={!allowed || action.busy}
              isFirst={index === 0}
              isLast={index === candidates.length - 1}
              onPress={() =>
                void action.run(() =>
                  labels
                    ? setLabels({
                        ...target,
                        input: { ...target.input, labels: [item.id], applied: !item.selected },
                      })
                    : setAssignees({
                        ...target,
                        input: {
                          ...target.input,
                          assigneeIds: [item.id],
                          assigned: !item.selected,
                        },
                      }),
                )
              }
            />
          )}
          ListHeaderComponent={
            action.error || result.error ? (
              <Text selectable className="pb-3 text-danger-foreground">
                {action.error ?? result.error}
              </Text>
            ) : undefined
          }
          ListFooterComponent={
            result.data?.truncated ? (
              <Text className="py-3 text-foreground-muted">
                {t(labels ? "pr.searchLabels" : "issue.assigneesTruncated")}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            result.isPending ? (
              <AppActivityIndicator className="my-8" />
            ) : (
              <View className="py-6">
                <Text>
                  {t(labels ? "mobile.pullRequestLabelsScreen.noLabels" : "issue.noAssignees")}
                </Text>
                {result.error ? (
                  <Button label={t("action.retry")} onPress={result.refresh} />
                ) : null}
              </View>
            )
          }
        />
      )}
    </SearchSheet>
  );
}
