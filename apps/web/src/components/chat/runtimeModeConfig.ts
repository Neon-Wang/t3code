import type { I18n, MessageKey } from "@t3tools/shared/i18n";
import type { RuntimeMode } from "@t3tools/contracts";
import { type LucideIcon, LockIcon, LockOpenIcon, PenLineIcon, SparklesIcon } from "lucide-react";

const runtimeModeConfig: Record<
  RuntimeMode,
  { labelKey: MessageKey; descriptionKey: MessageKey; icon: LucideIcon }
> = {
  "approval-required": {
    labelKey: "chat.composer.runtime.supervised",
    descriptionKey: "chat.composer.runtime.supervisedHelp",
    icon: LockIcon,
  },
  "auto-accept-edits": {
    labelKey: "chat.composer.runtime.autoEdits",
    descriptionKey: "chat.composer.runtime.autoEditsHelp",
    icon: PenLineIcon,
  },
  auto: {
    labelKey: "chat.composer.runtime.auto",
    descriptionKey: "chat.composer.runtime.autoHelp",
    icon: SparklesIcon,
  },
  "full-access": {
    labelKey: "chat.composer.runtime.fullAccess",
    descriptionKey: "chat.composer.runtime.fullAccessHelp",
    icon: LockOpenIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];

export function getRuntimeModeConfig(
  t: I18n["t"],
): Record<RuntimeMode, { label: string; description: string; icon: LucideIcon }> {
  return Object.fromEntries(
    runtimeModeOptions.map((mode) => {
      const option = runtimeModeConfig[mode];
      return [
        mode,
        { icon: option.icon, label: t(option.labelKey), description: t(option.descriptionKey) },
      ];
    }),
  ) as Record<RuntimeMode, { label: string; description: string; icon: LucideIcon }>;
}
