import type { StaticScreenProps } from "@react-navigation/native";
import { View } from "react-native";
import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/useI18n";
import { issueEnvironment } from "../../state/issues";
import { useEnvironmentQuery } from "../../state/query";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useAndroidWorkspaceBack } from "../layout/workspace/useAndroidWorkspaceNavigation";
import { issueTarget, type IssueParams } from "./issueTarget";

export function IssueRouteScreen({ route }: StaticScreenProps<IssueParams>) {
  const { t } = useI18n();
  const back = useAndroidWorkspaceBack("issues");
  const result = useEnvironmentQuery(issueEnvironment.detail(issueTarget(route.params)));
  const issue = result.data ?? route.params.initialSummary;
  return (
    <View className="flex-1 bg-screen">
      <AppBar title={`#${route.params.number}`} onBack={back} />
      <ScreenScrollView contentContainerStyle={{ padding: 16 }}>
        {result.error ? (
          <Text selectable className="text-danger-foreground">
            {result.error}
          </Text>
        ) : null}
        {issue ? (
          <>
            <Text className="text-xl font-t3-bold">{issue.title}</Text>
            <Button
              label={t("mobile.linkedPullRequests.openInBrowser")}
              onPress={() => void tryOpenExternalUrl(issue.url, "pull-request")}
            />
          </>
        ) : null}
      </ScreenScrollView>
    </View>
  );
}
