import { Atom } from "effect/reactivity";
import {
  fullAccessOverrideExplanation,
  seedUserInputDraftAnswers,
} from "@t3tools/client-runtime/state/thread-requests";
import {
  buildPendingUserInputAnswers,
  isPendingUserInputOptionSelected,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
} from "@t3tools/client-runtime/state/pending-user-input";
import { limitRecoveryOwnsSnooze } from "@t3tools/client-runtime/state/thread-execution";
import {
  CHATGPT_USAGE_LIMIT_CODE,
  CHATGPT_WORKSPACE_USAGE_LIMIT_CODE,
} from "@t3tools/shared/usageLimits";
import { translate } from "./locale.js";

export function createThreadCards({ registry, lists, details, run }) {
  const drafts = Atom.family(() => Atom.make({}).pipe(Atom.keepAlive));
  const busy = Atom.family(() => Atom.make(false));
  const key = (ref) => JSON.stringify([ref.environmentId, ref.threadId]);
  const questionKey = (ref, requestId) =>
    JSON.stringify([ref.environmentId, ref.threadId, requestId]);
  const recovery = (shell) => {
    const resetAt = shell?.runtime?.usageLimitResetAt;
    const runId = shell?.latestRun?.runId;
    const code = shell?.runtime?.lastErrorCode;
    if (
      shell?.runtime?.status !== "failed" ||
      !runId ||
      (shell.runtime.lastErrorClass !== "usage_limit" &&
        code !== CHATGPT_USAGE_LIMIT_CODE &&
        code !== CHATGPT_WORKSPACE_USAGE_LIMIT_CODE)
    )
      return null;
    const canSchedule =
      shell.settledOverride !== "settled" &&
      !!resetAt &&
      Date.parse(resetAt) > Date.parse(shell.latestRun?.completedAt ?? shell.updatedAt);
    const scheduled =
      shell.limitRecovery?.runId === runId &&
      shell.limitRecovery?.resetAt === resetAt &&
      shell.limitRecovery?.autoResume;
    const snoozed = limitRecoveryOwnsSnooze({
      runId,
      resetAt,
      recovery: shell.limitRecovery,
      snoozedUntil: shell.snoozedUntil,
    });
    return { runId, resetAt, canSchedule, scheduled, snoozed };
  };
  return {
    view(get, ref, shell, writable) {
      const pending = get(details.pendingRequestsAtom(ref));
      const disabled = !writable || get(busy(key(ref)));
      const cards = [];
      if (shell?.runtime?.status === "preparing")
        cards.push({
          id: "workspace-preparation",
          type: "placeholder",
          title: translate("Preparing workspace"),
          detail: translate("View worktree setup details in the web app."),
          questions: [],
          buttons: [],
        });
      for (const approval of pending?.approvals ?? []) {
        cards.push({
          id: approval.requestId,
          type: "approval",
          title: approval.appName ?? approval.requestKind,
          detail: [
            approval.detail,
            approval.reason,
            approval.fullAccessOverride
              ? fullAccessOverrideExplanation(approval.fullAccessOverride)
              : "",
            approval.responseCapability !== "live"
              ? translate("This approval is no longer available. Stop or restart the run.")
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          questions: [],
          buttons: (
            approval.options ?? [
              { decision: "accept", label: translate("mobile.pendingApprovalCard.allowOnce") },
              {
                decision: "acceptForSession",
                label: translate("mobile.pendingApprovalCard.allowSession"),
              },
              { decision: "decline", label: translate("mobile.pendingApprovalCard.decline") },
            ]
          ).map((option) => ({
            action: "approval",
            value: option.decision,
            label: [option.label, option.warning].filter(Boolean).join(" · "),
            disabled: disabled || approval.responseCapability !== "live",
          })),
        });
      }
      for (const request of pending?.userInputs ?? []) {
        const answers = seedUserInputDraftAnswers(
          request.questions,
          get(drafts(questionKey(ref, request.requestId))),
        );
        const unavailable = disabled || request.responseCapability === "not_resumable";
        cards.push({
          id: request.requestId,
          type: "question",
          title: translate("Input needed"),
          detail:
            request.responseCapability === "not_resumable"
              ? translate("This question is no longer available. Restart the run.")
              : "",
          questions: request.questions.map((question) => ({
            id: question.id,
            title: question.header,
            text: question.question,
            custom: answers[question.id]?.customAnswer ?? "",
            allowCustom: question.allowCustomAnswer !== false,
            disabled: unavailable,
            choices: question.options.map((option) => ({
              value: option.value ?? option.label,
              label: option.label,
              detail: option.description ?? "",
              selected: isPendingUserInputOptionSelected(
                question,
                answers[question.id],
                option.value ?? option.label,
              ),
            })),
          })),
          buttons: [
            {
              action: "answer",
              value: "",
              label: translate("mobile.threads.submitAnswers"),
              disabled:
                unavailable || buildPendingUserInputAnswers(request.questions, answers) === null,
            },
            ...(request.dismissible
              ? [
                  {
                    action: "dismiss",
                    value: "",
                    label: translate("mobile.threads.dismissWithoutAnswering"),
                    disabled: unavailable,
                  },
                ]
              : []),
          ],
        });
      }
      const limit = recovery(shell);
      if (limit)
        cards.push({
          id: limit.runId,
          type: "limit",
          title: translate("Usage limit reached"),
          detail: limit.resetAt
            ? translate("Resets {time}", { time: new Date(limit.resetAt).toLocaleString() })
            : translate("The provider did not report a reset time. Retry manually later."),
          questions: [],
          buttons: limit.canSchedule
            ? [
                {
                  action: "recovery",
                  value: "resume",
                  label: limit.scheduled
                    ? translate("Cancel auto-resume")
                    : translate("Resume when limits reset"),
                  disabled,
                },
                {
                  action: "recovery",
                  value: "snooze",
                  label: limit.snoozed ? translate("Wake") : translate("Snooze until limits reset"),
                  disabled: disabled || (!limit.snoozed && Date.parse(limit.resetAt) <= Date.now()),
                },
              ]
            : [],
        });
      const queue = get(details.queueWorkflowAtom(ref));
      for (const item of queue?.queuedRuns ?? [])
        cards.push({
          id: item.run.id,
          type: "queue",
          title: translate("Queued message"),
          detail: item.text,
          questions: [],
          buttons: [
            { action: "cancel-queue", value: "", label: translate("Remove"), disabled },
            ...(queue.canSendNow
              ? [{ action: "resume-queue", value: "", label: translate("Send now"), disabled }]
              : []),
          ],
        });
      return cards;
    },
    async action(ref, action, payload, shell) {
      const { id, value, questionId } = JSON.parse(payload);
      const pending = registry.get(details.pendingRequestsAtom(ref));
      const request = pending?.userInputs.find((request) => request.requestId === id);
      if (action === "choice" || action === "custom") {
        const question = request?.questions.find((question) => question.id === questionId);
        if (!question) throw new Error(translate("This question has closed."));
        const atom = drafts(questionKey(ref, id));
        const answers = seedUserInputDraftAnswers(request.questions, registry.get(atom));
        registry.set(atom, {
          ...answers,
          [questionId]:
            action === "choice"
              ? togglePendingUserInputOptionSelection(question, answers[questionId], value)
              : setPendingUserInputCustomAnswer(question, answers[questionId], value),
        });
        return;
      }
      if (registry.get(busy(key(ref)))) return;
      registry.set(busy(key(ref)), true);
      try {
        if (action === "approval")
          return await run(lists.commands.respondToApproval, ref, {
            requestId: id,
            decision: value,
          });
        if (action === "dismiss")
          return await run(lists.commands.dismissUserInput, ref, { requestId: id });
        if (action === "answer") {
          if (!request) throw new Error(translate("This question has closed."));
          const answers = buildPendingUserInputAnswers(
            request.questions,
            seedUserInputDraftAnswers(
              request.questions,
              registry.get(drafts(questionKey(ref, id))),
            ),
          );
          if (!answers) throw new Error(translate("Answer all questions"));
          return await run(lists.commands.respondToUserInput, ref, { requestId: id, answers });
        }
        if (action === "cancel-queue")
          return await run(lists.commands.cancelQueuedRun, ref, { runId: id });
        if (action === "resume-queue")
          return await run(lists.commands.resumeThreadQueue, ref, { runId: id });
        if (action === "recovery") {
          const limit = recovery(shell);
          if (!limit?.canSchedule) throw new Error(translate("Reset time unavailable"));
          if (value === "snooze" && !limit.snoozed && Date.parse(limit.resetAt) <= Date.now())
            throw new Error(translate("The reset time has passed. Retry manually."));
          return await run(lists.commands.updateMetadata, ref, {
            limitRecovery: {
              runId: limit.runId,
              resetAt: limit.resetAt,
              ...(value === "resume"
                ? { autoResume: !limit.scheduled }
                : { snooze: !limit.snoozed }),
            },
          });
        }
        throw new Error(translate("Unknown card action"));
      } finally {
        registry.set(busy(key(ref)), false);
      }
    },
  };
}
