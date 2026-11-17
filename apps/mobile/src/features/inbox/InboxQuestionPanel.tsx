import { useAtomValue } from "@effect/atom-react";
import { type EnvironmentId, type InboxItem } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useResolveClassNames } from "uniwind";
import { RelativeTime } from "../../components/RelativeTime";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { ListSection } from "../../components/ui/ListSection";
import { RowPressable } from "../../components/ui/RowPressable";
import { Toast } from "../../components/ui/Toast";
import { useI18n } from "../../i18n/useI18n";
import { cn } from "../../lib/cn";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";

// Unsent answers survive switching questions and dismissing either sheet.
const drafts = new Map<string, string>();

/** Urgent questions read red and hands-on actions amber; plain decisions stay quiet. */
export function InboxItemIcon({ item, size = 18 }: { item: InboxItem; size?: number }) {
  return (
    <SymbolView
      name={
        item.urgent
          ? "exclamationmark.circle"
          : item.kind === "action"
            ? "wrench.and.screwdriver"
            : "questionmark.bubble"
      }
      size={size}
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

/** Where a question came from: its thread, or the folder it was asked in when T3 has no thread for it. */
export function useQuestionOrigin(item: InboxItem) {
  const { t } = useI18n();
  if (item.thread === null) {
    const folder = item.workspace.split("/").findLast(Boolean);
    return { project: null, title: folder || item.agent || t("inbox.unknownThread") };
  }
  return {
    project: item.thread.projectTitle || t("inbox.other"),
    title: item.thread.title || t("inbox.untitledThread"),
  };
}

/** The question's thread as a grouped row; tapping it opens the thread. */
export function InboxSourceRow({
  item,
  environmentId,
  environmentLabel,
  onOpenThread,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  environmentLabel: string | null;
  onOpenThread?: () => void;
}) {
  const { t } = useI18n();
  const origin = useQuestionOrigin(item);
  const selectDetail = useSelectWorkspaceDetail();
  const rippleStyle = useResolveClassNames("bg-subtle-strong");
  const thread = item.thread;
  const crumbs = [environmentLabel, origin.project].filter(Boolean).join(" · ");
  return (
    <ListSection>
      <RowPressable
        accessibilityRole={thread ? "button" : undefined}
        accessibilityLabel={thread ? `${t("inbox.openThread")}, ${origin.title}` : origin.title}
        disabled={thread === null}
        onPress={() => {
          if (thread === null) return;
          onOpenThread?.();
          selectDetail({ name: "Thread", params: { environmentId, threadId: thread.id } });
        }}
        android_ripple={{ color: rippleStyle.backgroundColor }}
        unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
        className="bg-grouped-card"
      >
        <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">
          <SymbolView
            name="bubble.left"
            size={20}
            tintColorClassName="accent-icon"
            type="monochrome"
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text textRole="body" className="text-foreground" numberOfLines={1}>
              {origin.title}
            </Text>
            {crumbs ? (
              <Text textRole="footnote" className="text-foreground-muted" numberOfLines={1}>
                {crumbs}
              </Text>
            ) : null}
          </View>
          {thread ? (
            <SymbolView
              name="chevron.right"
              size={16}
              tintColorClassName="accent-chevron"
              type="monochrome"
              weight="semibold"
            />
          ) : null}
        </View>
      </RowPressable>
    </ListSection>
  );
}

/** One ask-human question with everything needed to answer or close it. */
export function InboxQuestionPanel({
  item,
  environmentId,
  onResolved,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  /** Called once the question is answered or closed. */
  onResolved?: () => void;
}) {
  const { t } = useI18n();
  const markdownStyles = useMarkdownPreviewStyles();
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-1.5">
        {item.urgent || item.kind === "action" ? (
          <>
            <InboxItemIcon item={item} size={14} />
            <Text
              textRole="label"
              className={cn(
                "font-t3-semibold",
                item.urgent ? "text-danger-foreground" : "text-warning-foreground",
              )}
            >
              {item.urgent ? t("inbox.urgent") : t("inbox.action")}
            </Text>
            {item.agent ? (
              <Text textRole="label" className="text-foreground-muted">
                ·
              </Text>
            ) : null}
          </>
        ) : null}
        <Text textRole="label" className="min-w-0 flex-1 text-foreground-muted" numberOfLines={1}>
          {item.agent}
        </Text>
        <Text textRole="label" className="tabular-nums text-foreground-muted">
          <RelativeTime timestamp={item.urgentAt ?? item.createdAt} />
        </Text>
      </View>
      <SelectableMarkdownText
        markdown={item.question}
        textStyle={markdownStyles.nativeTextStyle}
        onLinkPress={(href) => void tryOpenExternalUrl(href, "markdown-link")}
      />
      {item.urgent && item.urgentReason ? (
        <View className="rounded-xl border border-danger-border bg-danger px-3 py-2.5">
          <Text textRole="footnote" className="leading-5 text-danger-foreground">
            {t("inbox.urgentReason", { reason: item.urgentReason })}
          </Text>
        </View>
      ) : null}
      {item.context ? (
        <Text textRole="footnote" className="leading-5 text-foreground-muted">
          {item.context}
        </Text>
      ) : null}
      <AskHumanAnswer item={item} environmentId={environmentId} onResolved={onResolved} />
    </View>
  );
}

function AskHumanAnswer({
  item,
  environmentId,
  onResolved,
}: {
  item: InboxItem;
  environmentId: EnvironmentId;
  onResolved: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const draftKey = `${environmentId}:${item.id}`;
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; description?: string } | null>(null);
  const canAnswer = useAtomValue(serverEnvironment.answerAskHuman.permissionAtom(environmentId));
  const canClose = useAtomValue(serverEnvironment.closeAskHuman.permissionAtom(environmentId));
  const answer = useAtomCommand(serverEnvironment.answerAskHuman, { reportFailure: false });
  const close = useAtomCommand(serverEnvironment.closeAskHuman, { reportFailure: false });
  const setText = (value: string) => {
    setTextState(value);
    if (value) drafts.set(draftKey, value);
    else drafts.delete(draftKey);
  };
  const run = async (action: "answer" | "close", value: string) => {
    setBusy(true);
    setError(null);
    const result =
      action === "close"
        ? await close({ environmentId, input: { id: item.id, reason: value } })
        : await answer({ environmentId, input: { id: item.id, text: value } });
    setBusy(false);
    if (result._tag === "Success") {
      drafts.delete(draftKey);
      onResolved?.();
      return;
    }
    setSelected(null);
    const failure = squashAtomCommandFailure(result);
    setError({
      message:
        failure instanceof Error && "code" in failure && failure.code === "already_processed"
          ? t("inbox.alreadyProcessed")
          : action === "close"
            ? t("inbox.closeFailed")
            : t("inbox.submitFailed"),
      ...(failure instanceof Error ? { description: failure.message } : {}),
    });
  };
  const disabled = busy || !canAnswer;
  return (
    <View className="gap-3">
      {item.options.length > 0 ? (
        <View accessibilityRole="radiogroup" className="gap-2">
          {item.options.map((option) => {
            const checked = selected === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked, disabled }}
                disabled={disabled}
                className={cn(
                  "min-h-12 w-full flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-70",
                  checked ? "border-primary bg-primary/10" : "border-border bg-input",
                  disabled && !checked && "opacity-50",
                )}
                onPress={() => {
                  setSelected(option);
                  void run("answer", option);
                }}
              >
                <Text textRole="body" className="min-w-0 flex-1 text-foreground">
                  {option}
                </Text>
                {option === item.recommend ? (
                  <Text
                    textRole="caption"
                    className="rounded-full bg-subtle-strong px-2 py-0.5 text-foreground-muted"
                  >
                    {t("inbox.recommend")}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {item.recommend && !item.options.includes(item.recommend) ? (
        <Text textRole="footnote" className="text-foreground-muted">
          {t("inbox.recommendValue", { value: item.recommend })}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={t("inbox.answerPlaceholder")}
        placeholder={t("inbox.answerPlaceholder")}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        multiline
        textAlignVertical="top"
      />
      <Button
        label={t("inbox.answer")}
        tone={text.trim() ? "primary" : "secondary"}
        fullWidth
        disabled={disabled || !text.trim()}
        onPress={() => void run("answer", text.trim())}
      />
      {canClose ? (
        <Button
          label={t("inbox.close")}
          tone="text"
          fullWidth
          disabled={busy}
          onPress={() => void run("close", "")}
        />
      ) : null}
      {!canAnswer ? (
        <Text textRole="footnote" className="text-foreground-muted">
          {t("inbox.readOnly")}
        </Text>
      ) : null}
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
