import { inboxRows } from "@t3tools/client-runtime/state/inbox-rows";
import type { EnvironmentId, InboxItem } from "@t3tools/contracts";
import { useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";
import { RelativeTime } from "../../components/RelativeTime";
import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { RowPressable } from "../../components/ui/RowPressable";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { Sheet } from "../../components/ui/Sheet";
import { useI18n } from "../../i18n/useI18n";
import { cn } from "../../lib/cn";
import { useInboxEnvironments } from "../../state/inbox";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsSection } from "../settings/components/SettingsSection";
import {
  InboxItemIcon,
  InboxQuestionPanel,
  InboxSourceRow,
  useQuestionOrigin,
} from "./InboxQuestionPanel";

const MAX_CONTENT_WIDTH = 720;

interface QuestionRow {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string | null;
  readonly item: InboxItem;
  readonly showThread: boolean;
}

interface Section {
  readonly key: string;
  readonly title: string | undefined;
  readonly urgent: boolean;
  /** Why an environment lists nothing: still loading, failed, or without ask-human. */
  readonly status: { readonly text: string; readonly failed: boolean } | null;
  readonly questions: QuestionRow[];
}

export function InboxScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const environments = useInboxEnvironments();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const showEnvironment = environments.length > 1;

  // Settings-style groups: urgent first, then one group per project, named after its environment
  // when several are connected. Rows name their thread, so thread headings are dropped.
  const sections: Section[] = [];
  let environmentLabel = "";
  for (const row of inboxRows(environments)) {
    switch (row.kind) {
      case "urgent-header":
        sections.push({
          key: row.key,
          title: t("inbox.urgent"),
          urgent: true,
          status: null,
          questions: [],
        });
        break;
      case "environment": {
        const environment = row.environment;
        environmentLabel = environment.label;
        const text = environment.failed
          ? t("inbox.failed")
          : environment.pending && environment.snapshot === null
            ? t("inbox.loading")
            : environment.snapshot?.askHumanAvailable === false
              ? t("inbox.unavailable")
              : null;
        if (text !== null) {
          sections.push({
            key: row.key,
            title: showEnvironment ? environment.label : undefined,
            urgent: false,
            status: { text, failed: environment.failed },
            questions: [],
          });
        }
        break;
      }
      case "project": {
        const project = row.title || t("inbox.other");
        sections.push({
          key: row.key,
          title: showEnvironment ? `${environmentLabel} · ${project}` : project,
          urgent: false,
          status: null,
          questions: [],
        });
        break;
      }
      case "thread":
        break;
      case "question":
        sections.at(-1)?.questions.push(row);
        break;
    }
  }
  const questions = sections.flatMap((section) => section.questions);
  const selected = questions.find((row) => row.key === selectedKey) ?? null;
  const empty = sections.length === 0;

  return (
    <SettingsScreen title={t("inbox.title")} workspaceRoot>
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
        contentContainerClassName="px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <View className="w-full gap-6 self-center" style={{ maxWidth: MAX_CONTENT_WIDTH }}>
          {empty ? (
            <Text textRole="body" className="py-12 text-center text-foreground-muted">
              {environments.length === 0 ? t("inbox.noEnvironments") : t("inbox.empty")}
            </Text>
          ) : null}
          {sections.map((section) => (
            <SettingsSection
              key={section.key}
              title={section.title}
              titleIcon={
                section.urgent ? (
                  <SymbolView
                    name="exclamationmark.circle"
                    size={14}
                    tintColorClassName="accent-danger-foreground"
                    type="monochrome"
                  />
                ) : undefined
              }
            >
              {section.status ? (
                <View className="min-h-14 justify-center px-4 py-3">
                  <Text
                    accessibilityRole={section.status.failed ? "alert" : undefined}
                    textRole="footnote"
                    className="text-foreground-muted"
                  >
                    {section.status.text}
                  </Text>
                </View>
              ) : null}
              {section.questions.map((row, index) => (
                <InboxQuestionListRow
                  key={row.key}
                  row={row}
                  separated={index > 0}
                  onPress={() => setSelectedKey(row.key)}
                />
              ))}
            </SettingsSection>
          ))}
        </View>
      </ScreenScrollView>
      {selected ? (
        <Sheet key={selected.key} title={t("inbox.title")} onClose={() => setSelectedKey(null)}>
          <ScreenScrollView
            className="flex-1 bg-sheet-solid"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerClassName="gap-5 p-5"
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <InboxSourceRow
              item={selected.item}
              environmentId={selected.environmentId}
              environmentLabel={
                showEnvironment
                  ? (environments.find(
                      (environment) => environment.environmentId === selected.environmentId,
                    )?.label ?? null)
                  : null
              }
              onOpenThread={() => setSelectedKey(null)}
            />
            <InboxQuestionPanel item={selected.item} environmentId={selected.environmentId} />
          </ScreenScrollView>
        </Sheet>
      ) : null}
    </SettingsScreen>
  );
}

function InboxQuestionListRow({
  row,
  separated,
  onPress,
}: {
  row: QuestionRow;
  separated: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const origin = useQuestionOrigin(row.item);
  const rippleStyle = useResolveClassNames("bg-subtle-strong");
  // Without a thread, who asked says more in a list than the folder does.
  const where = [
    row.environmentLabel,
    origin.project === null
      ? row.item.agent || origin.title
      : row.showThread
        ? `${origin.project} › ${origin.title}`
        : origin.title,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <RowPressable
      accessibilityRole="button"
      accessibilityLabel={[
        row.item.urgent ? t("inbox.urgent") : null,
        row.item.kind === "action" ? t("inbox.action") : t("inbox.decision"),
        row.item.question,
        where,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      android_ripple={{ color: rippleStyle.backgroundColor }}
      unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
      className={cn("bg-grouped-card", separated && "border-t border-border-subtle")}
    >
      <View className="min-h-18 flex-row items-center gap-3 px-4 py-3">
        <View className="size-6 items-center justify-center">
          <InboxItemIcon item={row.item} size={20} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text textRole="body" className="text-foreground" numberOfLines={2}>
            {row.item.question}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text
              textRole="footnote"
              className="min-w-0 flex-1 text-foreground-muted"
              numberOfLines={1}
            >
              {where}
            </Text>
            <Text textRole="footnote" className="tabular-nums text-foreground-muted">
              <RelativeTime timestamp={row.item.urgentAt ?? row.item.createdAt} />
            </Text>
          </View>
        </View>
        <SymbolView
          name="chevron.right"
          size={16}
          tintColorClassName="accent-chevron"
          type="monochrome"
          weight="semibold"
        />
      </View>
    </RowPressable>
  );
}
