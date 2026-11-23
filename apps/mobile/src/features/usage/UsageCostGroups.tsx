import { rankedCostGroups, type UsageCostGroup } from "@t3tools/shared/usageMerge";
import { formatUsd, formatTokens } from "@t3tools/shared/usageFormat";
import { StackActions, useNavigation } from "@react-navigation/native";
import { useGT, useLocale } from "gt-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";

export function UsageCostGroups({ groups }: { groups: ReadonlyMap<string, UsageCostGroup> }) {
  const [limit, setLimit] = useState(30);
  const gt = useGT();
  return (
    <View>
      {rankedCostGroups(groups)
        .slice(0, limit)
        .map((row) => (
          <CostRow key={row.key} row={row} />
        ))}
      {groups.size > limit && <Text onPress={() => setLimit(limit + 30)}>{gt("Show more")}</Text>}
    </View>
  );
}
function CostRow({ row }: { row: UsageCostGroup }) {
  const gt = useGT();
  const locale = useLocale();
  const navigation = useNavigation();
  const [expanded, setExpanded] = useState(false);
  const label =
    row.kind === "outside"
      ? gt("Outside T3")
      : row.kind === "unsupported"
        ? gt("Cannot match thread: {provider}", { provider: row.label })
        : row.kind === "deleted"
          ? gt("Deleted thread")
          : row.kind === "main"
            ? gt("Main agent")
            : row.label;
  return (
    <View>
      <View className="flex-row items-center gap-2 py-2">
        {row.children.size > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded }}
            hitSlop={6}
            onPress={() => setExpanded(!expanded)}
          >
            <Text>{expanded ? "▾" : "▸"}</Text>
          </Pressable>
        )}
        <Text
          className="flex-1 text-foreground"
          numberOfLines={2}
          onPress={
            row.threadId
              ? () =>
                  navigation.dispatch(
                    StackActions.push("Thread", {
                      environmentId: row.environmentId,
                      threadId: row.threadId,
                    }),
                  )
              : undefined
          }
        >
          {label}
        </Text>
        <Text>
          {row.hasPrice
            ? formatUsd(row.costUsd, locale)
            : gt("Unpriced", { $context: "model with no known price" })}{" "}
          · {gt("{count} tokens", { count: formatTokens(row.tokens) })}
        </Text>
      </View>
      {expanded && (
        <View className="ms-3">
          <UsageCostGroups groups={row.children} />
        </View>
      )}
    </View>
  );
}
