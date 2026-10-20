import { i18n } from "@t3tools/shared/i18n";
import type { RuntimeMode } from "@t3tools/contracts";
import { type LucideIcon, LockIcon, LockOpenIcon, PenLineIcon, SparklesIcon } from "lucide-react";

export const runtimeModeConfig: Record<
  RuntimeMode,
  { label: string; description: string; icon: LucideIcon }
> = {
  "approval-required": {
    get label() {
      return i18n.t("chat.ui.supervised");
    },
    get description() {
      return i18n.t("chat.composer.runtime.supervisedHelp");
    },
    icon: LockIcon,
  },
  "auto-accept-edits": {
    get label() {
      return i18n.t("chat.ui.autoAcceptEdits");
    },
    get description() {
      return i18n.t("chat.composer.runtime.autoEditsHelp");
    },
    icon: PenLineIcon,
  },
  auto: {
    get label() {
      return i18n.t("chat.ui.auto");
    },
    get description() {
      return i18n.t("chat.composer.runtime.autoHelp");
    },
    icon: SparklesIcon,
  },
  "full-access": {
    get label() {
      return i18n.t("chat.ui.fullAccess");
    },
    get description() {
      return i18n.t("chat.composer.runtime.fullAccessHelp");
    },
    icon: LockOpenIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];
