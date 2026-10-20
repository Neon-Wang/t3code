import { i18n } from "@t3tools/shared/i18n";
import type { ProviderOptionDescriptor, RuntimeMode } from "@t3tools/contracts";

/**
 * Prompt-injected values (ultrathink and friends) are filtered from the
 * descriptor metadata; ultracode is a real option but a workflow trigger, not a
 * reasoning level.
 */
const HIDDEN_EFFORT_OPTION_IDS: ReadonlySet<string> = new Set(["ultracode"]);

export const RUNTIME_MODE_CHOICES: ReadonlyArray<{
  readonly mode: RuntimeMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    mode: "approval-required",
    get label() {
      return i18n.t("mobile.permissions.supervised");
    },
    get description() {
      return i18n.t("mobile.permissions.supervisedDescription");
    },
  },
  {
    mode: "auto-accept-edits",
    get label() {
      return i18n.t("mobile.permissions.acceptEdits");
    },
    get description() {
      return i18n.t("mobile.permissions.acceptEditsDescription");
    },
  },
  {
    mode: "auto",
    get label() {
      return i18n.t("mobile.permissions.auto");
    },
    get description() {
      return i18n.t("mobile.permissions.autoDescription");
    },
  },
  {
    mode: "full-access",
    get label() {
      return i18n.t("mobile.permissions.fullAccess");
    },
    get description() {
      return i18n.t("mobile.permissions.fullAccessDescription");
    },
  },
];

export function runtimeModeChoicesForSupportedModes(
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
) {
  return supportedRuntimeModes && supportedRuntimeModes.length > 0
    ? RUNTIME_MODE_CHOICES.filter((choice) => supportedRuntimeModes.includes(choice.mode))
    : RUNTIME_MODE_CHOICES;
}

export function compatibleRuntimeModeForChoices(
  runtimeMode: RuntimeMode,
  choices: ReadonlyArray<{ readonly mode: RuntimeMode }>,
): RuntimeMode {
  return choices.some((choice) => choice.mode === runtimeMode)
    ? runtimeMode
    : (choices[0]?.mode ?? runtimeMode);
}

export function selectableChoices(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
) {
  const injected = new Set(descriptor.promptInjectedValues ?? []);
  return descriptor.options.filter(
    (option) => !injected.has(option.id) && !HIDDEN_EFFORT_OPTION_IDS.has(option.id),
  );
}
