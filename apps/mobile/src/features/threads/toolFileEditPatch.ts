import { createTwoFilesPatch } from "diff";
import type { ToolFileEdit } from "@t3tools/shared/toolFileEdit";

/**
 * Renders a per-edit diff as a unified patch.
 *
 * Mobile's diff surface is driven by a patch string, so the two before/after
 * variants are converted here. Web does not need this: Pierre builds a
 * renderable diff from before/after text directly.
 */
export function toolFileEditPatch(edit: ToolFileEdit): string {
  const normalizedPath = edit.path.replaceAll("\\", "/");
  if (edit.kind === "patch") {
    const diff = edit.unifiedDiff.trim();
    if (diff.length === 0) {
      return "";
    }
    // Codex sends hunks without the file header the parser needs.
    return diff.startsWith("diff --git ")
      ? diff
      : [
          `diff --git a/${normalizedPath} b/${normalizedPath}`,
          `--- a/${normalizedPath}`,
          `+++ b/${normalizedPath}`,
          diff,
        ].join("\n");
  }

  const oldText = edit.kind === "rewrite" ? "" : edit.oldText;
  const newText = edit.newText;
  if (oldText === newText) {
    return "";
  }
  // A span is already narrowed to the differing lines, so no extra context is
  // available to show and asking for it would only pad the patch.
  const body = createTwoFilesPatch(
    `a/${normalizedPath}`,
    `b/${normalizedPath}`,
    withTrailingNewline(oldText),
    withTrailingNewline(newText),
    undefined,
    undefined,
    { context: 0 },
  );
  return `diff --git a/${normalizedPath} b/${normalizedPath}\n${body}`;
}

function withTrailingNewline(value: string): string {
  return value.length === 0 || value.endsWith("\n") ? value : `${value}\n`;
}
