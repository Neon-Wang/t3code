import type { WorkspaceLayout } from "@t3tools/contracts";

/**
 * Resolves the layout actually rendered.
 *
 * `editor` puts the workspace surfaces in the wide column and the conversation
 * in a side rail, which needs two columns side by side. Below the breakpoint
 * where the side panel already becomes a modal sheet there is no room for that,
 * and the result would be a modal editor over a modal conversation — so the
 * setting is inert there rather than degraded into a third layout.
 */
export function resolveWorkspaceLayout(input: {
  readonly setting: WorkspaceLayout;
  readonly compactLayout: boolean;
}): WorkspaceLayout {
  return input.compactLayout ? "chat" : input.setting;
}
