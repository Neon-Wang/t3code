import { useAtomValue } from "@effect/atom-react";
import { type EnvironmentId, type InboxItem } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState, useSyncExternalStore } from "react";
import { msUntilRelativeTimeChange } from "../../lib/time";
import { Pressable, TextInput, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { Toast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";

function relativeTime(createdAt: string, t: ReturnType<typeof useI18n>["t"]) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 60_000));
  if (minutes < 1) return t("inbox.timeJustNow");
  if (minutes < 60) return t("inbox.timeMinutes", { count: minutes });
  if (minutes < 1440) return t("inbox.timeHours", { count: Math.floor(minutes / 60) });
  return t("inbox.timeDays", { count: Math.floor(minutes / 1440) });
}

function InboxTime({ createdAt }: { createdAt: string }) {
  const { t } = useI18n();
  const subscribe = (onChange: () => void) => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          onChange();
          schedule();
        },
        msUntilRelativeTimeChange(createdAt) ?? 60_000,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  };
  const getSnapshot = () => relativeTime(createdAt, t);
  const label = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <Text className="text-foreground-muted">{label}</Text>;
}

export function InboxQuestionPanel({
  item,
  environmentId,
  environmentLabel,
  showThread,
  onOpenThread,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  environmentLabel: string | null;
  showThread: boolean;
  onOpenThread?: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const selectDetail = useSelectWorkspaceDetail();
  const thread = item.thread;
  return (
    <View
      className={
        item.urgent
          ? "gap-3 rounded-2xl border border-danger-border bg-card p-4"
          : "gap-3 rounded-2xl border border-border-subtle bg-card p-4"
      }
    >
      <View className="flex-row flex-wrap gap-2">
        {item.urgent ? (
          <Text className="font-t3-bold text-danger-foreground">{t("inbox.urgent")}</Text>
        ) : null}
        <Text
          className={
            item.kind === "action" ? "font-t3-bold text-danger-foreground" : "text-foreground-muted"
          }
        >
          {item.kind === "action" ? t("inbox.action") : t("inbox.decision")}
        </Text>
        <Text className="text-foreground-muted">
          {thread === null
            ? t("inbox.unknownThread")
            : thread.active
              ? t("inbox.running")
              : t("inbox.ended")}
        </Text>
        <InboxTime createdAt={item.createdAt} />
      </View>
      {showThread && thread !== null ? (
        <Text className="text-sm text-foreground-muted">
          {environmentLabel ? `${environmentLabel} · ` : ""}
          {thread.projectTitle || t("inbox.other")} · {thread.title || t("inbox.untitledThread")}
        </Text>
      ) : null}
      <Text className="font-t3-semibold">{item.question}</Text>
      {item.urgent && item.urgentReason ? (
        <Text className="text-sm text-danger-foreground">
          {t("inbox.urgentReason", { reason: item.urgentReason })}
        </Text>
      ) : null}
      {item.agent ? <Text className="text-sm text-foreground-muted">{item.agent}</Text> : null}
      {item.context ? (
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
          >
            <Text className="text-primary-text">{t("inbox.context")}</Text>
          </Pressable>
          {expanded ? <Text>{item.context}</Text> : null}
        </View>
      ) : null}
      {thread === null ? (
        <View>
          {item.threadId ? (
            <Text className="text-sm text-foreground-muted">
              {t("inbox.threadId")}: {item.threadId}
            </Text>
          ) : null}
          {item.workspace ? (
            <Text className="text-sm text-foreground-muted">
              {t("inbox.workspace")}: {item.workspace}
            </Text>
          ) : null}
        </View>
      ) : null}
      <AskHumanAnswer item={item} environmentId={environmentId} />
      {thread !== null ? (
        <Button
          size="compact"
          label={t("inbox.openThread")}
          onPress={() => {
            onOpenThread?.();
            selectDetail({ name: "Thread", params: { environmentId, threadId: thread.id } });
          }}
        />
      ) : null}
    </View>
  );
}

function AskHumanAnswer({
  item,
  environmentId,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAnswer = useAtomValue(serverEnvironment.answerAskHuman.permissionAtom(environmentId));
  const canClose = useAtomValue(serverEnvironment.closeAskHuman.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.answerAskHuman, { reportFailure: false });
  const close = useAtomCommand(serverEnvironment.closeAskHuman, { reportFailure: false });
  const submit = async (value: string, isClose = false) => {
    setBusy(true);
    setError(null);
    const result = isClose
      ? await close({ environmentId, input: { id: item.id, reason: value } })
      : await answer({ environmentId, input: { id: item.id, text: value } });
    setBusy(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setError(
        failure instanceof Error && "code" in failure && failure.code === "already_processed"
          ? t("inbox.alreadyProcessed")
          : failure instanceof Error
            ? failure.message
            : isClose
              ? t("inbox.closeFailed")
              : t("inbox.submitFailed"),
      );
    }
  };
  return (
    <View className="gap-3">
      {item.options.map((option) => (
        <Button
          key={option}
          label={option === item.recommend ? `${option} · ${t("inbox.recommend")}` : option}
          tone={option === item.recommend ? "primary" : "secondary"}
          disabled={busy || !canAnswer}
          onPress={() => void submit(option)}
        />
      ))}
      {item.recommend && !item.options.includes(item.recommend) ? (
        <Text>
          {t("inbox.recommend")}: {item.recommend}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={t("inbox.answerPlaceholder")}
        placeholder={t("inbox.answerPlaceholder")}
        placeholderTextColorClassName="accent-foreground-muted"
        value={text}
        onChangeText={setText}
        readOnly={busy || !canAnswer}
        multiline
        className="min-h-16 rounded-xl border border-border-subtle p-3 text-base text-foreground"
      />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t("inbox.answer")}
          tone="primary"
          disabled={busy || !canAnswer || !text.trim()}
          onPress={() => void submit(text.trim())}
        />
        <Button
          label={closing ? t("inbox.cancel") : t("inbox.close")}
          tone="text"
          disabled={busy || !canClose}
          onPress={() => setClosing(!closing)}
        />
      </View>
      {closing ? (
        <>
          <TextInput
            accessibilityLabel={t("inbox.reason")}
            placeholder={t("inbox.reason")}
            placeholderTextColorClassName="accent-foreground-muted"
            value={reason}
            onChangeText={setReason}
            readOnly={busy || !canClose}
            multiline
            className="min-h-16 rounded-xl border border-border-subtle p-3 text-base text-foreground"
          />
          <Button
            label={t("inbox.close")}
            tone="danger"
            disabled={busy || !canClose}
            onPress={() => void submit(reason, true)}
          />
        </>
      ) : null}
      {!canAnswer ? <Text className="text-foreground-muted">{t("inbox.readOnly")}</Text> : null}
      {error ? <Toast message={error} tone="danger" onDismiss={() => setError(null)} /> : null}
    </View>
  );
}
