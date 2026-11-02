import { useAuth } from "@clerk/react";
import { Link } from "@tanstack/react-router";

import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useI18n } from "../../hooks/useI18n";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { ScopedSwitch } from "./ScopedSwitch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { LegacyFeaturesSection } from "./SettingsPanels";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

/** Features still settling in, and legacy behavior kept for people who rely on it. */
export function LabsSettingsPanel() {
  const { t } = useI18n();
  return (
    <SettingsPageContainer>
      <SettingsSection id="beta" title={t("settings.labs.beta")}>
        <BoringSidebarRow />
        <BoringSidebarMultilineRow />
        {/* Clerk is only mounted when this build has T3 Connect. */}
        {hasCloudPublicConfig() ? <GuestLinksRowWithSignIn /> : <GuestLinksRow />}
        <LinkedEnvironmentsRow />
        <SimlockHostsRow />
      </SettingsSection>
      <LegacyFeaturesSection />
    </SettingsPageContainer>
  );
}

function BoringSidebarRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar", t)}
      description={t("settings.labs.boringSidebarDescription")}
      control={
        <Switch
          checked={settings.boringSidebarEnabled || settings.legacySidebarEnabled}
          // Turning it off also clears the opt-in of the removed legacy sidebar.
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarEnabled: Boolean(checked), legacySidebarEnabled: false })
          }
          aria-label={t("settings.search.boringSidebar")}
        />
      }
    />
  );
}

function BoringSidebarMultilineRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar-multiline", t)}
      description={t("settings.labs.twoLineFolderRowsDescription")}
      control={
        <Switch
          checked={settings.boringSidebarMultilineRows}
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarMultilineRows: Boolean(checked) })
          }
          aria-label={t("settings.search.twoLineFolderRows")}
        />
      }
    />
  );
}

/** Signed out of T3 Connect, the row offers to sign in instead of its switch. */
function GuestLinksRowWithSignIn() {
  const { t } = useI18n();
  const { isSignedIn } = useAuth();
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  // `isSignedIn` is undefined until Clerk loads.
  if (isSignedIn !== false) return <GuestLinksRow />;
  return (
    <SettingsRow
      {...searchableSetting("guest-links", t)}
      description={t("settings.labs.guestLinksSignInDescription")}
      control={
        <Button size="sm" variant="outline" onClick={openAuthPrompt}>
          {t("onboarding.signIn")}
        </Button>
      }
    />
  );
}

function GuestLinksRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("guest-links", t)}
      settingKeys={["guestSharingEnabled"]}
      description={
        <>
          {t("settings.labs.guestLinksDescriptionPrefix")}
          <Link to="/settings/access" className="underline underline-offset-2">
            {t("settings.nav.sharingAndAccess")}
          </Link>
          {t("settings.labs.guestLinksDescriptionSuffix")}
        </>
      }
      control={
        <ScopedSwitch
          settingKeys={["guestSharingEnabled"]}
          checked={settings.guestSharingEnabled}
          onCheckedChange={(checked) => updateSettings({ guestSharingEnabled: Boolean(checked) })}
          aria-label={t("settings.search.guestLinks")}
        />
      }
    />
  );
}

function LinkedEnvironmentsRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("linked-environments-beta", t)}
      settingKeys={["linkedEnvironmentsEnabled"]}
      description={
        <>
          {t("settings.labs.linkedEnvironmentsDescriptionPrefix")}
          <Link to="/settings/connections" className="underline underline-offset-2">
            {t("settings.section.connections")}
          </Link>
          {t("settings.labs.linkedEnvironmentsDescriptionSuffix")}
        </>
      }
      control={
        <ScopedSwitch
          settingKeys={["linkedEnvironmentsEnabled"]}
          checked={settings.linkedEnvironmentsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ linkedEnvironmentsEnabled: Boolean(checked) })
          }
          aria-label={t("settings.search.linkedEnvironments")}
        />
      }
    />
  );
}

function SimlockHostsRow() {
  const { t } = useI18n();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("simlock-hosts", t)}
      settingKeys={["simlockDeviceHostsEnabled"]}
      description={
        <>
          {t("settings.labs.simlockDescriptionPrefix")}
          <a
            href="https://incubator.callstack.com/simlock/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Simlock
          </a>
          {t("settings.labs.simlockDescriptionMiddle")}
          <Link to="/settings/devices" className="underline underline-offset-2">
            {t("device.devices")}
          </Link>
          {t("settings.labs.simlockDescriptionSuffix")}
        </>
      }
      control={
        <ScopedSwitch
          settingKeys={["simlockDeviceHostsEnabled"]}
          checked={settings.simlockDeviceHostsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ simlockDeviceHostsEnabled: Boolean(checked) })
          }
          aria-label={t("settings.labs.simlockDeviceHosts")}
        />
      }
    />
  );
}
