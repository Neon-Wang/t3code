import { i18n } from "@t3tools/shared/i18n";
import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export function revealInFileExplorerLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return i18n.t("preview.revealInFinder");
  if (normalized.includes("win")) return i18n.t("preview.revealInFileExplorer");
  return i18n.t("preview.revealInFiles");
}

export function revealInFileExplorerLabelForOs(os: ExecutionEnvironmentPlatformOs): string {
  if (os === "darwin") return i18n.t("preview.revealInFinder");
  if (os === "windows") return i18n.t("preview.revealInFileExplorer");
  return i18n.t("preview.revealInFiles");
}

export function revealInFileExplorerLabelForKind(kind: FileManagerRevealKind): string {
  if (kind === "finder") return i18n.t("preview.revealInFinder");
  if (kind === "file-explorer") return i18n.t("preview.revealInFileExplorer");
  return i18n.t("preview.revealInFiles");
}
