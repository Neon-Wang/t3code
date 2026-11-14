import { useAtomValue } from "@effect/atom-react";
import { type EnvironmentId, type InboxItem } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { RelativeTime } from "../../components/RelativeTime";
import { SymbolView } from "../../components/ui/AppSymbol";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { cn } from "../../lib/cn";
import { Pressable, TextInput, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { Toast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";

// Unsent answers and close reasons survive switching questions and dismissing either sheet.
const drafts = new Map<string, { text: string; reason: string }>();

export function InboxItemIcon({ item }: { item: InboxItem }) {
  return (
    <SymbolView
      name={
        item.urgent
          ? "exclamationmark.circle"
          : item.kind === "action"
            ? "wrench.and.screwdriver"
            : "questionmark.bubble"
      }
      size={18}
      tintColorClassName={
        item.urgent
          ? "accent-danger-foreground"
          : item.kind === "action"
            ? "accent-warning-foreground"
            : "accent-foreground-muted"
      }
      type="monochrome"
    />
  );
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
  const markdownStyles = useMarkdownPreviewStyles();
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
      <View className="flex-row flex-wrap items-center gap-2">
        <InboxItemIcon item={item} />
        {item.urgent ? (
          <Text className="font-t3-bold text-danger-foreground">{t("inbox.urgent")}</Text>
        ) : null}
        <Text
          className={
            item.kind === "action"
              ? "font-t3-bold text-warning-foreground"
              : "text-foreground-muted"
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
        <Text className="text-xs text-foreground-muted">
          <RelativeTime timestamp={item.urgentAt ?? item.createdAt} />
        </Text>
      </View>
      {showThread && thread !== null ? (
        <Text className="text-sm text-foreground-muted">
          {environmentLabel ? `${environmentLabel} · ` : ""}
          {thread.projectTitle || t("inbox.other")} · {thread.title || t("inbox.untitledThread")}
        </Text>
      ) : null}
      <SelectableMarkdownText
        markdown={item.question}
        textStyle={markdownStyles.nativeTextStyle}
        onLinkPress={(href) => void tryOpenExternalUrl(href, "markdown-link")}
      />
      {item.urgent && item.urgentReason ? (
        <Text className="text-sm text-danger-foreground">
          {t("inbox.urgentReason", { reason: item.urgentReason })}
        </Text>
      ) : null}
      {item.agent ? <Text className="text-sm text-foreground-muted">{item.agent}</Text> : null}
      {item.context ? (
        <View className="gap-2">
          <Text className="text-sm font-t3-semibold text-foreground-muted">
            {t("inbox.context")}
          </Text>
          <Text>{item.context}</Text>
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
  const draftKey = `${environmentId}:${item.id}`;
  const [text, setTextState] = useState(() => drafts.get(draftKey)?.text ?? "");
  const [reason, setReasonState] = useState(() => drafts.get(draftKey)?.reason ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const setText = (value: string) => {
    setTextState(value);
    if (value || reason) drafts.set(draftKey, { text: value, reason });
    else drafts.delete(draftKey);
  };
  const setReason = (value: string) => {
    setReasonState(value);
    if (text || value) drafts.set(draftKey, { text, reason: value });
    else drafts.delete(draftKey);
  };
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; description?: string } | null>(null);
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
    if (result._tag === "Success") {
      drafts.delete(draftKey);
      setTextState("");
      setReasonState("");
      return;
    }
    setSelected(null);
    const failure = squashAtomCommandFailure(result);
    setError({
      message:
        failure instanceof Error && "code" in failure && failure.code === "already_processed"
          ? t("inbox.alreadyProcessed")
          : isClose
            ? t("inbox.closeFailed")
            : t("inbox.submitFailed"),
      ...(failure instanceof Error ? { description: failure.message } : {}),
    });
  };
  return (
    <View className="gap-3">
      <View accessibilityRole="radiogroup" className="gap-1">
        {item.options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === option, disabled: busy || !canAnswer }}
            disabled={busy || !canAnswer}
            className={cn(
              "min-h-11 flex-row items-start gap-2 py-2",
              (busy || !canAnswer) && "opacity-50",
            )}
            onPress={() => {
              setSelected(option);
              void submit(option);
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <SymbolView
              name={selected === option ? "circle.inset.filled" : "circle"}
              size={18}
              tintColorClassName={
                selected === option ? "accent-primary-text" : "accent-foreground-muted"
              }
            />
            <Text className="min-w-0 flex-1 text-sm">{option}</Text>
            {option === item.recommend ? (
              <Text className="text-xs text-foreground-muted">{t("inbox.recommend")}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
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
      {error ? (
        <Toast
          message={error.message}
          description={error.description}
          tone="danger"
          onDismiss={() => setError(null)}
        />
      ) : null}
    </View>
  );
}
