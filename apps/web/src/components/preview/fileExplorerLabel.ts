import { i18n } from "@t3tools/shared/i18n";
import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export function revealInFileExplorerLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return i18n.t("preview.revealInFinder");
  if (normalized.includes("win")) return i18n.t("preview.revealInFileExplorer");
  return i18n.t("preview.revealInFiles");
}

/** Same wording keyed by an environment's reported OS rather than a
    navigator platform string, for actions that reveal on the server machine. */
export function revealInFileExplorerLabelForOs(os: ExecutionEnvironmentPlatformOs): string {
  if (os === "darwin") return i18n.t("preview.revealInFinder");
  if (os === "windows") return i18n.t("preview.revealInFileExplorer");
  return i18n.t("preview.revealInFiles");
}

/** Server-selected wording, including Windows File Explorer reached from WSL. */
export function revealInFileExplorerLabelForKind(kind: FileManagerRevealKind): string {
  if (kind === "finder") return i18n.t("preview.revealInFinder");
  if (kind === "file-explorer") return i18n.t("preview.revealInFileExplorer");
  return i18n.t("preview.revealInFiles");
}
