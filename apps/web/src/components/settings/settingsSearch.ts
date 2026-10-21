import { i18n, type MessageKey } from "@t3tools/shared/i18n";
import { HOSTED_APP_CHANNEL } from "~/branding";
import { isElectron } from "~/env";
import { isMacPlatform, isWindowsPlatform, normalizeSearchText } from "~/lib/utils";
import { STATIC_KEYBINDING_COMMANDS, type KeybindingCommand } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { DEFAULT_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { commandLabel } from "./KeybindingsSettings.logic";
import {
  validateSettingsScopeSearch,
  type ResolvedSettingsScope,
  type SettingsScopeSearch,
} from "./settingsScope";

export type SettingsPath =
  | "/settings/projects"
  | "/settings/general"
  | "/settings/diagnostics"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/snap-shot"
  | "/settings/providers"
  | "/settings/integrations"
  | "/settings/scheduled-tasks"
  | "/settings/source-control"
  | "/settings/storage"
  | "/settings/connections"
  | "/settings/archived";

export type SettingsSearchScope =
  | "environment"
  | "environment-defaults"
  | "project-defaults"
  | "project"
  | "checkout"
  | "connections";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly englishTitle?: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  readonly searchTerms?: ReadonlyArray<string>;
  readonly scope?: SettingsSearchScope;
  readonly desktopOnly?: boolean;
  readonly macOnly?: boolean;
  readonly windowsOnly?: boolean;
  readonly releaseChannelOnly?: boolean;
  readonly cloudOnly?: boolean;
  readonly environmentOnly?: boolean;
  readonly providerSettingsOnly?: boolean;
  readonly macProviderSettingsOnly?: boolean;
  readonly localBackendManagementOnly?: boolean;
  readonly localEnvironmentOnly?: boolean;
  readonly wslAvailableOnly?: boolean;
  readonly managedTunnelOnly?: boolean;
  readonly secondary?: boolean;
  readonly requiresThreadAutoSettlement?: boolean;
}

export interface SettingsSearchAvailability {
  readonly localEnvironmentDisabled?: boolean;
  readonly hasCloudPublicConfig: boolean;
  readonly hasEnvironment: boolean;
  readonly hasProviderSettingsEnvironment: boolean;
  readonly hasMacProviderSettingsEnvironment: boolean;
  readonly canManageLocalBackend: boolean;
  readonly isWslSettingsRowVisible: boolean;
  readonly hasThreadAutoSettlement: boolean;
  readonly managedTunnelActive?: boolean;
}

export const SETTINGS_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  get "/settings/diagnostics"() {
    return i18n.t("settings.option.diagnostics");
  },
  get "/settings/projects"() {
    return i18n.t("pr.project");
  },
  get "/settings/general"() {
    return i18n.t("settings.section.general");
  },
  get "/settings/appearance"() {
    return i18n.t("device.appearance");
  },
  get "/settings/keybindings"() {
    return i18n.t("settings.option.keybindings");
  },
  get "/settings/snap-shot"() {
    return i18n.t("settings.section.snapShot");
  },
  get "/settings/providers"() {
    return i18n.t("settings.option.providers");
  },
  get "/settings/integrations"() {
    return i18n.t("settings.section.integrations");
  },
  get "/settings/scheduled-tasks"() {
    return i18n.t("v2.settings.scheduledTasks2");
  },
  get "/settings/source-control"() {
    return i18n.t("settings.section.sourceControl");
  },
  get "/settings/storage"() {
    return i18n.t("settings.label.storage");
  },
  get "/settings/connections"() {
    return i18n.t("settings.section.connections");
  },
  get "/settings/archived"() {
    return i18n.t("action.archive");
  },
};

export function keybindingSearchAnchorId<Command extends KeybindingCommand>(command: Command) {
  return `keybinding-${command}` as const;
}

const KEYBINDING_SEARCH_ITEMS = STATIC_KEYBINDING_COMMANDS.toSorted((left, right) =>
  commandLabel(left).localeCompare(commandLabel(right)),
).map((command) => {
  const defaultKeys = DEFAULT_KEYBINDINGS.filter((binding) => binding.command === command).map(
    (binding) => binding.key,
  );
  return {
    id: keybindingSearchAnchorId(command),
    get title() {
      return commandLabel(command);
    },
    to: "/settings/keybindings" as const,
    searchTerms: [command, ...defaultKeys],
    secondary: true,
    ...(defaultKeys.length === 0 ? { targetId: "keybindings" } : {}),
  };
});

export function sourceControlHostSettingsSearchId(kind: string) {
  return `source-control-host-${kind}` as const;
}

const SOURCE_CONTROL_HOST_SEARCH_ITEMS = sourceControlClients.definitions.flatMap((definition) =>
  definition.settings && definition.kind !== "github"
    ? [
        {
          id: sourceControlHostSettingsSearchId(definition.kind),
          get title() {
            return i18n.t("v2.settings.valueCredentials", { arg0: definition.label });
          },
          to: "/settings/source-control" as const,
          searchTerms: [
            `${definition.label} ${Object.keys(definition.settings.fields).join(" ")} token credentials sign in`,
          ],
          environmentOnly: true,
          scope: "environment-defaults" as const,
        },
      ]
    : [],
);

export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "setting-language",
    get title() {
      return i18n.t("v2.settings.language");
    },
    englishTitle: i18n.t("v2.settings.language"),
    to: "/settings/appearance",
    searchTerms: ["language locale english chinese 简体中文 英文 语言"],
  },
  {
    id: "storage-worktree-keep-when",
    targetId: "storage-worktrees",
    get title() {
      return i18n.t("v2.settings.keepWorktreesWithLocalChanges");
    },
    englishTitle: i18n.t("v2.settings.keepWorktreesWithLocalChanges"),
    to: "/settings/storage",
    scope: "project-defaults",
    searchTerms: [
      "any local files uncommitted changes edited tracked files ignored env build output cleanup",
    ],
  },
  {
    id: "storage-delete-now",
    get title() {
      return i18n.t("v2.settings.deleteNow");
    },
    englishTitle: i18n.t("v2.settings.deleteNow"),
    to: "/settings/storage",
    scope: "environment-defaults",
    searchTerms: ["storage cleanup run now results report removed kept failed"],
  },
  {
    id: "storage-worktrees",
    get title() {
      return i18n.t("settings.label.worktreeCleanup");
    },
    englishTitle: i18n.t("settings.label.worktreeCleanup"),
    to: "/settings/storage",
    scope: "project-defaults",
    searchTerms: [
      "disk storage delete deleted archived threads old inactive merged unchanged worktrees retention days project inherit off custom",
    ],
  },
  {
    id: "storage-worktrees-location",
    get title() {
      return i18n.t("v2.settings.worktreeLocationLabel");
    },
    englishTitle: i18n.t("v2.settings.worktreeLocationLabel"),
    to: "/settings/storage",
    scope: "environment-defaults",
    searchTerms: ["worktree location folder directory path drive external disk"],
  },
  {
    id: "storage-artifacts",
    get title() {
      return i18n.t("settings.label.artifactsAndLogs");
    },
    englishTitle: i18n.t("settings.label.artifactsAndLogs"),
    to: "/settings/storage",
    scope: "environment-defaults",
    searchTerms: ["disk storage browser screenshots captures rotated logs cleanup retention"],
  },
  {
    id: "project-defaults",
    get title() {
      return i18n.t("settings.label.projectDefaultsAndOverrides");
    },
    englishTitle: i18n.t("settings.label.projectDefaultsAndOverrides"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["model workspace environments projects inheritance checkout"],
  },
  {
    id: "project-overview",
    get title() {
      return i18n.t("settings.label.projectOverview");
    },
    englishTitle: i18n.t("settings.label.projectOverview"),
    to: "/settings/projects",
    searchTerms: ["name icon emoji image checkout remove delete"],
  },
  {
    id: "default-model",
    get title() {
      return i18n.t("settings.label.defaultModel");
    },
    englishTitle: i18n.t("settings.label.defaultModel"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["new thread project provider reasoning effort"],
  },
  {
    id: "default-permissions",
    get title() {
      return i18n.t("device.permissions");
    },
    englishTitle: i18n.t("device.permissions"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: [
      "new thread default runtime mode supervised approvals auto accept edits full access",
    ],
  },
  {
    id: "color-scheme",
    get title() {
      return i18n.t("settings.option.colorScheme");
    },
    englishTitle: i18n.t("settings.option.colorScheme"),
    to: "/settings/appearance",
    searchTerms: ["appearance light dark system mode"],
    targetId: "appearance",
  },
  {
    id: "theme",
    get title() {
      return i18n.t("settings.option.themes");
    },
    englishTitle: i18n.t("settings.option.themes"),
    to: "/settings/appearance",
    searchTerms: ["appearance colors palette custom import"],
    targetId: "appearance",
  },
  {
    // Prefixed because the slider control already owns the `appearance-contrast` id.
    id: "setting-appearance-contrast",
    get title() {
      return i18n.t("settings.option.contrast");
    },
    englishTitle: i18n.t("settings.option.contrast"),
    to: "/settings/appearance",
    searchTerms: ["colors borders interface"],
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    get title() {
      return i18n.t("settings.option.glassOpacity");
    },
    englishTitle: i18n.t("settings.option.glassOpacity"),
    to: "/settings/appearance",
    searchTerms: ["transparent transparency solid menus dialogs composer"],
  },
  {
    id: "diff-color-scheme",
    get title() {
      return i18n.t("settings.label.diffColors");
    },
    englishTitle: i18n.t("settings.label.diffColors"),
    to: "/settings/appearance",
    searchTerms: ["red green blue orange additions deletions changes counts palette colorblind"],
  },
  {
    id: "chat-width",
    get title() {
      return i18n.t("settings.label.chatWidth");
    },
    englishTitle: i18n.t("settings.label.chatWidth"),
    to: "/settings/appearance",
    searchTerms: ["wide full width column layout messages composer monitor"],
  },
  {
    id: "math-rendering",
    get title() {
      return i18n.t("integration.renderMath");
    },
    to: "/settings/appearance",
    searchTerms: ["latex tex katex equations formulas markdown"],
  },
  {
    id: "panel-animations",
    get title() {
      return i18n.t("settings.label.panelAnimations");
    },
    englishTitle: i18n.t("settings.label.panelAnimations"),
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    get title() {
      return i18n.t("settings.option.environmentIdentification");
    },
    englishTitle: i18n.t("settings.option.environmentIdentification"),
    to: "/settings/appearance",
    searchTerms: ["dev nightly artwork pill label hide none"],
    targetId: "appearance-interface",
  },
  {
    id: "interface-font",
    get title() {
      return i18n.t("settings.option.interfaceFont");
    },
    englishTitle: i18n.t("settings.option.interfaceFont"),
    to: "/settings/appearance",
    searchTerms: ["typography family size system sans"],
  },
  {
    id: "prompt-font",
    get title() {
      return i18n.t("settings.option.promptFont");
    },
    englishTitle: i18n.t("settings.option.promptFont"),
    to: "/settings/appearance",
    searchTerms: ["typography family size composer input"],
  },
  {
    id: "code-font",
    get title() {
      return i18n.t("settings.option.codeFont");
    },
    englishTitle: i18n.t("settings.option.codeFont"),
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace code blocks diffs file previews"],
  },
  {
    id: "terminal-font",
    get title() {
      return i18n.t("settings.option.terminalFont");
    },
    englishTitle: i18n.t("settings.option.terminalFont"),
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace output"],
  },
  {
    id: "font-smoothing",
    get title() {
      return i18n.t("settings.option.fontSmoothing");
    },
    englishTitle: i18n.t("settings.option.fontSmoothing"),
    to: "/settings/appearance",
    searchTerms: ["typography text grayscale anti aliasing macos thin"],
    macOnly: true,
  },
  {
    id: "word-wrap",
    get title() {
      return i18n.t("settings.option.wordWrap");
    },
    englishTitle: i18n.t("settings.option.wordWrap"),
    to: "/settings/appearance",
    searchTerms: ["long lines code blocks tables diffs file previews"],
  },
  {
    id: "composer-context",
    get title() {
      return i18n.t("v2.settings.composerContextLabel");
    },
    englishTitle: i18n.t("v2.settings.composerContextLabel"),
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    get title() {
      return i18n.t("settings.option.projectGrouping");
    },
    englishTitle: i18n.t("settings.option.projectGrouping"),
    to: "/settings/general",
    searchTerms: ["combine matching repositories environments sidebar"],
  },
  {
    id: "project-order",
    get title() {
      return i18n.t("v2.settings.projectOrderLabel");
    },
    englishTitle: i18n.t("v2.settings.projectOrderLabel"),
    to: "/settings/general",
    searchTerms: ["sort projects sidebar manual created recent"],
  },
  {
    id: "snooze-limited-threads",
    get title() {
      return i18n.t("v2.settings.snoozeLimitedThreads");
    },
    englishTitle: i18n.t("v2.settings.snoozeLimitedThreads"),
    to: "/settings/general",
    searchTerms: ["usage quota rate limit reset wake recover continue"],
  },
  {
    id: "auto-resume-limited-threads",
    get title() {
      return i18n.t("v2.settings.autoResumeLimitedThreads");
    },
    englishTitle: i18n.t("v2.settings.autoResumeLimitedThreads"),
    to: "/settings/general",
    searchTerms: ["usage quota rate limit reset recover continue"],
  },
  {
    id: "working-shelf",
    get title() {
      return i18n.t("v2.settings.workingSectionBeta");
    },
    englishTitle: i18n.t("v2.settings.workingSectionBeta"),
    to: "/settings/general",
    searchTerms: ["hide fold running monitoring threads inbox sidebar shelf"],
  },
  {
    id: "auto-settle-inactive-threads",
    get title() {
      return i18n.t("settings.option.autoSettleInactiveThreads");
    },
    englishTitle: i18n.t("settings.option.autoSettleInactiveThreads"),
    to: "/settings/general",
    searchTerms: ["sidebar inactivity days no activity automatically"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "compact-idle-threads",
    get title() {
      return i18n.t("integration.compactIdleBeta");
    },
    to: "/settings/general",
    scope: "environment-defaults",
    searchTerms: ["context compaction idle cache tokens usage summary beta experimental"],
  },
  {
    id: "auto-settle-merged-threads",
    get title() {
      return i18n.t("settings.option.autoSettleMergedThreads");
    },
    englishTitle: i18n.t("settings.option.autoSettleMergedThreads"),
    to: "/settings/general",
    searchTerms: ["pull request merge closed automatically sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "days-before-auto-settle",
    get title() {
      return i18n.t("settings.label.daysOfInactivityBeforeAutoSettle");
    },
    englishTitle: i18n.t("settings.label.daysOfInactivityBeforeAutoSettle"),
    to: "/settings/general",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["thread timeout activity sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "thread-notifications",
    get title() {
      return i18n.t("settings.label.threadNotifications");
    },
    englishTitle: i18n.t("settings.label.threadNotifications"),
    to: "/settings/general",
    searchTerms: ["notification sound alert completion input approval desktop"],
  },
  {
    id: "in-app-notifications",
    get title() {
      return i18n.t("settings.label.inAppNotifications");
    },
    englishTitle: i18n.t("settings.label.inAppNotifications"),
    to: "/settings/general",
    searchTerms: ["notification toast popup completion input approval failure"],
  },
  {
    id: "time-format",
    get title() {
      return i18n.t("settings.option.timeFormat");
    },
    englishTitle: i18n.t("settings.option.timeFormat"),
    to: "/settings/general",
    searchTerms: ["timestamp clock locale system browser os 12 hour 24 hour"],
  },
  {
    id: "response-streaming",
    get title() {
      return i18n.t("settings.label.responseStreaming");
    },
    englishTitle: i18n.t("settings.label.responseStreaming"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["output token paragraph buffered wait turn legacy"],
  },
  {
    id: "hide-whitespace-changes",
    get title() {
      return i18n.t("settings.option.hideWhitespaceChanges");
    },
    englishTitle: i18n.t("settings.option.hideWhitespaceChanges"),
    to: "/settings/general",
    searchTerms: ["diff ignore spaces edits default"],
  },
  {
    id: "default-diff-file-state",
    get title() {
      return i18n.t("settings.label.defaultDiffFileState");
    },
    englishTitle: i18n.t("settings.label.defaultDiffFileState"),
    to: "/settings/general",
    searchTerms: ["collapsed expanded collapse expand files pull request pr code tab"],
  },
  {
    id: "diff-layout",
    get title() {
      return i18n.t("pr.diffLayout");
    },
    englishTitle: i18n.t("pr.diffLayout"),
    to: "/settings/general",
    searchTerms: ["stacked split side by side unified inline view"],
  },
  {
    id: "proactive-panels",
    get title() {
      return i18n.t("settings.label.proactivePanels");
    },
    englishTitle: i18n.t("settings.label.proactivePanels"),
    to: "/settings/general",
    searchTerms: ["automatically open diff pull request pr right panel agent completion"],
  },
  {
    id: "skills-in-slash-menu",
    get title() {
      return i18n.t("settings.option.skillsInSlashMenu");
    },
    englishTitle: i18n.t("settings.option.skillsInSlashMenu"),
    to: "/settings/general",
    searchTerms: ["command menu dollar $ slash /"],
  },
  {
    id: "composer-rich-text",
    get title() {
      return i18n.t("settings.label.richTextComposer");
    },
    englishTitle: i18n.t("settings.label.richTextComposer"),
    to: "/settings/general",
    searchTerms: ["composer rich text tiptap bold italic markdown styled wysiwyg"],
  },
  {
    id: "composer-collapse",
    get title() {
      return i18n.t("settings.label.collapseComposerOnScroll");
    },
    englishTitle: i18n.t("settings.label.collapseComposerOnScroll"),
    to: "/settings/general",
    searchTerms: ["composer rest resting scroll wheel conversation timeline shrink minimize"],
  },
  {
    id: "send-shortcut",
    get title() {
      return i18n.t("settings.label.sendShortcut");
    },
    englishTitle: i18n.t("settings.label.sendShortcut"),
    to: "/settings/general",
    searchTerms: ["enter return command ctrl multiline prompt new line composer"],
  },
  {
    id: "follow-up-behavior",
    get title() {
      return i18n.t("settings.label.followUpBehavior");
    },
    englishTitle: i18n.t("settings.label.followUpBehavior"),
    to: "/settings/general",
    searchTerms: ["queue steer running turn send default behavior composer"],
  },
  {
    id: "provider-update-checks",
    get title() {
      return i18n.t("settings.option.providerUpdateChecks");
    },
    englishTitle: i18n.t("settings.option.providerUpdateChecks"),
    to: "/settings/general",
    searchTerms: ["installed cli versions newer available codex claude cursor grok opencode"],
    scope: "environment-defaults",
  },
  {
    id: "continue-threads-after-server-update",
    get title() {
      return i18n.t("settings.label.continueThreadsAfterRestarts");
    },
    englishTitle: i18n.t("settings.label.continueThreadsAfterRestarts"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: [
      "resume running active interrupted work restart reboot machine crash desktop update automatically",
    ],
  },
  {
    id: "background-activity",
    get title() {
      return i18n.t("settings.label.backgroundActivity");
    },
    englishTitle: i18n.t("settings.label.backgroundActivity"),
    to: "/settings/general",
    scope: "environment-defaults",
    searchTerms: [
      "balanced performance battery saver advanced git fetch provider health refresh host power monitor idle policy",
    ],
  },
  {
    id: "new-threads",
    get title() {
      return i18n.t("settings.option.newThreads");
    },
    englishTitle: i18n.t("settings.option.newThreads"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["default workspace mode draft local worktree"],
  },
  {
    id: "worktree-submodules",
    get title() {
      return i18n.t("settings.label.submodules");
    },
    englishTitle: i18n.t("settings.label.submodules"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["git submodule init recursive top-level none worktree t3.json"],
  },
  {
    id: "start-from-origin",
    get title() {
      return i18n.t("branchToolbar.startFromOrigin");
    },
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["new worktrees start remote origin latest fetched branch local"],
  },
  {
    id: "add-project-starts-in",
    get title() {
      return i18n.t("settings.option.addProjectStartsIn");
    },
    englishTitle: i18n.t("settings.option.addProjectStartsIn"),
    to: "/settings/general",
    scope: "environment-defaults",
    searchTerms: ["base directory folder browser path home"],
  },
  {
    id: "unpin-confirmation",
    get title() {
      return i18n.t("settings.label.unpinConfirmation");
    },
    englishTitle: i18n.t("settings.label.unpinConfirmation"),
    to: "/settings/general",
    searchTerms: ["ask before thread pinned section"],
  },
  {
    id: "archive-confirmation",
    get title() {
      return i18n.t("settings.option.archiveConfirmation");
    },
    englishTitle: i18n.t("settings.option.archiveConfirmation"),
    to: "/settings/general",
    searchTerms: ["ask before thread second click inline action"],
  },
  {
    id: "delete-confirmation",
    get title() {
      return i18n.t("settings.option.deleteConfirmation");
    },
    englishTitle: i18n.t("settings.option.deleteConfirmation"),
    to: "/settings/general",
    searchTerms: ["ask before thread chat history"],
  },
  {
    id: "quit-confirmation",
    get title() {
      return i18n.t("settings.label.quitShortcut");
    },
    englishTitle: i18n.t("settings.label.quitShortcut"),
    to: "/settings/general",
    searchTerms: ["confirmation desktop app exit direct hold double click press twice"],
    desktopOnly: true,
  },
  {
    id: "text-generation-model",
    get title() {
      return i18n.t("settings.misc.textGenerationModel");
    },
    englishTitle: i18n.t("settings.misc.textGenerationModel"),
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["generated thread titles source control content default provider"],
  },
  {
    id: "app-version",
    get title() {
      return i18n.t("settings.label.version");
    },
    englishTitle: i18n.t("settings.label.version"),
    to: "/settings/general",
    searchTerms: ["about check for updates download install upgrade release"],
  },
  {
    id: "update-track",
    get title() {
      return i18n.t("settings.label.updateTrack");
    },
    englishTitle: i18n.t("settings.label.updateTrack"),
    to: "/settings/general",
    searchTerms: ["release channel stable latest nightly prerelease"],
    releaseChannelOnly: true,
  },
  {
    id: "cli-command",
    get title() {
      return i18n.t("v2.settings.t3Command");
    },
    englishTitle: i18n.t("v2.settings.t3Command"),
    to: "/settings/general",
    searchTerms: ["cli terminal shell path install command line"],
    desktopOnly: true,
  },
  {
    id: "mobile-app",
    get title() {
      return i18n.t("v2.surfaces.copy10");
    },
    to: "/settings/general",
    searchTerms: ["phone tablet iPhone iPad iOS Android App Store Google Play QR"],
  },
  {
    id: "privacy-policy",
    get title() {
      return i18n.t("v2.settings.privacyPolicy");
    },
    englishTitle: i18n.t("v2.settings.privacyPolicy"),
    to: "/settings/general",
    searchTerms: ["telemetry analytics usage data tracking legal opt out"],
  },
  {
    id: "telemetry-export",
    get title() {
      return i18n.t("v2.settings.openTelemetryExport");
    },
    englishTitle: i18n.t("v2.settings.openTelemetryExport"),
    to: "/settings/diagnostics",
    targetId: "telemetry-export",
    scope: "environment",
    searchTerms: ["OTel OTLP telemetry export endpoints logs traces metrics Grafana"],
  },
  {
    id: "diagnostics",
    get title() {
      return i18n.t("settings.option.diagnostics");
    },
    englishTitle: i18n.t("settings.option.diagnostics"),
    to: "/settings/general",
    searchTerms: ["logs traces processes resource history failures spans cpu memory"],
  },
  {
    id: "open-source-licenses",
    get title() {
      return i18n.t("settings.label.openSourceLicenses");
    },
    englishTitle: i18n.t("settings.label.openSourceLicenses"),
    to: "/settings/general",
  },
  {
    id: "legacy-plan-mode",
    get title() {
      return i18n.t("settings.option.legacyPlanMode");
    },
    englishTitle: i18n.t("settings.option.legacyPlanMode"),
    to: "/settings/general",
    searchTerms: ["build plan composer old"],
  },
  {
    id: "legacy-context-window-indicator",
    get title() {
      return i18n.t("settings.label.contextWindowIndicatorLegacy");
    },
    englishTitle: i18n.t("settings.label.contextWindowIndicatorLegacy"),
    to: "/settings/general",
    searchTerms: ["composer meter usage tokens circle old"],
  },
  {
    id: "legacy-sidebar",
    get title() {
      return i18n.t("settings.option.legacySidebar");
    },
    englishTitle: i18n.t("settings.option.legacySidebar"),
    to: "/settings/general",
    searchTerms: ["project thread tree old flat list"],
  },
  {
    id: "keybindings",
    get title() {
      return i18n.t("settings.option.keybindings");
    },
    englishTitle: i18n.t("settings.option.keybindings"),
    to: "/settings/keybindings",
    searchTerms: ["keyboard shortcuts hotkeys commands bindings json"],
  },
  ...KEYBINDING_SEARCH_ITEMS,
  {
    id: "snap-shot-enabled",
    get title() {
      return i18n.t("settings.section.snapShot");
    },
    englishTitle: i18n.t("settings.section.snapShot"),
    searchTerms: ["window capture screenshot"],
    to: "/settings/snap-shot",
  },
  {
    id: "snap-shot-accessibility",
    get title() {
      return i18n.t("settings.label.includeAppText");
    },
    englishTitle: i18n.t("settings.label.includeAppText"),
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
    searchTerms: [
      "capture accessibility data text UI structure elements privacy omit agent context",
    ],
  },
  {
    id: "snap-shot-shortcut",
    get title() {
      return i18n.t("settings.label.captureShortcut");
    },
    englishTitle: i18n.t("settings.label.captureShortcut"),
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-sound",
    get title() {
      return i18n.t("settings.label.captureSound");
    },
    englishTitle: i18n.t("settings.label.captureSound"),
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-flash",
    get title() {
      return i18n.t("settings.label.captureFlash");
    },
    englishTitle: i18n.t("settings.label.captureFlash"),
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-animations",
    get title() {
      return i18n.t("settings.label.captureAnimations");
    },
    englishTitle: i18n.t("settings.label.captureAnimations"),
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "providers",
    get title() {
      return i18n.t("settings.option.providers");
    },
    englishTitle: i18n.t("settings.option.providers"),
    to: "/settings/providers",
    searchTerms: [
      "agents cli codex claude cursor grok opencode antigravity google sign in sign out install subscription instances authentication api key models configuration binary path config directory endpoint arguments environment variables display name accent color custom favorite hidden auto compact",
    ],
  },
  {
    id: "usage-providers",
    get title() {
      return i18n.t("settings.label.usageProviders");
    },
    englishTitle: i18n.t("settings.label.usageProviders"),
    to: "/settings/providers",
    searchTerms: [
      "usage sources CLIProxyAPI CLI proxy hub quota subscription limits management key add remove",
    ],
    providerSettingsOnly: true,
  },
  {
    id: "cursor-keychain-usage",
    get title() {
      return i18n.t("settings.label.cursorAccountUsage");
    },
    englishTitle: i18n.t("settings.label.cursorAccountUsage"),
    to: "/settings/providers",
    searchTerms: ["cursor macOS keychain usage tokens cost limits permission"],
    providerSettingsOnly: true,
    macProviderSettingsOnly: true,
  },
  {
    id: "provider-health-check-interval",
    get title() {
      return i18n.t("settings.label.healthCheckInterval");
    },
    englishTitle: i18n.t("settings.label.healthCheckInterval"),
    to: "/settings/providers",
    searchTerms: ["refresh availability versions auth state models background probes seconds off"],
    providerSettingsOnly: true,
  },
  {
    id: "agent-browser-access",
    get title() {
      return i18n.t("settings.option.agentBrowserAccess");
    },
    englishTitle: i18n.t("settings.option.agentBrowserAccess"),
    to: "/settings/integrations",
    scope: "project-defaults",
    searchTerms: ["allow disable enable open drive preview tools sessions project override"],
  },
  {
    id: "device-hosts",
    get title() {
      return i18n.t("settings.label.deviceHosts");
    },
    englishTitle: i18n.t("settings.label.deviceHosts"),
    to: "/settings/integrations",
    searchTerms: ["ssh remote simulator emulator ios android mac mini identity key connection"],
  },
  {
    id: "agent-device-access",
    get title() {
      return i18n.t("settings.label.agentDeviceAccess");
    },
    englishTitle: i18n.t("settings.label.agentDeviceAccess"),
    to: "/settings/integrations",
    targetId: "devices",
    searchTerms: ["allow simulator emulator ios android drive tools sessions"],
  },
  {
    id: "device-hub",
    get title() {
      return i18n.t("device.deviceHub");
    },
    englishTitle: i18n.t("device.deviceHub"),
    to: "/settings/integrations",
    targetId: "devices",
    searchTerms: ["simulator emulator ios android install start"],
  },
  {
    id: "device-platform-support",
    get title() {
      return i18n.t("settings.label.simulatorSupport");
    },
    englishTitle: i18n.t("settings.label.simulatorSupport"),
    to: "/settings/integrations",
    targetId: "devices",
    searchTerms: ["xcode android studio sdk avd runtime"],
  },
  {
    id: "browser-profiles",
    get title() {
      return i18n.t("settings.label.browserProfiles");
    },
    englishTitle: i18n.t("settings.label.browserProfiles"),
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "browser-default-profile",
    get title() {
      return i18n.t("settings.label.defaultBrowserProfile");
    },
    englishTitle: i18n.t("settings.label.defaultBrowserProfile"),
    to: "/settings/integrations",
    targetId: "browser-profiles",
  },
  {
    id: "browser-default-viewport",
    get title() {
      return i18n.t("settings.option.browserDefaultViewport");
    },
    englishTitle: i18n.t("settings.option.browserDefaultViewport"),
    to: "/settings/integrations",
    searchTerms: ["preview size width height device desktop mobile rotate"],
  },
  {
    id: "browser-default-zoom",
    get title() {
      return i18n.t("settings.option.browserDefaultZoom");
    },
    englishTitle: i18n.t("settings.option.browserDefaultZoom"),
    to: "/settings/integrations",
    searchTerms: ["preview page scale tabs percent"],
  },
  {
    id: "browser-default-appearance",
    get title() {
      return i18n.t("settings.option.browserDefaultAppearance");
    },
    englishTitle: i18n.t("settings.option.browserDefaultAppearance"),
    to: "/settings/integrations",
    searchTerms: ["preview color scheme light dark system os"],
  },
  {
    id: "browser-recording-frame-rate",
    get title() {
      return i18n.t("settings.label.browserRecordingFrameRate");
    },
    englishTitle: i18n.t("settings.label.browserRecordingFrameRate"),
    to: "/settings/integrations",
  },
  {
    id: "browser-recording-key-presses",
    get title() {
      return i18n.t("settings.label.showKeyPressesInRecordings");
    },
    englishTitle: i18n.t("settings.label.showKeyPressesInRecordings"),
    to: "/settings/integrations",
    searchTerms: ["browser preview keyboard shortcuts keystrokes overlay capture"],
  },
  {
    id: "browser-recording-mouse-presses",
    get title() {
      return i18n.t("settings.label.showMousePressesInRecordings");
    },
    englishTitle: i18n.t("settings.label.showMousePressesInRecordings"),
    to: "/settings/integrations",
    searchTerms: ["browser preview clicks buttons drag overlay capture"],
  },
  {
    id: "browser-link-target",
    get title() {
      return i18n.t("settings.label.openLinksIn");
    },
    englishTitle: i18n.t("settings.label.openLinksIn"),
    to: "/settings/integrations",
    searchTerms: ["links default browser in-app browser external open"],
  },
  {
    id: "browser-search-engine",
    get title() {
      return i18n.t("integration.searchEngine");
    },
    to: "/settings/integrations",
    searchTerms: ["address bar duckduckgo google bing brave kagi ecosia custom"],
  },
  {
    id: "pull-request-links-open-in-app",
    get title() {
      return i18n.t("v2.settings.openPullRequestsInT3CodeLabel");
    },
    englishTitle: i18n.t("v2.settings.openPullRequestsInT3CodeLabel"),
    to: "/settings/integrations",
    searchTerms: ["pr links github browser external click default pull request view panel"],
  },
  {
    id: "browser-auto-show-floating-preview",
    get title() {
      return i18n.t("settings.option.browserAutoShowFloatingPreview");
    },
    englishTitle: i18n.t("settings.option.browserAutoShowFloatingPreview"),
    to: "/settings/integrations",
    searchTerms: ["agent opens browser device simulator pop into view hide"],
  },
  {
    id: "automatic-pull",
    get title() {
      return i18n.t("settings.label.automaticallyPull");
    },
    englishTitle: i18n.t("settings.label.automaticallyPull"),
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["auto pull default branch current checkout fast forward upstream"],
  },
  {
    id: "remove-agent-credits-on-merge",
    get title() {
      return i18n.t("v2.settings.removeAgentCreditsWhenMerging");
    },
    englishTitle: i18n.t("v2.settings.removeAgentCreditsWhenMerging"),
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request github squash co-authored-by attribution claude codex generated"],
  },
  {
    id: "pull-request-merge-method",
    get title() {
      return i18n.t("settings.label.defaultMergeMethod");
    },
    englishTitle: i18n.t("settings.label.defaultMergeMethod"),
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request merge squash rebase last selected"],
  },
  {
    id: "source-control",
    get title() {
      return i18n.t("settings.option.sourceControl");
    },
    englishTitle: i18n.t("settings.option.sourceControl"),
    to: "/settings/source-control",
    scope: "environment-defaults",
    searchTerms: [
      "version control git github gitlab forgejo gitea tea codeberg bitbucket azure devops hosting integrations credentials scan server environment",
    ],
  },
  {
    id: "git-fetch-interval",
    get title() {
      return i18n.t("settings.label.gitFetchInterval");
    },
    englishTitle: i18n.t("settings.label.gitFetchInterval"),
    to: "/settings/source-control",
    searchTerms: [
      "automatic remote branch refresh background credentials security keys seconds off",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "worktree-branch-naming",
    get title() {
      return i18n.t("v2.settings.worktreeBranchNaming");
    },
    englishTitle: i18n.t("v2.settings.worktreeBranchNaming"),
    to: "/settings/source-control",
    searchTerms: ["static semantic prefix custom prompt instructions feat fix refactor chore"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "github-accounts",
    get title() {
      return i18n.t("v2.settings.gitHubAccountsAndToken");
    },
    englishTitle: i18n.t("v2.settings.gitHubAccountsAndToken"),
    to: "/settings/source-control",
    searchTerms: [
      "github gh account login user host enterprise ghes switch multiple accounts disable sign in token personal access token pat api key credential",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  ...SOURCE_CONTROL_HOST_SEARCH_ITEMS,
  {
    id: "source-control-writing-style",
    get title() {
      return i18n.t("settings.label.sourceControlWritingStyle");
    },
    englishTitle: i18n.t("settings.label.sourceControlWritingStyle"),
    to: "/settings/source-control",
    searchTerms: [
      "repository conventions conventional commits custom instructions change descriptions request titles",
    ],
    environmentOnly: true,
  },
  {
    id: "follow-change-request-templates",
    get title() {
      return i18n.t("settings.label.followChangeRequestTemplates");
    },
    englishTitle: i18n.t("settings.label.followChangeRequestTemplates"),
    to: "/settings/source-control",
    searchTerms: ["repository pr pull request description structure"],
    environmentOnly: true,
  },
  {
    id: "source-control-writer-model",
    get title() {
      return i18n.t("settings.sourceControl.writerModel");
    },
    englishTitle: i18n.t("settings.sourceControl.writerModel"),
    to: "/settings/source-control",
    searchTerms: [
      "override generated commit change request pr titles descriptions branch bookmark",
    ],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "review-guides",
    get title() {
      return i18n.t("v2.settings.reviewGuidesBeta");
    },
    englishTitle: i18n.t("v2.settings.reviewGuidesBeta"),
    to: "/settings/source-control",
    searchTerms: ["pull request pr guided review guide tour beta experimental"],
    environmentOnly: true,
  },
  {
    id: "review-guide-model",
    get title() {
      return i18n.t("v2.settings.reviewGuideModel");
    },
    englishTitle: i18n.t("v2.settings.reviewGuideModel"),
    to: "/settings/source-control",
    // Hidden until review guides are on, so a search lands on the switch that shows it.
    targetId: "review-guides",
    searchTerms: ["pull request pr guided review guide brief maintainer"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "review-guide-instructions",
    get title() {
      return i18n.t("v2.settings.reviewGuideInstructionsLabel");
    },
    englishTitle: i18n.t("v2.settings.reviewGuideInstructionsLabel"),
    to: "/settings/source-control",
    targetId: "review-guides",
    searchTerms: ["pull request pr guided review guide preferences taste prompt custom"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "project-actions",
    get title() {
      return i18n.t("settings.label.actions");
    },
    englishTitle: i18n.t("settings.label.actions"),
    to: "/settings/projects",
    searchTerms: ["commands scripts setup run dev server checkout worktree t3.json import"],
  },
  {
    id: "environment-icon",
    get title() {
      return i18n.t("settings.label.environmentIcon");
    },
    englishTitle: i18n.t("settings.label.environmentIcon"),
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["machine glyph sidebar mac mini studio laptop desktop server cloud vm"],
  },
  {
    id: "local-environment",
    get title() {
      return i18n.t("settings.label.localEnvironment");
    },
    englishTitle: i18n.t("settings.label.localEnvironment"),
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["turn off on disable enable local server agents remote only restart"],
    desktopOnly: true,
  },
  {
    id: "network-access",
    get title() {
      return i18n.t("settings.label.networkAccess");
    },
    englishTitle: i18n.t("settings.label.networkAccess"),
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["expose backend remote pairing local machine interfaces host restart"],
    localBackendManagementOnly: true,
  },
  {
    id: "tailscale-https",
    title: "Tailscale HTTPS",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["serve magicdns endpoint remote secure network"],
    desktopOnly: true,
    localBackendManagementOnly: true,
  },
  {
    id: "wsl-backend",
    get title() {
      return i18n.t("settings.label.wslBackend");
    },
    englishTitle: i18n.t("settings.label.wslBackend"),
    to: "/settings/connections",
    searchTerms: [
      "windows subsystem linux distro second server projects stop windows backend restart",
    ],
    desktopOnly: true,
    windowsOnly: true,
    localBackendManagementOnly: true,
    wslAvailableOnly: true,
  },
  {
    id: "t3-connect",
    localEnvironmentOnly: true,
    title: "T3 Connect",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["managed tunnel cloud other devices remote"],
    desktopOnly: true,
    cloudOnly: true,
  },
  {
    id: "hold-webhooks-while-offline",
    localEnvironmentOnly: true,
    get title() {
      return i18n.t("v2.settings.holdWebhooksWhileOffline");
    },
    englishTitle: i18n.t("v2.settings.holdWebhooksWhileOffline"),
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["webhook automations offline queue mailbox t3 connect"],
    cloudOnly: true,
    managedTunnelOnly: true,
  },
  {
    id: "publish-agent-activity",
    localEnvironmentOnly: true,
    get title() {
      return i18n.t("settings.label.publishAgentActivity");
    },
    englishTitle: i18n.t("settings.label.publishAgentActivity"),
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["mobile push notifications live activities cloud tunnel"],
    cloudOnly: true,
  },
  {
    id: "connections-environment",
    get title() {
      return i18n.t("settings.label.thisMachine");
    },
    englishTitle: i18n.t("settings.label.thisMachine"),
    to: "/settings/connections",
    searchTerms: [
      "connections server backend local remote access administrative permissions scope pairing links qr code authorized clients sessions revoke endpoint",
    ],
  },
  {
    id: "remote-environments",
    get title() {
      return i18n.t("settings.label.environments");
    },
    englishTitle: i18n.t("settings.label.environments"),
    to: "/settings/connections",
    searchTerms: ["add pair backend host code ssh config agent tunnel saved t3 connect"],
  },
  {
    id: "load-balancing",
    get title() {
      return i18n.t("settings.label.loadBalancing");
    },
    englishTitle: i18n.t("settings.label.loadBalancing"),
    to: "/settings/connections",
    searchTerms: [
      "automatic machine environment resources cpu memory capacity preference weight shared projects",
    ],
  },
  {
    id: "github-routing",
    get title() {
      return i18n.t("settings.label.githubSharing");
    },
    englishTitle: i18n.t("settings.label.githubSharing"),
    to: "/settings/connections",
    searchTerms: ["pull request trusted environments shared credentials permissions read actions"],
  },
  {
    id: "archive",
    get title() {
      return i18n.t("settings.option.archivedThreads");
    },
    englishTitle: i18n.t("settings.option.archivedThreads"),
    to: "/settings/archived",
    searchTerms: ["restore reopen deleted history projects"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = new Map(SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item] as const));

const SETTINGS_CATEGORY_SCOPES: Readonly<Record<SettingsPath, SettingsSearchScope | null>> = {
  "/settings/diagnostics": "environment",
  "/settings/projects": "project",
  "/settings/general": null,
  "/settings/appearance": null,
  "/settings/snap-shot": null,
  "/settings/keybindings": null,
  "/settings/providers": null,
  "/settings/integrations": null,
  "/settings/source-control": "environment-defaults",
  "/settings/storage": "project-defaults",
  "/settings/connections": "connections",
  "/settings/scheduled-tasks": null,
  "/settings/archived": "project-defaults",
};

export function getSettingsSearchTargetScope(targetId: string) {
  const items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS;
  const item =
    items.find((candidate) => candidate.id === targetId) ??
    items.find((candidate) => candidate.targetId === targetId);
  return item
    ? {
        title: item.title,
        scope: item.scope ?? SETTINGS_CATEGORY_SCOPES[item.to],
        ...(item.requiresThreadAutoSettlement ? { requiresThreadAutoSettlement: true } : {}),
      }
    : null;
}

interface AutoSettlementSearchEnvironment {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: EnvironmentConnectionPhase };
  readonly serverConfig: {
    readonly environment: {
      readonly capabilities: { readonly threadAutoSettlement?: boolean };
    };
  } | null;
}

export function getThreadAutoSettlementSearchAvailability(
  environments: readonly AutoSettlementSearchEnvironment[],
  scope?: Pick<ResolvedSettingsScope, "kind" | "environmentIds">,
) {
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const eligibleEnvironmentIds = connected
    .filter(
      (environment) =>
        environment.serverConfig?.environment.capabilities.threadAutoSettlement === true,
    )
    .map((environment) => environment.environmentId);
  const selected = connected.filter((environment) =>
    scope?.environmentIds.includes(environment.environmentId),
  );
  return {
    eligibleEnvironmentIds,
    isTargetAvailable:
      scope !== undefined &&
      scope.kind !== "unavailable" &&
      selected.length > 0 &&
      selected.every((environment) => eligibleEnvironmentIds.includes(environment.environmentId)),
  };
}

export function isSettingsSearchScopeAvailable(
  requiredScope: SettingsSearchScope | null,
  scopeKind: ResolvedSettingsScope["kind"],
): boolean {
  switch (requiredScope) {
    case null:
    case "connections":
      return true;
    case "environment":
    case "checkout":
      return requiredScope === scopeKind;
    case "project":
      return scopeKind === "project" || scopeKind === "checkout";
    case "environment-defaults":
      return scopeKind === "environment" || scopeKind === "all";
    case "project-defaults":
      return (
        scopeKind === "environment" ||
        scopeKind === "all" ||
        scopeKind === "project" ||
        scopeKind === "checkout"
      );
  }
}

function settingsScopeKindFromSearch(search: SettingsScopeSearch): ResolvedSettingsScope["kind"] {
  const target = validateSettingsScopeSearch({ ...search });
  if (target.checkout && !target.project) return "unavailable";
  if (target.project) return target.checkout ? "checkout" : "project";
  return target.machine ? "environment" : "all";
}

export function isSettingsOverviewVisible(search: SettingsScopeSearch): boolean {
  const kind = settingsScopeKindFromSearch(search);
  return kind === "project" || kind === "checkout";
}

export function searchableSetting(
  id: SettingsSearchItemId,
  t: typeof i18n.t = i18n.t,
): {
  readonly id: string;
  readonly title: string;
  readonly englishTitle?: string;
} {
  const item = SEARCH_ITEMS_BY_ID.get(id)!;
  return { id: item.id, title: translatedSearchTitle(item, t) };
}

export function filterAvailableSettingsSearchItems(
  availability: SettingsSearchAvailability,
  t: typeof i18n.t = i18n.t,
): ReadonlyArray<SettingsSearchItem> {
  const items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS;
  return items
    .map((item) => ({ ...item, title: translatedSearchTitle(item, t) }))
    .filter(
      (item) =>
        (!item.cloudOnly || availability.hasCloudPublicConfig) &&
        (!item.environmentOnly || availability.hasEnvironment) &&
        (!item.providerSettingsOnly || availability.hasProviderSettingsEnvironment) &&
        (!item.macProviderSettingsOnly || availability.hasMacProviderSettingsEnvironment) &&
        (!item.localBackendManagementOnly || availability.canManageLocalBackend) &&
        (!item.localEnvironmentOnly || !availability.localEnvironmentDisabled) &&
        (!item.wslAvailableOnly || availability.isWslSettingsRowVisible) &&
        (!item.requiresThreadAutoSettlement || availability.hasThreadAutoSettlement) &&
        (!item.managedTunnelOnly || availability.managedTunnelActive === true),
    );
}

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS,
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const queryTokens = normalizedQuery.split(" ");
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;

  return items
    .flatMap((item, index) => {
      if (!isElectron && item.desktopOnly === true) return [];
      if (item.releaseChannelOnly && !isElectron && HOSTED_APP_CHANNEL === null) return [];
      if (item.macOnly && !isMacPlatform(platform)) return [];
      if (item.windowsOnly && !isWindowsPlatform(platform)) return [];

      const title = normalizeSearchText(item.title);
      const fields = [
        title,
        normalizeSearchText(SETTINGS_SECTION_LABELS[item.to]),
        normalizeSearchText(item.englishTitle ?? ""),
        normalizeSearchText(item.to.replace("/settings/", "").replaceAll("-", " ")),
        ...(item.searchTerms ?? []).map(normalizeSearchText),
      ];
      if (!queryTokens.every((token) => fields.some((field) => field.includes(token)))) return [];

      const exactPhraseField = fields.findIndex((field) => field.includes(normalizedQuery));
      const rank =
        title === normalizedQuery
          ? 5
          : title.startsWith(normalizedQuery)
            ? 4
            : title.includes(normalizedQuery)
              ? 3
              : queryTokens.every((token) => title.includes(token))
                ? 2
                : exactPhraseField >= 0
                  ? 1
                  : 0;
      return [{ item, index, rank }];
    })
    .toSorted(
      (left, right) =>
        Number(left.item.secondary ?? false) - Number(right.item.secondary ?? false) ||
        right.rank - left.rank ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

const SETTINGS_TITLE_KEYS: Readonly<Record<string, MessageKey>> = {
  "setting-language": "v2.settings.language",
  "storage-worktree-keep-when": "v2.settings.keepWorktreesWithLocalChanges",
  "storage-delete-now": "v2.settings.deleteNow",
  "storage-worktrees": "settings.label.worktreeCleanup",
  "storage-worktrees-location": "v2.settings.worktreeLocationLabel",
  "storage-artifacts": "settings.label.artifactsAndLogs",
  "project-defaults": "settings.label.projectDefaultsAndOverrides",
  "project-overview": "settings.label.projectOverview",
  "default-model": "settings.label.defaultModel",
  "default-permissions": "device.permissions",
  "color-scheme": "settings.option.colorScheme",
  theme: "settings.option.themes",
  "setting-appearance-contrast": "settings.option.contrast",
  "setting-glass-opacity": "settings.option.glassOpacity",
  "diff-color-scheme": "settings.label.diffColors",
  "chat-width": "settings.label.chatWidth",
  "panel-animations": "settings.label.panelAnimations",
  "environment-identification": "settings.option.environmentIdentification",
  "interface-font": "settings.option.interfaceFont",
  "prompt-font": "settings.option.promptFont",
  "code-font": "settings.option.codeFont",
  "terminal-font": "settings.option.terminalFont",
  "font-smoothing": "settings.option.fontSmoothing",
  "word-wrap": "settings.option.wordWrap",
  "composer-context": "v2.settings.composerContextLabel",
  "project-grouping": "settings.option.projectGrouping",
  "project-order": "v2.settings.projectOrderLabel",
  "snooze-limited-threads": "v2.settings.snoozeLimitedThreads",
  "auto-resume-limited-threads": "v2.settings.autoResumeLimitedThreads",
  "working-shelf": "v2.settings.workingSectionBeta",
  "auto-settle-inactive-threads": "settings.option.autoSettleInactiveThreads",
  "auto-settle-merged-threads": "settings.option.autoSettleMergedThreads",
  "days-before-auto-settle": "settings.label.daysOfInactivityBeforeAutoSettle",
  "thread-notifications": "settings.label.threadNotifications",
  "in-app-notifications": "settings.label.inAppNotifications",
  "time-format": "settings.option.timeFormat",
  "response-streaming": "settings.label.responseStreaming",
  "hide-whitespace-changes": "settings.option.hideWhitespaceChanges",
  "default-diff-file-state": "settings.label.defaultDiffFileState",
  "diff-layout": "pr.diffLayout",
  "proactive-panels": "settings.label.proactivePanels",
  "skills-in-slash-menu": "settings.option.skillsInSlashMenu",
  "composer-rich-text": "settings.label.richTextComposer",
  "composer-collapse": "settings.label.collapseComposerOnScroll",
  "send-shortcut": "settings.label.sendShortcut",
  "follow-up-behavior": "settings.label.followUpBehavior",
  "provider-update-checks": "settings.option.providerUpdateChecks",
  "continue-threads-after-server-update": "settings.label.continueThreadsAfterRestarts",
  "background-activity": "settings.label.backgroundActivity",
  "new-threads": "settings.option.newThreads",
  "worktree-submodules": "settings.label.submodules",
  "start-from-origin": "branchToolbar.startFromOrigin",
  "add-project-starts-in": "settings.option.addProjectStartsIn",
  "unpin-confirmation": "settings.label.unpinConfirmation",
  "archive-confirmation": "settings.option.archiveConfirmation",
  "delete-confirmation": "settings.option.deleteConfirmation",
  "quit-confirmation": "settings.label.quitShortcut",
  "text-generation-model": "settings.misc.textGenerationModel",
  "app-version": "settings.label.version",
  "update-track": "settings.label.updateTrack",
  "cli-command": "v2.settings.t3Command",
  "privacy-policy": "v2.settings.privacyPolicy",
  "telemetry-export": "v2.settings.openTelemetryExport",
  diagnostics: "settings.option.diagnostics",
  "open-source-licenses": "settings.label.openSourceLicenses",
  "legacy-plan-mode": "settings.option.legacyPlanMode",
  "legacy-context-window-indicator": "settings.label.contextWindowIndicatorLegacy",
  "legacy-sidebar": "settings.option.legacySidebar",
  keybindings: "settings.option.keybindings",
  "snap-shot-enabled": "settings.section.snapShot",
  "snap-shot-accessibility": "settings.label.includeAppText",
  "snap-shot-shortcut": "settings.label.captureShortcut",
  "snap-shot-sound": "settings.label.captureSound",
  "snap-shot-flash": "settings.label.captureFlash",
  "snap-shot-animations": "settings.label.captureAnimations",
  providers: "settings.option.providers",
  "usage-providers": "settings.label.usageProviders",
  "cursor-keychain-usage": "settings.label.cursorAccountUsage",
  "provider-health-check-interval": "settings.label.healthCheckInterval",
  "agent-browser-access": "settings.option.agentBrowserAccess",
  "device-hosts": "settings.label.deviceHosts",
  "agent-device-access": "settings.label.agentDeviceAccess",
  "device-hub": "device.deviceHub",
  "device-platform-support": "settings.label.simulatorSupport",
  "browser-profiles": "settings.label.browserProfiles",
  "browser-default-profile": "settings.label.defaultBrowserProfile",
  "browser-default-viewport": "settings.option.browserDefaultViewport",
  "browser-default-zoom": "settings.option.browserDefaultZoom",
  "browser-default-appearance": "settings.option.browserDefaultAppearance",
  "browser-recording-frame-rate": "settings.label.browserRecordingFrameRate",
  "browser-recording-key-presses": "settings.label.showKeyPressesInRecordings",
  "browser-recording-mouse-presses": "settings.label.showMousePressesInRecordings",
  "browser-link-target": "settings.label.openLinksIn",
  "pull-request-links-open-in-app": "v2.settings.openPullRequestsInT3CodeLabel",
  "browser-auto-show-floating-preview": "settings.option.browserAutoShowFloatingPreview",
  "automatic-pull": "settings.label.automaticallyPull",
  "remove-agent-credits-on-merge": "v2.settings.removeAgentCreditsWhenMerging",
  "pull-request-merge-method": "settings.label.defaultMergeMethod",
  "source-control": "settings.option.sourceControl",
  "git-fetch-interval": "settings.label.gitFetchInterval",
  "worktree-branch-naming": "v2.settings.worktreeBranchNaming",
  "github-accounts": "v2.settings.gitHubAccountsAndToken",
  "source-control-writing-style": "settings.label.sourceControlWritingStyle",
  "follow-change-request-templates": "settings.label.followChangeRequestTemplates",
  "source-control-writer-model": "settings.sourceControl.writerModel",
  "review-guides": "v2.settings.reviewGuidesBeta",
  "review-guide-model": "v2.settings.reviewGuideModel",
  "review-guide-instructions": "v2.settings.reviewGuideInstructionsLabel",
  "project-actions": "settings.label.actions",
  "environment-icon": "settings.label.environmentIcon",
  "local-environment": "settings.label.localEnvironment",
  "network-access": "settings.label.networkAccess",
  "wsl-backend": "settings.label.wslBackend",
  "hold-webhooks-while-offline": "v2.settings.holdWebhooksWhileOffline",
  "publish-agent-activity": "settings.label.publishAgentActivity",
  "connections-environment": "settings.label.thisMachine",
  "remote-environments": "settings.label.environments",
  "load-balancing": "settings.label.loadBalancing",
  "github-routing": "settings.label.githubSharing",
  archive: "settings.option.archivedThreads",
};
const SETTINGS_SECTION_KEYS = {
  "/settings/diagnostics": "settings.option.diagnostics",
  "/settings/projects": "pr.project",
  "/settings/general": "settings.section.general",
  "/settings/appearance": "device.appearance",
  "/settings/keybindings": "settings.option.keybindings",
  "/settings/snap-shot": "settings.section.snapShot",
  "/settings/providers": "settings.option.providers",
  "/settings/integrations": "settings.section.integrations",
  "/settings/scheduled-tasks": "v2.settings.scheduledTasks2",
  "/settings/source-control": "settings.section.sourceControl",
  "/settings/storage": "settings.label.storage",
  "/settings/connections": "settings.section.connections",
  "/settings/archived": "action.archive",
} as const;

export function settingsSectionLabel(path: SettingsPath, t: typeof i18n.t = i18n.t): string {
  return t(SETTINGS_SECTION_KEYS[path]);
}

function translatedSearchTitle(item: SettingsSearchItem, t: typeof i18n.t): string {
  const key = SETTINGS_TITLE_KEYS[item.id];
  return key ? t(key) : item.title;
}
