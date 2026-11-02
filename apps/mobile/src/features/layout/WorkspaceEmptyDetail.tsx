import { SymbolView } from "../../components/ui/AppSymbol";
import { useI18n } from "../../i18n/useI18n";
import { Platform, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { NewThreadButton } from "../../components/NewThreadButton";
import { FloatingActionButton } from "../../components/ui/FloatingActionButton";
import { EmptyState } from "../../components/ui/EmptyState";
import type { WorkspaceTab } from "../workspace/workspace-tabs-state";

export function WorkspaceEmptyDetail(props: {
  readonly tab?: WorkspaceTab | "settings";
  readonly onStartNewTask?: () => void;
  readonly onAddConnection?: () => void;
}) {
  const { t } = useI18n();
  const pullRequests = props.tab === "pullRequests";
  const settings = props.tab === "settings";
  if (props.tab === "usage") return <View className="flex-1 bg-screen" />;
  return (
    <View
      className={
        Platform.OS === "android"
          ? "flex-1 items-center justify-center px-10"
          : "flex-1 items-center justify-center bg-screen px-10"
      }
    >
      {props.onAddConnection ? (
        <View className="w-full max-w-[430px]">
          <EmptyState
            title={t("mobile.workspaceEmptyDetail.noEnvironmentsConnected")}
            detail={t(
              "mobile.workspaceEmptyDetail.addAnEnvironmentToLoadProjectsAndStartCodingSessions",
            )}
            variant="plain"
            action={
              <FloatingActionButton
                label={t("mobile.workspaceEmptyDetail.addEnvironment")}
                icon="plus"
                variant="extended"
                tone="primary"
                onPress={props.onAddConnection}
              />
            }
          />
        </View>
      ) : (
        <View className="max-w-[360px] items-center gap-3">
          <SymbolView
            name="sidebar.left"
            size={34}
            tintColorClassName="accent-icon-subtle"
            type="hierarchical"
          />
          <Text className="text-center text-xl font-t3-bold">
            {settings
              ? t("mobile.settingsWorkspaceLayout.selectSetting")
              : pullRequests
                ? t("mobile.workspaceRootScreen.selectAPullRequest")
                : t("mobile.workspaceEmptyDetail.selectAThread")}
          </Text>
          <Text className="text-center text-base text-foreground-muted">
            {settings
              ? t("mobile.workspaceEmptyDetail.chooseAPage")
              : pullRequests
                ? t("mobile.workspaceRootScreen.chooseAPullRequestFromTheSidebarToReviewIt")
                : Platform.OS === "android"
                  ? t("mobile.workspaceEmptyDetail.chooseAThreadOrNew")
                  : t("mobile.workspaceEmptyDetail.chooseAThreadOrNewTask")}
          </Text>
          {props.onStartNewTask && !pullRequests && !settings ? (
            Platform.OS === "android" ? (
              <NewThreadButton extended className="mt-2" onPress={props.onStartNewTask} />
            ) : (
              <Pressable
                accessibilityRole="button"
                className="mt-2 flex-row items-center gap-2 rounded-full bg-primary px-5 py-3 active:opacity-70"
                onPress={props.onStartNewTask}
              >
                <Text className="text-base font-t3-bold text-primary-foreground">
                  {t("mobile.components.newThread")}
                </Text>
              </Pressable>
            )
          ) : null}
        </View>
      )}
    </View>
  );
}
