import { openContentUrl } from "../../lib/openExternalUrl";
import { useI18n } from "../../i18n/useI18n";
import { usePullRequestConnected } from "./usePullRequestConnected";
import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import type { PullRequestAction, PullRequestDetail } from "@t3tools/contracts";
import Animated from "react-native-reanimated";
import { PR_ROW_LAYOUT, PR_DISCLOSURE_ENTER, PR_ROW_EXIT } from "./pullRequestAnimations";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { Menu } from "../../components/ui/Menu";
import { PullRequestAvatar } from "./PullRequestPresentation";
import { PullRequestCardRow } from "./PullRequestControls";
import { PullRequestAgentRow } from "./PullRequestAgentRow";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import { composerPullRequests } from "../../state/pull-requests";
import { useEnvironmentQuery } from "../../state/query";
import { allowedUpdateMethods, PR_ACTION_ICONS, PR_ACTION_LABELS } from "./pullRequestActions";
import {
  checkStatus,
  pullRequestBranchSummary,
  pullRequestChecksSummary,
  pullRequestReviewSummary,
  pullRequestStatus,
} from "./pullRequestStatus";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";
import { usePullRequestAction } from "./usePullRequestAction";
import { usePullRequestAgentActions } from "./usePullRequestAgentActions";

type RowProps = { readonly pr: PullRequestDetail; readonly params: PullRequestParams };
const STATUS_ACTIONS: readonly PullRequestAction[] = [
  "ready",
  "draft",
  "close",
  "reopen",
  "revert",
];
const CHECK_PRIORITY = {
  failure: 0,
  "action-required": 1,
  pending: 2,
  cancelled: 3,
  neutral: 4,
  skipped: 5,
  success: 6,
};

export function PullRequestStatusMenu(props: RowProps) {
  const { t } = useI18n();
  const action = usePullRequestAction(props.params, props.pr);
  const actions = STATUS_ACTIONS.filter(action.available);
  const status = pullRequestStatus(props.pr);
  const trigger = (
    <Pressable
      accessibilityRole={actions.length ? "button" : undefined}
      accessibilityLabel={t("mobile.PullRequestStatusRows.pullRequestStatus", {
        status: status.label,
      })}
      disabled={!actions.length}
      className="min-h-8 flex-row items-center gap-1.5 active:opacity-70"
    >
      <SymbolView name={status.icon} size={14} tintColorClassName={status.tint} />
      <Text className={`text-xs font-t3-medium ${status.text}`}>{status.label}</Text>
      {actions.length ? (
        <SymbolView name="chevron.down" size={9} tintColorClassName="accent-icon-muted" />
      ) : null}
    </Pressable>
  );
  if (!actions.length) return trigger;
  return (
    <Menu
      title={t("mobile.pullRequestStatusRows.pullRequestStatus")}
      actions={actions.map((id) => ({
        id,
        title: PR_ACTION_LABELS[id],
        image: PR_ACTION_ICONS[id],
        attributes: { destructive: id === "close" },
      }))}
      onPressAction={({ nativeEvent }) => {
        const selected = actions.find((id) => id === nativeEvent.event);
        if (!selected) return;
        if (selected === "close")
          action.confirm(
            selected,
            t("mobile.pullRequestStatusRows.closePullRequest"),
            t("mobile.pullRequestStatusRows.closeThisPullRequestWithoutMergingItsChanges"),
          );
        else if (selected === "revert")
          action.confirm(
            selected,
            t("mobile.pullRequestStatusRows.createRevertPullRequest"),
            t("mobile.pullRequestStatusRows.openANewPullRequestThatReversesTheseChanges"),
          );
        else void action.perform(selected);
      }}
    >
      {trigger}
    </Menu>
  );
}

export function PullRequestChecksRow(props: RowProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const checks = pullRequestChecksSummary(props.pr);
  const action = usePullRequestAction(props.params, props.pr);
  return (
    <Animated.View layout={PR_ROW_LAYOUT}>
      <PullRequestCardRow
        title={checks.title}
        icon={checks.icon}
        tint={checks.tint}
        value={checks.count}
        compact
        accessibilityLabel={t("mobile.PullRequestStatusRows.checks", { status: checks.label })}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <Animated.View
          layout={PR_ROW_LAYOUT}
          entering={PR_DISCLOSURE_ENTER}
          exiting={PR_ROW_EXIT}
          className="pl-8"
        >
          {props.pr.state === "open" &&
          props.pr.checks.some((check) => check.status === "failure") ? (
            <PullRequestAgentRow
              {...props}
              task="feedback"
              title={t("mobile.pullRequestStatusRows.fixFailingChecks")}
            />
          ) : null}
          {action.available("approve-workflows") ? (
            <PullRequestCardRow
              title={t("mobile.pullRequestStatusRows.approveWorkflows")}
              icon="checkmark"
              detail={t("mobile.PullRequestStatusRows.waitingForApproval", {
                count: props.pr.workflowApprovalsRequired ?? 0,
              })}
              onPress={() =>
                action.confirm(
                  "approve-workflows",
                  t("mobile.pullRequestStatusRows.approveWorkflows"),
                  t(
                    "mobile.pullRequestStatusRows.allowThisPullRequestsWorkflowsToRunReviewTheWorkflowChangesFirst",
                  ),
                )
              }
            />
          ) : null}
          {[...props.pr.checks]
            .sort((a, b) => CHECK_PRIORITY[a.status] - CHECK_PRIORITY[b.status])
            .map((check) => {
              const status = checkStatus(check);
              const url = check.url;
              return (
                <PullRequestCardRow
                  key={`${check.name}:${url}`}
                  title={check.name}
                  icon={status.icon}
                  tint={status.tint}
                  value={status.label}
                  detail={check.description ?? undefined}
                  onPress={url ? () => void openContentUrl(url) : undefined}
                />
              );
            })}
          {!props.pr.checks.length ? (
            <Text className="px-4 py-3 text-xs text-foreground-muted">
              {t("mobile.pullRequestStatusRows.noChecksReported")}
            </Text>
          ) : null}
          <PullRequestCardRow
            title={t("mobile.pullRequestStatusRows.openChecksOnProvider")}
            icon="arrow.up.right"
            onPress={() =>
              void openContentUrl(
                props.pr.provider === "github" ? `${props.pr.url}/checks` : props.pr.url,
              )
            }
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function PullRequestBranchRow(props: RowProps) {
  const { t } = useI18n();
  const action = usePullRequestAction(props.params, props.pr);
  const agent = usePullRequestAgentActions(props.params, props.pr);
  const methods = action.available("update-branch") ? allowedUpdateMethods(props.pr) : [];
  const canResolve =
    agent.canAsk && props.pr.state === "open" && props.pr.mergeability === "conflicting";
  const summary = action.busy ? "Updating…" : pullRequestBranchSummary(props.pr);
  const clean = props.pr.mergeability === "mergeable";
  const conflicting = props.pr.mergeability === "conflicting";
  const row = (
    <PullRequestCardRow
      title={
        props.pr.mergeability === "conflicting"
          ? `Conflicts with ${props.pr.baseBranch}`
          : clean
            ? `No conflicts with ${props.pr.baseBranch}`
            : t("mobile.pullRequestStatusRows.branch")
      }
      icon={
        conflicting ? PullRequestGlyph.conflicting : clean ? "checkmark.circle" : "arrow.branch"
      }
      tint={
        conflicting
          ? "accent-danger-foreground"
          : clean
            ? "accent-adaptive-emerald-600-400"
            : undefined
      }
      value={
        conflicting || (clean && props.pr.baseComparison !== "behind" && !action.busy)
          ? undefined
          : summary
      }
      compact
      menu={methods.length > 0 || canResolve}
      accessibilityLabel={t("mobile.PullRequestStatusRows.branch", { summary: summary })}
    />
  );
  if (!methods.length && !canResolve) return row;
  return (
    <Menu
      title={t("mobile.pullRequestStatusRows.branch")}
      actions={[
        ...(canResolve ? [agent.menuAction("conflicts")] : []),
        ...methods.map((id) => ({
          id,
          title: t("mobile.PullRequestStatusRows.updateWith", { method: id }),
          image: "arrow.up.circle",
        })),
      ]}
      onPressAction={({ nativeEvent }) => {
        const method = methods.find((id) => id === nativeEvent.event);
        if (method) void action.perform("update-branch", method);
        else agent.select(nativeEvent.event);
      }}
    >
      {row}
    </Menu>
  );
}

export function PullRequestReviewersRow(props: RowProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const navigation = useNavigation();
  const activity = useEnvironmentQuery(
    composerPullRequests.activity(pullRequestTarget(props.params)),
  );
  const summary = pullRequestReviewSummary(props.pr, activity.data);
  const canWrite = useAtomValue(
    composerPullRequests.requestReviewers.permissionAtom(
      pullRequestTarget(props.params).environmentId,
    ),
  );
  const connected = usePullRequestConnected(props.params.environmentId);
  const canRequest =
    connected &&
    canWrite &&
    props.pr.state === "open" &&
    props.pr.capabilities.reviewers.request &&
    props.pr.viewerPermissions.requestReviewers;
  return (
    <Animated.View layout={PR_ROW_LAYOUT}>
      <PullRequestCardRow
        title={summary.title}
        icon={summary.icon}
        tint={summary.tint}
        value={summary.count}
        compact
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <Animated.View
          layout={PR_ROW_LAYOUT}
          entering={PR_DISCLOSURE_ENTER}
          exiting={PR_ROW_EXIT}
          className="pl-8"
        >
          {summary.reviews.map((review) => (
            <View
              key={review.id}
              accessibilityLabel={`${review.author?.login ?? "Unknown reviewer"}, ${review.reviewState === "APPROVED" ? "Approved" : review.reviewState === "CHANGES_REQUESTED" ? "Changes requested" : "Commented"}`}
              className="min-h-14 flex-row items-center gap-3 px-4 py-2"
            >
              <SymbolView
                name={
                  review.reviewState === "APPROVED"
                    ? "checkmark"
                    : review.reviewState === "CHANGES_REQUESTED"
                      ? "plusminus"
                      : "bubble.left"
                }
                size={18}
                tintColorClassName={
                  review.reviewState === "APPROVED"
                    ? "accent-adaptive-emerald-600-400"
                    : review.reviewState === "CHANGES_REQUESTED"
                      ? "accent-danger-foreground"
                      : "accent-icon-muted"
                }
              />
              <PullRequestAvatar actor={review.author} size={32} />
              <Text className="min-w-0 flex-1 text-sm font-t3-medium" numberOfLines={1}>
                {review.author?.login ?? "Unknown reviewer"}
              </Text>
            </View>
          ))}
          {props.pr.reviewers
            .filter(
              (reviewer) =>
                !summary.reviews.some((review) => review.author?.login === reviewer.login),
            )
            .map((reviewer) => (
              <View
                key={reviewer.login}
                accessibilityLabel={t("mobile.PullRequestStatusRows.reviewRequested", {
                  name: reviewer.login,
                })}
                className="min-h-14 flex-row items-center gap-3 px-4 py-2"
              >
                <SymbolView name="clock" size={18} tintColorClassName="accent-icon-muted" />
                <PullRequestAvatar actor={reviewer} size={32} />
                <Text className="min-w-0 flex-1 text-sm font-t3-medium" numberOfLines={1}>
                  {reviewer.login}
                </Text>
              </View>
            ))}
          {canRequest ? (
            <PullRequestCardRow
              title={t("mobile.pullRequestStatusRows.requestReview")}
              icon="person.badge.plus"
              onPress={() => navigation.navigate("PullRequestReviewers", props.params)}
            />
          ) : (
            <PullRequestCardRow
              title={t("mobile.pullRequestStatusRows.viewReviewersOnProvider")}
              icon="arrow.up.right"
              onPress={() => void openContentUrl(props.pr.url)}
            />
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
