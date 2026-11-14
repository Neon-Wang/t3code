import { View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useInboxEnvironments } from "../../state/inbox";
import { inboxRows } from "@t3tools/client-runtime/state/inbox-rows";
import { useWorkspaceTabs } from "../layout/workspace/WorkspaceTabsContext";
import { InboxQuestionPanel } from "./InboxQuestionPanel";

export function InboxScreen() {
  const { t } = useI18n();
  const environments = useInboxEnvironments();
  const workspace = useWorkspaceTabs();
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
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-2xl font-t3-bold">{t("inbox.title")}</Text>
        {environments.length === 0 ? <Text>{t("inbox.noEnvironments")}</Text> : null}
        {/* One flat list, so a card keeps its state when an escalation moves it to the top. */}
        {inboxRows(environments).map((row) => {
          switch (row.kind) {
            case "urgent-header":
              return (
                <Text key={row.key} className="text-lg font-t3-bold text-danger-foreground">
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
                <Text key={row.key} className="text-lg font-t3-bold">
                  {row.title || t("inbox.other")}
                </Text>
              );
            case "thread":
              return (
                <Text key={row.key} className="font-t3-semibold">
                  {row.title || t("inbox.untitledThread")}
                </Text>
              );
            case "question":
              return (
                <InboxQuestionPanel
                  key={row.key}
                  item={row.item}
                  environmentId={row.environmentId}
                  environmentLabel={row.environmentLabel}
                  showThread={row.showThread}
                />
              );
          }
        })}
      </ScreenScrollView>
    </>
  );
}
