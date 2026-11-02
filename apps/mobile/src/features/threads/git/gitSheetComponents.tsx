import { useI18n } from "../../../i18n/useI18n";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { SymbolView } from "../../../components/ui/AppSymbol";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { Button } from "../../../components/ui/Button";

export function SheetActionButton(props: {
  readonly icon: ComponentProps<typeof SymbolView>["name"];
  readonly label: string;
  readonly disabled?: boolean;
  readonly tone?: "primary" | "secondary" | "danger";
  readonly onPress: () => void;
}) {
  return (
    <View className="flex-1">
      <Button {...props} fullWidth />
    </View>
  );
}

export function menuItemIconName(
  icon: "commit" | "push" | "pr",
): ComponentProps<typeof SymbolView>["name"] {
  if (icon === "commit") return "checkmark.circle";
  if (icon === "push") return "arrow.up.circle";
  return "arrow.up.right.circle";
}

export function statusSummary(
  gitStatus: {
    readonly isRepo?: boolean;
    readonly hasWorkingTreeChanges?: boolean;
    readonly workingTree?: { readonly files: readonly { readonly path: string }[] };
    readonly aheadCount?: number;
    readonly behindCount?: number;
    readonly pr?: { readonly state?: string; readonly number?: number } | null;
    readonly sourceControlProvider?: { readonly kind: string } | null;
  } | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!gitStatus) {
    return t("mobile.gitSheetComponents.loadingBranchStatus");
  }

  if (!gitStatus.isRepo) {
    return t("mobile.gitSheetComponents.notAGitRepository");
  }

  const parts: string[] = [];
  if (gitStatus.hasWorkingTreeChanges) {
    const fileCount = gitStatus.workingTree?.files.length ?? 0;
    parts.push(
      fileCount === 1
        ? t("mobile.gitSheetComponents.filesChanged.one")
        : t("mobile.gitSheetComponents.filesChanged.other", { count: fileCount }),
    );
  } else {
    parts.push(t("mobile.threadGitControls.clean"));
  }
  if ((gitStatus.aheadCount ?? 0) > 0) {
    parts.push(t("mobile.threadGitControls.aheadCount", { count: gitStatus.aheadCount ?? 0 }));
  }
  if ((gitStatus.behindCount ?? 0) > 0) {
    parts.push(t("mobile.threadGitControls.behindCount", { count: gitStatus.behindCount ?? 0 }));
  }
  if (gitStatus.pr?.state === "open") {
    const { shortLabel } = sourceControlClients.get(
      gitStatus.sourceControlProvider?.kind,
    ).changeRequest;
    parts.push(
      t("mobile.gitSheetComponents.requestOpen", {
        label: shortLabel,
        number: gitStatus.pr.number ?? 0,
      }),
    );
  }

  return parts.join(" \u00b7 ");
}
