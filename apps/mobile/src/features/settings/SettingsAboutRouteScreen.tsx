import * as Dialog from "../../components/ui/Dialog";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useI18n } from "../../i18n/useI18n";
import Constants from "expo-constants";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { useDeadlinePassed } from "../../lib/clock";
import {
  type AppUpdateCheckState,
  isAppUpdateCheckAvailable,
  registerHiddenUpdateTap,
  runAppUpdateCheck,
} from "../updates/app-updates";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";

export function SettingsAboutRouteScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <SettingsScreen title={t("settings.section.about")}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <AppSettingsSection />
      </ScrollView>
    </SettingsScreen>
  );
}

function AppSettingsSection() {
  const { t } = useI18n();
  const [checkState, setCheckState] = useState<{
    readonly state: AppUpdateCheckState;
    // "Up to date" is a confirmation that fades back to idle.
    readonly settledUntil: number | null;
  }>({ state: "idle", settledUntil: null });
  const confirmationExpired = useDeadlinePassed(checkState.settledUntil);
  const updateState =
    checkState.state === "current" && confirmationExpired ? "idle" : checkState.state;
  const updateInFlight = useRef(false);
  const hiddenUpdateTapCount = useRef(0);

  const version = Constants.expoConfig?.version ?? "0.0.0";
  // Match app.config.ts's production fallback to avoid mislabeling builds as development.
  const variant = (Constants.expoConfig?.extra?.appVariant as string | undefined) ?? "production";
  const variantLabel = variant === "production" ? "" : capitalize(variant);
  const versionLabel = variantLabel ? `${version} · ${variantLabel}` : version;
  const updateCheckAvailable = isAppUpdateCheckAvailable();
  const busy =
    updateState === "checking" || updateState === "downloading" || updateState === "restarting";

  async function checkForUpdate() {
    // disabled updates next render; the ref blocks same-frame double taps.
    if (updateInFlight.current) return;
    updateInFlight.current = true;
    // Failures arrive through onFailure; the settled result only matters for unlocking.
    await settlePromise(() =>
      runAppUpdateCheck({
        applyMode: "immediate",
        onFailure: (message) =>
          Dialog.alert(t("mobile.settingsAboutRouteScreen.updateFailed"), message),
        onStateChange: (state) =>
          setCheckState({
            state,
            settledUntil: state === "current" ? Date.now() + 3000 : null,
          }),
      }),
    );
    updateInFlight.current = false;
  }

  function handleVersionPress() {
    if (!updateCheckAvailable || updateInFlight.current) return;
    const tap = registerHiddenUpdateTap(hiddenUpdateTapCount.current);
    hiddenUpdateTapCount.current = tap.nextCount;
    if (tap.shouldCheck) {
      void checkForUpdate();
    }
  }

  const statusLabel =
    updateState === "checking"
      ? t("device.checking")
      : updateState === "downloading"
        ? t("settings.label.downloading")
        : updateState === "ready"
          ? t("mobile.appupdates.updateReady")
          : updateState === "restarting"
            ? t("ui.serverUpdate.restarting")
            : updateState === "current"
              ? t("mobile.pullRequestStatus.upToDate")
              : null;

  const versionRow = (
    <View className="flex-row items-center gap-4 p-4">
      <SymbolView
        name="info.circle"
        size={22}
        tintColorClassName="accent-icon"
        type="monochrome"
        weight="regular"
      />
      <Text className="flex-1 text-lg text-foreground">
        {t("mobile.settingsAboutRouteScreen.version")}
      </Text>
      <View className="items-end">
        <Text className="text-lg text-foreground-muted">{versionLabel}</Text>
        {statusLabel ? (
          <Text className="text-xs text-foreground-muted/70">{statusLabel}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <SettingsSection title={t("mobile.settingsAboutRouteScreen.app")}>
      <SettingsRow
        icon="internaldrive"
        label={t("mobile.settingsAboutRouteScreen.clientStorage")}
        target="SettingsClientStorage"
      />
      <SettingsRow
        icon="stethoscope"
        label={t("mobile.settingsAboutRouteScreen.diagnostics")}
        target="SettingsDiagnostics"
      />
      <SettingsRow
        icon="doc.on.doc"
        label={t("mobile.settingsAboutRouteScreen.openSourceLicenses")}
        target="SettingsOpenSourceLicenses"
      />
      <SettingsRow
        icon="doc.text"
        label={t("mobile.settingsAboutRouteScreen.legal")}
        fullScreenTarget="SettingsLegal"
      />
      {updateCheckAvailable ? (
        <Pressable
          accessibilityLabel={t("mobile.SettingsAboutRouteScreen.version", {
            version: versionLabel,
          })}
          accessibilityRole="text"
          disabled={busy}
          onPress={handleVersionPress}
        >
          {versionRow}
        </Pressable>
      ) : (
        versionRow
      )}
    </SettingsSection>
  );
}

function capitalize(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
