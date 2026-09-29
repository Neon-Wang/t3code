import { i18n } from "@t3tools/shared/i18n";
import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export function revealInFileExplorerLabel(platform: string, t: typeof i18n.t = i18n.t): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return t("preview.revealInFinder");
  if (normalized.includes("win")) return t("preview.revealInFileExplorer");
  return t("preview.revealInFiles");
}

/** Same wording keyed by an environment's reported OS rather than a
    navigator platform string, for actions that reveal on the server machine. */
export function revealInFileExplorerLabelForOs(
  os: ExecutionEnvironmentPlatformOs,
  t: typeof i18n.t = i18n.t,
): string {
  if (os === "darwin") return t("preview.revealInFinder");
  if (os === "windows") return t("preview.revealInFileExplorer");
  return t("preview.revealInFiles");
}

/** Server-selected wording, including Windows File Explorer reached from WSL. */
export function revealInFileExplorerLabelForKind(
  kind: FileManagerRevealKind,
  t: typeof i18n.t = i18n.t,
): string {
  if (kind === "finder") return t("preview.revealInFinder");
  if (kind === "file-explorer") return t("preview.revealInFileExplorer");
  return t("preview.revealInFiles");
}
