import { useState } from "react";
import { Pressable, View } from "react-native";
import { RelativeTime } from "../../components/RelativeTime";
import { Sheet } from "../../components/ui/Sheet";
import { cn } from "../../lib/cn";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useInboxEnvironments } from "../../state/inbox";
import { inboxRows } from "@t3tools/client-runtime/state/inbox-rows";
import { useWorkspaceTabs } from "../layout/workspace/WorkspaceTabsContext";
import { InboxItemIcon, InboxQuestionPanel } from "./InboxQuestionPanel";

export function InboxScreen() {
  const { t } = useI18n();
  const environments = useInboxEnvironments();
  const workspace = useWorkspaceTabs();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const rows = inboxRows(environments);
  const selectedRow = rows.find((row) => row.key === selectedKey);
  const selectedQuestion = selectedRow?.kind === "question" ? selectedRow : null;
  return (
    <>
      <NativeStackScreenOptions
        options={{ title: t("inbox.title"), headerSearchBarOptions: undefined }}
      />
      <ScreenScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: workspace?.bottomClearance ?? 16,
          gap: 0,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-4 text-2xl font-t3-bold">{t("inbox.title")}</Text>
        {environments.length === 0 ? <Text>{t("inbox.noEnvironments")}</Text> : null}
        {rows.map((row) => {
          switch (row.kind) {
            case "urgent-header":
              return (
                <Text key={row.key} className="mb-2 text-lg font-t3-bold text-danger-foreground">
                  {t("inbox.urgent")}
                </Text>
              );
            case "environment": {
              const environment = row.environment;
              return (
                <View key={row.key} className="gap-2">
                  {environments.length > 1 ? (
                    <Text className="text-lg font-t3-bold">{environment.label}</Text>
                  ) : null}
                  {environment.failed ? (
                    <Text accessibilityRole="alert">{t("inbox.failed")}</Text>
                  ) : environment.pending && environment.snapshot === null ? (
                    <Text>{t("inbox.loading")}</Text>
                  ) : null}
                  {environment.snapshot?.askHumanAvailable === false ? (
                    <Text className="text-foreground-muted">{t("inbox.unavailable")}</Text>
                  ) : null}
                  {environment.snapshot?.items.length === 0 ? (
                    <Text>{t("inbox.empty")}</Text>
                  ) : null}
                </View>
              );
            }
            case "project":
              return (
                <Text key={row.key} className="mt-4 text-lg font-t3-bold">
                  {row.title || t("inbox.other")}
                </Text>
              );
            case "thread":
              return (
                <Text key={row.key} className="mt-2 font-t3-semibold">
                  {row.title || t("inbox.untitledThread")}
                </Text>
              );
            case "question":
              return (
                <Pressable
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.item.urgent ? `${t("inbox.urgent")}, ` : ""}${row.item.kind === "action" ? t("inbox.action") : t("inbox.decision")}, ${row.item.question}`}
                  accessibilityState={{ selected: row.key === selectedKey }}
                  className="min-h-16 flex-row items-center gap-3 border-b border-border-subtle py-3"
                  onPress={() => setSelectedKey(row.key)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <InboxItemIcon item={row.item} />
                  <View className="min-w-0 flex-1 gap-1">
                    <Text
                      className={cn(
                        "text-sm font-t3-medium",
                        row.item.urgent && "text-danger-foreground",
                      )}
                      numberOfLines={1}
                    >
                      {row.item.question}
                    </Text>
                    <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                      {row.environmentLabel ? `${row.environmentLabel} · ` : ""}
                      {row.item.thread
                        ? `${row.item.urgent ? `${row.item.thread.projectTitle || t("inbox.other")} · ` : ""}${row.item.thread.title || t("inbox.untitledThread")}`
                        : row.item.agent}
                    </Text>
                  </View>
                  <Text className="text-xs tabular-nums text-foreground-muted">
                    <RelativeTime timestamp={row.item.urgentAt ?? row.item.createdAt} />
                  </Text>
                </Pressable>
              );
          }
        })}
      </ScreenScrollView>
      {selectedQuestion ? (
        <Sheet
          key={selectedQuestion.key}
          title={t("inbox.title")}
          onClose={() => setSelectedKey(null)}
        >
          <ScreenScrollView
            className="flex-1"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <InboxQuestionPanel
              key={selectedQuestion.key}
              item={selectedQuestion.item}
              environmentId={selectedQuestion.environmentId}
              environmentLabel={
                environments.find(
                  (environment) => environment.environmentId === selectedQuestion.environmentId,
                )?.label ?? null
              }
              showThread
              onOpenThread={() => setSelectedKey(null)}
            />
          </ScreenScrollView>
        </Sheet>
      ) : null}
    </>
  );
}
