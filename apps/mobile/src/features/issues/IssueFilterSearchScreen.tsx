import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { Button } from "../../components/ui/Button";
import { SelectionRow } from "../../components/ui/SelectionRow";
import { useI18n } from "../../i18n/useI18n";
import { issueEnvironment } from "../../state/issues";
import { useDebouncedValue } from "../../state/queries";
import { SearchSheet } from "../source-control/SearchSheet";
import { LabelDot } from "../source-control/LabelDot";
import { pullRequestLabelColor } from "../pull-requests/pullRequestList";
import { useIssueListControls } from "./issueList";

type Params = {
  kind: "labels" | "authors";
  targets: readonly { environmentId: string; projectId: string }[];
};
const options = Atom.family((key: string) => {
  const { targets, kind, query }: Params & { query: string } = JSON.parse(key);
  return Atom.make((get) =>
    targets.map((target) =>
      get(
        issueEnvironment.filterOptions({
          environmentId: EnvironmentId.make(target.environmentId),
          input: { projectId: ProjectId.make(target.projectId), kind, ...(query ? { query } : {}) },
        }),
      ),
    ),
  );
});
export function IssueFilterSearchScreen({ route }: StaticScreenProps<Params>) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const sent = useDebouncedValue(query.trim().slice(0, 100), 250);
  const [controls, setControls] = useIssueListControls();
  const results = useAtomValue(options(JSON.stringify({ ...route.params, query: sent })));
  const values = results.flatMap((r) => {
    const value = AsyncResult.getOrElse(r, () => null);
    return value ? [value] : [];
  });
  const selected =
    route.params.kind === "labels" ? controls.labels : controls.author ? [controls.author] : [];
  const rows = [
    ...new Map(
      [
        ...selected.map((name) => ({ name, color: null })),
        ...values.flatMap((v) =>
          route.params.kind === "labels"
            ? v.labels
            : v.authors.map((a) => ({ name: a.login, color: null })),
        ),
      ].map((v) => [v.name, v]),
    ).values(),
  ].filter((v) => v.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <SearchSheet
      title={t(route.params.kind === "labels" ? "pr.labels" : "pr.author")}
      placeholder={t("issue.search")}
      closeAccessibilityLabel={t("action.close")}
      clearAccessibilityLabel={t("action.clear")}
      query={query}
      onQueryChange={setQuery}
    >
      {({ paddingBottom }) => (
        <FlatList
          data={rows}
          keyExtractor={(v) => v.name}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom }}
          renderItem={({ item, index }) => (
            <SelectionRow
              title={item.name}
              role={route.params.kind === "labels" ? "checkbox" : "radio"}
              selected={selected.includes(item.name)}
              isFirst={index === 0}
              isLast={index === rows.length - 1}
              leading={
                route.params.kind === "labels" ? (
                  <LabelDot color={pullRequestLabelColor(item.color)} />
                ) : undefined
              }
              onPress={() => {
                if (route.params.kind === "authors") {
                  setControls({
                    ...controls,
                    author: controls.author === item.name ? null : item.name,
                  });
                  navigation.goBack();
                } else
                  setControls({
                    ...controls,
                    labels: selected.includes(item.name)
                      ? selected.filter((s) => s !== item.name)
                      : [...selected, item.name].slice(0, 10),
                  });
              }}
            />
          )}
          ListHeaderComponent={
            results.some(AsyncResult.isFailure) ? (
              <Text className="text-danger-foreground">
                {t("issue.failed", { operation: "filterOptions" })}
              </Text>
            ) : undefined
          }
          ListFooterComponent={
            values.some((v) => v.truncated) ? (
              <Text className="py-3 text-foreground-muted">{t("pr.searchLabels")}</Text>
            ) : undefined
          }
          ListEmptyComponent={
            results.some((r) => r.waiting) ? (
              <AppActivityIndicator className="my-8" />
            ) : (
              <View className="py-6">
                <Text>{t("issue.empty")}</Text>
                <Button label={t("action.close")} onPress={() => navigation.goBack()} />
              </View>
            )
          }
        />
      )}
    </SearchSheet>
  );
}
