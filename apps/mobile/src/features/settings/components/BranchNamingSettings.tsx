import { i18n } from "@t3tools/shared/i18n";
import { useI18n } from "../../../i18n/useI18n";
import { BranchNamingMode, type ServerSettingsPatch } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput } from "../../../components/ui/AppText";
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
  // Typed text waits here until it saves. Android's Back closes the keyboard
  // without ending editing, so leaving the screen saves it too.
  type Field = "branchNamePrefix" | "branchNameInstructions";
  const drafts = useRef<Partial<Record<Field, { text: string; over: string | null }>>>({});
  const savedValue = (field: Field) =>
    field === "branchNamePrefix" ? props.prefix : props.instructions;
  const edit = (field: Field, text: string) => {
    drafts.current[field] = { text, over: savedValue(field) };
  };
  // Takes a field's draft as a patch, or {} when there is nothing new to save.
  // A newer saved value remounts the input, so a draft typed over an older one
  // is no longer on screen and is dropped.
  const take = (field: Field): ServerSettingsPatch => {
    const draft = drafts.current[field];
    delete drafts.current[field];
    const saved = savedValue(field);
    // Not gated on `disabled`: a pending write disables the inputs, and the
    // route queues this save behind it and checks write access itself.
    if (draft === undefined || draft.over !== saved) return {};
    const value = draft.text.trim();
    return saved === null || value !== saved ? { [field]: value } : {};
  };
  const send = (patch: ServerSettingsPatch) => {
    if (Object.keys(patch).length > 0) props.onChange(patch);
  };
  // One patch, because the screen drops writes while another is in flight.
  const saveDrafts = useEffectEvent(() =>
    send({ ...take("branchNamePrefix"), ...take("branchNameInstructions") }),
  );
  useEffect(() => () => saveDrafts(), []);
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
            onChangeText={(text) => edit("branchNamePrefix", text)}
            defaultValue={props.prefix ?? ""}
            placeholder={
              props.prefix === null ? t("mobile.branchNamingSettings.mixed") : "No prefix"
            }
            editable={!props.disabled}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-10 rounded-xl px-3 py-2 text-base text-foreground"
            onEndEditing={() => send(take("branchNamePrefix"))}
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
            onChangeText={(text) => edit("branchNameInstructions", text)}
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
            onEndEditing={() => send(take("branchNameInstructions"))}
          />
        </View>
      ) : null}
    </SettingsSection>
  );
}
