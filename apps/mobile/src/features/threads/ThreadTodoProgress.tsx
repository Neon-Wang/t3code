import { useAtomValue } from "@effect/atom-react";
import { latestThreadTodo } from "@t3tools/client-runtime/state/thread-todo";
import { summarizeTodoSteps, type ScopedThreadRef } from "@t3tools/contracts";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useI18n } from "../../i18n/useI18n";
import { cn } from "../../lib/cn";
import { environmentThreadDetails } from "../../state/threads";

export function ThreadTodoProgress({ threadRef }: { threadRef: ScopedThreadRef }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const detail = useAtomValue(environmentThreadDetails.quietThreadAtom(threadRef));
  const todo = detail === null ? null : latestThreadTodo(detail.projection);
  if (todo === null || todo.steps.length === 0) return null;
  const progress = summarizeTodoSteps(todo.steps);
  return (
    <View className="border-b border-border-subtle bg-screen">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        className="min-h-11 flex-row items-center gap-2 px-4 py-2"
      >
        <AppText className="text-sm font-t3-semibold">
          {t("chat.ui.tasks")} · {progress.done}/{progress.total}
        </AppText>
        <View className="flex-1" />
        <SymbolView
          name={expanded ? "chevron.up" : "chevron.down"}
          size={14}
          tintColorClassName="accent-icon-subtle"
        />
      </Pressable>
      {expanded ? (
        <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ paddingBottom: 12 }}>
          {todo.steps.map((step) => (
            <View key={step.id} className="flex-row items-start gap-2 px-4 py-1.5">
              {step.status === "completed" ? (
                <SymbolView
                  name="checkmark"
                  size={16}
                  tintColorClassName="accent-foreground-muted"
                />
              ) : (
                <View
                  accessibilityLabel={
                    step.status === "running" ? t("mobile.threads.working") : t("chat.ui.pending")
                  }
                  className="mt-0.5 size-4 rounded-full border border-foreground-muted"
                  style={{ borderStyle: step.status === "running" ? "dashed" : "solid" }}
                />
              )}
              <AppText
                className={cn(
                  "flex-1 text-sm",
                  step.status === "completed" && "text-foreground-muted line-through",
                  step.status === "running" && "font-t3-bold",
                )}
              >
                {step.text}
              </AppText>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
