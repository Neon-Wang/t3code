import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import * as Dialog from "../../components/ui/Dialog";
import { useAtomValue } from "@effect/atom-react";
import {
  connectionCatalogDisplayUrl,
  pullRequestRoutingConnectionKey,
  pullRequestRoutingPermissionFor,
  type PullRequestRoutingPermission,
} from "@t3tools/client-runtime/connection";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { environmentCatalog } from "../../connection/catalog";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "../settings/components/SettingsSection";
import { useI18n } from "../../i18n/useI18n";
import { i18n } from "@t3tools/shared/i18n";

export function PullRequestRoutingSettings() {
  const { t } = useI18n();
  const options: ReadonlyArray<{
    value: PullRequestRoutingPermission;
    label: string;
    description: string;
  }> = [
    {
      value: "off",
      label: t("mobile.gitHubRoutingSettings.off"),
      description: t("mobile.pullRequestRoutingSettings.offDescription"),
    },
    {
      value: "read",
      label: t("mobile.gitHubRoutingSettings.readPRs"),
      description: t("mobile.gitHubRoutingSettings.sharePRDataWithOtherEnabledEnvironments"),
    },
    {
      value: "read-write",
      label: t("settings.integrations.readAndAct"),
      description: t("mobile.pullRequestRoutingSettings.readAndActDescription"),
    },
  ];
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const permissions = useAtomValue(environmentCatalog.pullRequestRoutingPermissionsValueAtom);
  const update = useAtomCommand(environmentCatalog.setPullRequestRoutingPermission);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (catalog.entries.size === 0) return null;

  return (
    <View className="mt-5 gap-3">
      <SettingsSection title={t("mobile.pullRequestRoutingSettings.pullRequestRouting")}>
        {[...catalog.entries.values()].map((entry) => {
          const environmentId = entry.target.environmentId;
          const selected = pullRequestRoutingPermissionFor(entry, permissions);
          const disabled =
            !catalog.isReady || saving || pullRequestRoutingConnectionKey(entry) === null;
          return (
            <View key={environmentId}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("mobile.pullRequestRoutingSettings.labelPullRequestRouting", {
                  label: entry.target.label,
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
                              i18n.t("mobile.pullRequestRoutingSettings.couldNotSave"),
                              i18n.t(
                                "mobile.gitHubRoutingSettings.tryAgainBeforeLeavingThisScreen",
                              ),
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
        {t("mobile.pullRequestRoutingSettings.chooseEnvironments")}
      </Text>
    </View>
  );
}
