import * as Dialog from "../../components/ui/Dialog";
import { useI18n } from "../../i18n/useI18n";
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { PullRequestDetail, PullRequestMergeMethod } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useRef, useState } from "react";
import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { SplitButton } from "../../components/ui/SplitButton";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { composerPullRequests } from "../../state/pull-requests";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  allowedMergeMethods,
  canPerformPullRequestAction,
  mergeUnavailableReason,
  mergeConflictReason,
  MERGE_METHODS,
  pullRequestActionLabel,
} from "./pullRequestActions";
import { pullRequestStackMerge, singlePullRequestMergeAllowed } from "./pullRequestStack";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";
import { usePullRequestPermissions } from "./usePullRequestPermissions";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import type { PullRequestStackState } from "./usePullRequestStack";

export function PullRequestMergeControls(props: {
  readonly pr: PullRequestDetail;
  readonly params: PullRequestParams;
  readonly stack: PullRequestStackState;
}) {
  const { t } = useI18n();
  const { pr, stack } = props;
  const terminology = sourceControlClients.get(pr.provider).changeRequest;
  const target = pullRequestTarget(props.params);
  const permissions = usePullRequestPermissions(props.params, pr);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const runAction = useAtomCommand(composerPullRequests.runAction, { reportFailure: false });
  const refreshDetail = useAtomRefresh(composerPullRequests.detail(target));
  const refreshActivity = useAtomRefresh(composerPullRequests.activity(target));
  const [selectedMethod, setSelectedMethod] = useState<PullRequestMergeMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const methods = allowedMergeMethods(pr);
  const preferred =
    selectedMethod ??
    (AsyncResult.isSuccess(preferences) ? preferences.value.pullRequestMergeMethod : undefined) ??
    "squash";
  const method = methods.includes(preferred)
    ? preferred
    : methods.includes("squash")
      ? "squash"
      : methods[0];
  const scope = stack.stack ? pullRequestStackMerge(stack.stack, pr.number, terminology) : null;
  const canMergeSingle = singlePullRequestMergeAllowed({
    supportsStackActions: stack.supportsStackActions,
    hasStack: stack.stack !== null,
    isFresh: stack.isFresh,
  });
  const checkingStack =
    permissions.connected && stack.supportsStackActions && !stack.isFresh && !stack.error;
  const refreshStackReason = t("mobile.pullRequestMergeControls.refreshStackBeforeMerging");
  const checkingStackReason = t("mobile.pullRequestMergeControls.checkingStack");
  const reason =
    (!permissions.connected
      ? t("mobile.pullRequestMergeControls.reconnectToMergePeriod")
      : mergeUnavailableReason(pr, permissions.canWrite, terminology)) ??
    (stack.stack
      ? !stack.supportsStackActions
        ? t("mobile.pullRequestMergeControls.cannotMergeStacks")
        : !stack.isFresh
          ? refreshStackReason
          : scope?.reason
      : !canMergeSingle
        ? stack.error
          ? t("mobile.pullRequestMergeControls.couldntCheckStack")
          : checkingStackReason
        : null);
  const canMerge = !busy && method !== undefined && !reason;
  const label = method
    ? scope && scope.layers.length > 1
      ? t("mobile.pullRequestMergeControls.methodStackCount", {
          method: MERGE_METHODS[method].title,
          count: scope.layers.length,
        })
      : MERGE_METHODS[method].title
    : t("mobile.pullRequestMergeControls.mergeUnavailable");
  const autoAction = pr.autoMergeEnabled ? "disable-auto-merge" : "enable-auto-merge";
  const canAutoMerge =
    !busy &&
    (autoAction === "disable-auto-merge" || (!stack.stack && canMergeSingle)) &&
    permissions.canWrite &&
    canPerformPullRequestAction(pr, autoAction);

  const perform = async (action: "merge" | "enable-auto-merge" | "disable-auto-merge") => {
    if (
      pending.current ||
      (action !== "disable-auto-merge" && !method) ||
      (action === "merge" ? !canMerge : !canAutoMerge)
    )
      return;
    pending.current = true;
    setBusy(true);
    const response = await runAction({
      ...target,
      input: {
        ...target.input,
        action,
        ...(action === "merge" && method && stack.stack && scope
          ? {
              stackNumber: stack.stack.number,
              expectedStackHeads: scope.heads,
              mergeMethod: method,
            }
          : action === "merge" && method
            ? {
                resolveMergeMethod: (fresh) => {
                  if (
                    !canPerformPullRequestAction(fresh, "merge") ||
                    !allowedMergeMethods(fresh).includes(method)
                  )
                    throw new Error(
                      t("mobile.pullRequestMergeControls.termChangedRefresh", {
                        term: terminology.singular,
                      }),
                    );
                  return method;
                },
              }
            : action === "enable-auto-merge" && method
              ? { mergeMethod: method }
              : {}),
      },
    });
    // A stack can partly merge before the provider reports a failure.
    refreshDetail();
    refreshActivity();
    stack.refresh();
    pending.current = false;
    setBusy(false);
    if (AsyncResult.isFailure(response)) {
      const cause = squashAtomCommandFailure(response);
      Dialog.alert(
        t("mobile.pullRequestMergeControls.couldntCompleteTheMergeAction"),
        cause instanceof Error ? cause.message : t("mobile.promptlinkactions.tryAgain"),
      );
    }
  };
  const confirm = (action: "merge" | "enable-auto-merge" | "disable-auto-merge") => {
    const title =
      action === "merge"
        ? scope && scope.layers.length > 1
          ? t("mobile.pullRequestMergeControls.mergeStackLayersTitle", {
              count: scope.layers.length,
            })
          : `${pullRequestActionLabel("merge", terminology)}?`
        : action === "enable-auto-merge"
          ? t("pr.enableAutoMergeText")
          : t("mobile.pullRequestMergeControls.disableAutoMergeTitle");
    const message =
      action === "merge" && scope
        ? t("mobile.pullRequestMergeControls.stackMergeMessage", {
            layers: scope.layers.map((layer) => `#${layer.number}`).join(" → "),
            base: stack.stack?.base ?? "",
            method: method ?? "",
            number: pr.number,
          })
        : action === "enable-auto-merge"
          ? t("mobile.pullRequestMergeControls.enableAutoMergeMessage", {
              number: pr.number,
              method: method ?? "",
            })
          : action === "disable-auto-merge"
            ? t("mobile.pullRequestMergeControls.disableAutoMergeMessage", {
                term: terminology.singular,
              })
            : t("mobile.pullRequestMergeControls.mergeMessage", {
                number: pr.number,
                base: pr.baseBranch,
                method: method ?? "",
              });
    Dialog.alert(title, message, [
      { text: t("mobile.pullRequestMergeControls.cancel"), style: "cancel" },
      {
        text:
          action === "merge"
            ? label
            : action === "enable-auto-merge"
              ? t("pr.enableAutoMerge")
              : t("pr.disableAutoMerge"),
        onPress: () => void perform(action),
      },
    ]);
  };
  return (
    <View className="gap-2 border-t border-border-subtle p-3">
      <SplitButton
        label={
          busy
            ? t("pr.working")
            : !permissions.connected
              ? t("mobile.pullRequestMergeControls.reconnectToMerge")
              : label
        }
        accessibilityLabel={
          scope
            ? t("mobile.pullRequestMergeControls.labelCountStackLayersThroughNumber", {
                label,
                count: scope.layers.length,
                number: pr.number,
              })
            : label
        }
        icon={PullRequestGlyph.merged}
        disabled={!canMerge}
        loading={busy || checkingStack}
        onPress={() => confirm("merge")}
        menuTitle={t("mobile.pullRequestMergeControls.mergeOptions")}
        actions={[
          ...methods.map((id) => ({
            id,
            title: MERGE_METHODS[id].title,
            state: id === method ? ("on" as const) : ("off" as const),
            attributes: { disabled: !canMerge && !canAutoMerge },
          })),
          ...(canAutoMerge
            ? [
                {
                  id: autoAction,
                  title: pr.autoMergeEnabled ? t("pr.disableAutoMerge") : t("pr.enableAutoMerge"),
                  image: "clock",
                },
              ]
            : []),
        ]}
        onPressAction={(id) => {
          const selected = methods.find((method) => method === id);
          if (selected) {
            setSelectedMethod(selected);
            savePreferences({ pullRequestMergeMethod: selected });
          } else if (id === autoAction && canAutoMerge) confirm(autoAction);
        }}
      />
      {permissions.connected &&
      reason &&
      reason !== mergeConflictReason() &&
      reason !== checkingStackReason &&
      !(checkingStack && reason === refreshStackReason) ? (
        <Text className="px-1 text-xs text-foreground-muted">{reason}</Text>
      ) : null}
      {pr.autoMergeEnabled ? (
        <Text className="px-1 text-xs text-foreground-muted">
          {t("mobile.pullRequestMergeControls.automergeIsEnabled")}
          {pr.autoMergeMethod ? ` · ${pr.autoMergeMethod}` : ""}
        </Text>
      ) : null}
      {stack.error && stack.supportsStackActions ? (
        <Button
          label={t("mobile.pullRequestMergeControls.retryStackLookup")}
          tone="text"
          onPress={stack.refresh}
        />
      ) : null}
    </View>
  );
}
