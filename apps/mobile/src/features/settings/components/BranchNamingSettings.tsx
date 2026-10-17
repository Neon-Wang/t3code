import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../../i18n/useI18n";
import { BranchNamingMode, type ServerSettingsPatch } from "@t3tools/contracts";
import { useRef } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput } from "../../../components/AppText";
import { SettingsChoiceRow } from "./SettingsChoiceRow";
import { SettingsSection } from "./SettingsSection";

const MODES = {
  static: {
    get label() {
      return i18n.t("mobile.branchNamingSettings.staticPrefix");
    },
    get description() {
      return i18n.t("mobile.branchNamingSettings.addYourPrefixToTheGeneratedBranchName");
    },
  },
  semantic: {
    get label() {
      return i18n.t("mobile.branchNamingSettings.semanticPrefix");
    },
    get description() {
      return i18n.t("mobile.branchNamingSettings.letTheModelChooseFeatFixRefactorOrAnotherPrefix");
    },
  },
  custom: {
    get label() {
      return i18n.t("mobile.branchNamingSettings.customInstructions");
    },
    get description() {
      return i18n.t("mobile.branchNamingSettings.generateTheCompleteNameWithNoAddedPrefixOrSuffix");
    },
  },
} satisfies Record<BranchNamingMode, { label: string; description: string }>;

export function BranchNamingSettings(props: {
  mode: BranchNamingMode | null;
  prefix: string | null;
  instructions: string | null;
  disabled: boolean;
  onChange: (patch: ServerSettingsPatch) => void;
}) {
  const { t } = useI18n();
  const prefixEdited = useRef(false);
  const instructionsEdited = useRef(false);
  return (
    <SettingsSection
      title={t("mobile.branchNamingSettings.worktreeBranchNaming")}
      trailing={
        props.mode === null ? (
          <Text className="text-xs text-foreground-muted">
            {t("mobile.branchNamingSettings.mixed")}
          </Text>
        ) : null
      }
    >
      {BranchNamingMode.literals.map((mode, index) => (
        <SettingsChoiceRow
          key={mode}
          label={MODES[mode].label}
          description={MODES[mode].description}
          selected={props.mode === mode}
          separated={index > 0}
          disabled={props.disabled}
          onPress={() => props.onChange({ branchNamingMode: mode })}
        />
      ))}
      {props.mode === "static" ? (
        <View className="gap-2 px-4 py-3">
          <Text className="text-sm text-foreground-muted">
            {t("mobile.branchNamingSettings.useT3OrT3ForT3addsearchLeaveEmptyForNoPrefix")}
          </Text>
          <AppTextInput
            key={props.prefix}
            accessibilityLabel={t("mobile.branchNamingSettings.branchPrefix")}
            onChangeText={() => {
              prefixEdited.current = true;
            }}
            defaultValue={props.prefix ?? ""}
            placeholder={
              props.prefix === null ? t("mobile.branchNamingSettings.mixed") : "No prefix"
            }
            editable={!props.disabled}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-10 rounded-xl px-3 py-2 text-base text-foreground"
            onEndEditing={(event) => {
              const value = event.nativeEvent.text.trim();
              if (
                !props.disabled &&
                prefixEdited.current &&
                (props.prefix === null || value !== props.prefix)
              )
                props.onChange({ branchNamePrefix: value });
              prefixEdited.current = false;
            }}
          />
        </View>
      ) : null}
      {props.mode === "custom" ? (
        <View className="gap-2 px-4 py-3">
          <Text className="text-sm text-foreground-muted">
            {t("mobile.branchNamingSettings.appendInstructionsToTheNamingPrompt")}
          </Text>
          <AppTextInput
            key={props.instructions}
            accessibilityLabel={t("mobile.branchNamingSettings.branchNamingInstructions")}
            onChangeText={() => {
              instructionsEdited.current = true;
            }}
            defaultValue={props.instructions ?? ""}
            placeholder={
              props.instructions === null
                ? "Mixed. Enter instructions for all selected targets."
                : "Use julius/ followed by the issue ID and a short description."
            }
            editable={!props.disabled}
            multiline
            autoCapitalize="sentences"
            className="min-h-24 rounded-xl px-3 py-2 text-base text-foreground"
            onEndEditing={(event) => {
              const value = event.nativeEvent.text.trim();
              if (
                !props.disabled &&
                instructionsEdited.current &&
                (props.instructions === null || value !== props.instructions)
              )
                props.onChange({ branchNameInstructions: value });
              instructionsEdited.current = false;
            }}
          />
        </View>
      ) : null}
    </SettingsSection>
  );
}
