import { useEnvironmentScope } from "../../state/session";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  AuthOrchestrationOperateScope,
  EnvironmentId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { issueKey, parseIssueLink } from "@t3tools/client-runtime/issues";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { LegendList } from "@legendapp/list/react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { SheetHeader } from "../../components/ui/SheetHeader";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { Menu } from "../../components/ui/Menu";
import * as Dialog from "../../components/ui/Dialog";
import { useI18n } from "../../i18n/useI18n";
import { useThreadShell, useProject } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { useOpenWorkspaceDetail } from "../layout/useOpenWorkspaceDetail";
import { useIssueAction } from "../issues/useIssueAction";
import { issueStatus } from "../issues/issueTarget";
import { usePullRequestConnected } from "../pull-requests/usePullRequestConnected";

export function ThreadIssuesSheet({
  route,
}: StaticScreenProps<{ environmentId: string; threadId: string }>) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const threadId = ThreadId.make(route.params.threadId);
  const thread = useThreadShell({ environmentId, threadId });
  const project = useProject(
    thread ? { environmentId, projectId: ProjectId.make(thread.projectId) } : null,
  );
  const identity = project?.repositoryIdentity;
  const repository = identity ? sourceControlClients.repositorySelector(identity) : null;
  const own =
    identity?.provider === "github" && repository
      ? { host: sourceControlClients.changeRequestHost(identity, identity.provider), repository }
      : null;
  const link = useAtomCommand(threadEnvironment.linkIssue, { reportFailure: false });
  const unlink = useAtomCommand(threadEnvironment.unlinkIssue, { reportFailure: false });
  const canLink = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const canUnlink = canLink;
  const connected = usePullRequestConnected(environmentId);
  const action = useIssueAction();
  const open = useOpenWorkspaceDetail();
  const promptLink = () =>
    Dialog.prompt({
      title: t("issue.link"),
      message: t("issue.linkDescription"),
      placeholder: t("issue.linkPlaceholder"),
      initialValue: "",
      confirmText: t("issue.link"),
      onConfirm: (value) => {
        if (!thread || !connected || !canLink) return;
        const ref = parseIssueLink(value, own);
        if (!ref) {
          Dialog.alert(t("issue.linkFailed"), t("issue.invalidLink"));
          return;
        }
        void action.run(() =>
          link({ environmentId, input: { threadId, ...ref, source: "manual" } }),
        );
      },
    });
  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <SheetHeader
        title={t("issue.linkedIssues")}
        onClose={() => navigation.goBack()}
        actions={
          thread && connected && canLink
            ? [
                {
                  icon: "plus",
                  accessibilityLabel: t("issue.link"),
                  onPress: promptLink,
                  disabled: action.busy,
                },
              ]
            : undefined
        }
      />
      <ScreenContent>
        <View className="flex-1 android:bg-sheet-solid ios:bg-screen">
          {/* oxlint-disable-next-line t3code/require-registered-list-scroll -- This sheet has its own header and sits outside the workspace columns. */}
          <LegendList
            data={thread?.issues ?? []}
            keyExtractor={issueKey}
            estimatedItemSize={88}
            recycleItems
            contentContainerStyle={{
              paddingHorizontal: 8,
              paddingBottom: Math.max(insets.bottom, 18) + 18,
            }}
            ListHeaderComponent={
              action.error ? (
                <Text selectable className="px-4 py-3 text-danger-foreground">
                  {action.error}
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <Text className="pt-6 text-center text-sm text-foreground-muted">
                {t("issue.noLinkedIssues")}
              </Text>
            }
            renderItem={({ item }) => {
              const status = item.snapshot ? issueStatus(item.snapshot) : null;
              const openIssue = () => {
                if (
                  thread &&
                  own &&
                  own.host.toLowerCase() === item.host.toLowerCase() &&
                  own.repository.toLowerCase() === item.repository.toLowerCase()
                )
                  open({
                    name: "Issue",
                    params: {
                      environmentId,
                      projectId: thread.projectId,
                      host: item.host,
                      repository: item.repository,
                      number: item.number,
                    },
                  });
                else void tryOpenExternalUrl(item.url, "pull-request");
              };
              return (
                <Menu
                  accessibilityLabel={`${t("issue.title")} #${item.number}`}
                  shouldOpenOnLongPress
                  actions={[
                    { id: "copy", title: t("mobile.linkedPullRequests.copyLink") },
                    { id: "browser", title: t("mobile.linkedPullRequests.openInBrowser") },
                    ...(connected && canUnlink
                      ? [
                          {
                            id: "unlink",
                            title: t("issue.unlink"),
                            attributes: { destructive: true, disabled: action.busy },
                          },
                        ]
                      : []),
                  ]}
                  onPressAction={({ nativeEvent }) => {
                    if (nativeEvent.event === "copy") void Clipboard.setStringAsync(item.url);
                    if (nativeEvent.event === "browser")
                      void tryOpenExternalUrl(item.url, "pull-request");
                    if (nativeEvent.event === "unlink" && connected && canUnlink)
                      void action.run(() =>
                        unlink({
                          environmentId,
                          input: {
                            threadId,
                            host: item.host,
                            repository: item.repository,
                            number: item.number,
                          },
                        }),
                      );
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={openIssue}
                    className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                  >
                    <SymbolView
                      name={status?.icon ?? "circle"}
                      size={18}
                      tintColorClassName={status?.tint ?? "accent-icon-muted"}
                    />
                    <View className="min-w-0 flex-1 gap-1">
                      <Text numberOfLines={2} className="text-sm font-t3-medium">
                        {item.snapshot?.title ?? `#${item.number}`}
                      </Text>
                      <Text className="text-xs text-foreground-muted">
                        {item.repository} #{item.number}
                        {status ? ` · ${status.label}` : ""}
                      </Text>
                    </View>
                    <SymbolView
                      name="chevron.right"
                      size={12}
                      tintColorClassName="accent-icon-muted"
                    />
                  </Pressable>
                </Menu>
              );
            }}
          />
        </View>
      </ScreenContent>
    </View>
  );
}
