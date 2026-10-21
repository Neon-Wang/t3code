import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import * as Dialog from "../../components/ui/Dialog";
import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../i18n/useI18n";
import { useAtomValue } from "@effect/atom-react";
import {
  connectionCatalogDisplayUrl,
  gitHubRoutingConnectionKey,
  gitHubRoutingPermissionFor,
  type GitHubRoutingPermission,
} from "@t3tools/client-runtime/connection";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { environmentCatalog } from "../../connection/catalog";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "../settings/components/SettingsSection";

const options: ReadonlyArray<{
  value: GitHubRoutingPermission;
  label: string;
  description: string;
}> = [
  {
    value: "off",
    get label() {
      return i18n.t("mobile.gitHubRoutingSettings.off");
    },
    get description() {
      return i18n.t("mobile.gitHubRoutingSettings.keepGitHubRequestsOnThisEnvironment");
    },
  },
  {
    value: "read",
    get label() {
      return i18n.t("mobile.gitHubRoutingSettings.readPRs");
    },
    get description() {
      return i18n.t("mobile.gitHubRoutingSettings.sharePRDataWithOtherEnabledEnvironments");
    },
  },
  {
    value: "read-write",
    get label() {
      return i18n.t("mobile.gitHubRoutingSettings.readAndAct");
    },
    get description() {
      return i18n.t(
        "mobile.gitHubRoutingSettings.actionsMayUseBroaderGitHubPermissionsThanTheOriginalEnvironment",
      );
    },
  },
];

export function GitHubRoutingSettings() {
  const { t } = useI18n();
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const permissions = useAtomValue(environmentCatalog.githubRoutingPermissionsValueAtom);
  const update = useAtomCommand(environmentCatalog.setGitHubRoutingPermission);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (catalog.entries.size === 0) return null;

  return (
    <View className="mt-5 gap-3">
      <SettingsSection title={t("mobile.gitHubRoutingSettings.githubRouting")}>
        {[...catalog.entries.values()].map((entry) => {
          const environmentId = entry.target.environmentId;
          const selected = gitHubRoutingPermissionFor(entry, permissions);
          const disabled = !catalog.isReady || saving || gitHubRoutingConnectionKey(entry) === null;
          return (
            <View key={environmentId}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("mobile.GitHubRoutingSettings.githubRouting", {
                  name: entry.target.label,
                })}
                accessibilityState={{ expanded: expanded === environmentId }}
                className="flex-row items-center gap-3 p-4"
                onPress={() => setExpanded(expanded === environmentId ? null : environmentId)}
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-base font-t3-bold text-foreground">
                    {entry.target.label}
                  </Text>
                  <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                    {connectionCatalogDisplayUrl(entry) ?? "T3 Connect"}
                  </Text>
                </View>
                <Text className="text-sm text-foreground-muted">
                  {options.find((option) => option.value === selected)?.label}
                </Text>
                <SymbolView
                  name={expanded === environmentId ? "chevron.up" : "chevron.down"}
                  size={12}
                  tintColorClassName="accent-icon-muted"
                />
              </Pressable>
              {expanded === environmentId
                ? options.map((option) => (
                    <ListChoiceRow
                      key={option.value}
                      label={option.label}
                      description={option.description}
                      selected={selected === option.value}
                      disabled={disabled}
                      onPress={() => {
                        setSaving(true);
                        void update({ environmentId, permission: option.value }).then((result) => {
                          setSaving(false);
                          if (result._tag === "Failure")
                            Dialog.alert(
                              t("mobile.gitHubRoutingSettings.couldNotSaveGitHubRoutingPermission"),
                              t("mobile.gitHubRoutingSettings.tryAgainBeforeLeavingThisScreen"),
                            );
                        });
                      }}
                    />
                  ))
                : null}
            </View>
          );
        })}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        {t(
          "mobile.gitHubRoutingSettings.chooseEnvironmentsYouTrustToSharePRDataAndUseEachOthersGitHubAccessEnableBothEnvironmentsThisAppliesOnlyToThisClient",
        )}
      </Text>
    </View>
  );
}
