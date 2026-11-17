import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { localeAtom } from "./locale.js";
import preferences from "@ohos.data.preferences";
import { Atom, AsyncResult } from "effect/reactivity";
import {
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  sessionGrantsScope,
} from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  createEnvironmentThreadShellAtoms,
  createThreadFamilyAtoms,
  createThreadEnvironmentAtoms,
  createOlderSettledThreadAtoms,
  settledShelfFrontier,
  isListedSettledThread,
  unloadedOlderSettledCount,
  wantedOlderSettledPages,
} from "@t3tools/client-runtime/state/threads";
import {
  resolveThreadWorkingStartedAt,
  formatWorkingDurationLabel,
  threadRuntimeCanArchive,
} from "@t3tools/client-runtime/state/models";
import { activeChildThreadsByParent, waitingOn } from "@t3tools/client-runtime/state/waiting-on";
import { inboxByThread, inboxRows } from "@t3tools/client-runtime/state/inbox-rows";
import {
  canSnooze,
  resolveCustomSnooze,
  localSnoozeDate,
  localSnoozeTime,
} from "@t3tools/client-runtime/state/thread-settled";
import { createEnvironmentServerConfigsAtom } from "@t3tools/client-runtime/state/shell";
import { createEnvironmentSummaryAtoms } from "@t3tools/client-runtime/state/presentation";
import { createThreadListEnvironmentsAtom } from "../../../apps/mobile/src/state/thread-list-environments.ts";
import {
  buildThreadListV2Items,
  buildThreadListV2ListItems,
  resolveThreadListV2Status,
  resolveThreadListV2ProviderDrivers,
  resolveThreadListV2SwipeActions,
  resolveThreadListV2SnoozePresets,
  resolveThreadListV2SnoozeMenuSelection,
  getThreadListV2OrderedSection,
  threadHasUnseenCompletion,
  THREAD_LIST_V2_SETTLED_INITIAL_COUNT,
  THREAD_LIST_V2_SETTLED_PAGE_COUNT,
} from "../../../apps/mobile/src/features/threads/threadListV2.ts";
import { buildThreadListV2Menu } from "../../../apps/mobile/src/features/threads/threadListV2Menu.ts";
import {
  computeThreadMoveAvailability,
  createThreadMovePlanner,
} from "../../../apps/mobile/src/features/threads/threadOrder.ts";
import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { shouldRecedeThreadRow } from "../../../apps/mobile/src/features/threads/thread-row-emphasis.ts";
import { resolveThreadTitleRename } from "../../../apps/mobile/src/features/threads/thread-title-rename.ts";
import {
  resolveProjectIconGlyph,
  resolveProjectIconSymbol,
  projectAutoMonogram,
} from "../../../apps/mobile/src/lib/projectIcon.ts";
import { relativeTime, msUntilRelativeTimeChange } from "../../../apps/mobile/src/lib/time.ts";
import { i18n } from "@t3tools/shared/i18n";

const t = (key, values) => i18n.t(key, values);
const actionKey = {
  settle: "mobile.threads.settle",
  unsettle: "mobile.threads.unSettle",
  snooze: "mobile.threads.snooze",
  unsnooze: "mobile.threads.wake",
  archive: "mobile.threads.archive",
  delete: "mobile.threads.delete",
  pin: "mobile.threads.pin",
  unpin: "mobile.threads.unpin",
  rename: "mobile.threads.rename",
};
const action = (id, disabled = false) => ({ id, title: t(actionKey[id]), disabled });
const keyOf = (thread) =>
  scopedThreadKey({ environmentId: thread.environmentId, threadId: thread.id });

export async function createLists({
  runtime,
  registry,
  catalog,
  shell,
  session,
  server,
  presentations,
  context,
}) {
  const prefs = await preferences.getPreferences(context, { name: "t3-list-preferences" });
  const savedShelves = JSON.parse(await prefs.get("shelves", "{}"));
  const families = createThreadFamilyAtoms(runtime, shell.stateAtom);
  const commands = createThreadEnvironmentAtoms(runtime, families.snapshotAtom);
  const threads = createEnvironmentThreadShellAtoms({
    catalogValueAtom: catalog.catalogValueAtom,
    snapshotAtom: commands.snapshotAtom,
    hiddenThreadTagsAtom: server.hiddenThreadTagsAtom,
  });
  const older = createOlderSettledThreadAtoms(runtime, shell.stateAtom);
  const { connectedEnvironmentIdsAtom } = createEnvironmentSummaryAtoms({
    catalogValueAtom: catalog.catalogValueAtom,
    presentationAtom: presentations.presentationAtom,
  });
  const configs = createEnvironmentServerConfigsAtom({
    catalogValueAtom: catalog.catalogValueAtom,
    serverConfigValueAtom: server.configValueAtom,
  });
  const capabilities = createThreadListEnvironmentsAtom(configs, connectedEnvironmentIdsAtom);
  const options = Atom.make({
    searchQuery: "",
    projectKey: "",
    workingShelfExpanded: false,
    snoozedShelfExpanded: false,
    settledShelfExpanded: false,
    settledLimit: THREAD_LIST_V2_SETTLED_INITIAL_COUNT,
    ...savedShelves,
  });
  const clock = Atom.make(Date.now());
  const regenerating = Atom.make(new Set());
  const orderInput = (get) => {
    const caps = get(capabilities);
    const allThreads = get(threads.navigationThreadShellsAtom);
    return {
      allThreads,
      ordered: getThreadListV2OrderedSection({
        threads: allThreads,
        section: "pinned",
        now: new Date().toISOString(),
        settlementEnvironmentIds: caps.settlementEnvironmentIds,
        snoozeEnvironmentIds: caps.snoozeEnvironmentIds,
      }),
      section: "pinned",
      reorderableEnvironmentIds: caps.pinReorderEnvironmentIds,
    };
  };
  const order = Atom.make(orderInput);
  const moves = Atom.make((get) => computeThreadMoveAvailability(get(order)));
  const pages = Atom.make(new Map());
  const permitted = (get, id, scope) => {
    const result = get(session.sessionStateAtom(id));
    const value = AsyncResult.getOrElse(result, () => null);
    return result._tag !== "Failure" && value !== null && sessionGrantsScope(value, scope);
  };
  const inbox = Atom.make((get) => {
    const environments = [];
    for (const [environmentId, presentation] of get(presentations.presentationsAtom)) {
      if (
        presentation.connection.phase !== "connected" ||
        !permitted(get, environmentId, AuthOrchestrationReadScope)
      )
        continue;
      const result = get(server.inboxLive({ environmentId, input: {} }));
      environments.push({
        environmentId,
        label: presentation.entry.target.label,
        snapshot: AsyncResult.getOrElse(result, () => null),
        pending: result.waiting,
        failed: result._tag === "Failure",
        writable: permitted(get, environmentId, AuthOrchestrationOperateScope),
      });
    }
    return environments;
  });
  const pageScopes = Atom.make((get) => {
    const opts = get(options);
    const project = opts.projectKey ? JSON.parse(opts.projectKey) : null;
    return [...get(catalog.catalogValueAtom).entries]
      .filter(([id, entry]) => entry.enabled && (!project || project.environmentId === id))
      .map(([environmentId]) => ({
        scope: { environmentId, projectIds: project ? [project.projectId] : null },
        pages: opts.settledShelfExpanded ? (get(pages).get(environmentId) ?? 0) : 0,
      }));
  });
  let mounts = [];
  const unmountPages = registry.subscribe(
    pageScopes,
    (scopes) => {
      for (const release of mounts) release();
      mounts = scopes
        .filter(({ pages }) => pages > 0)
        .map(({ scope, pages }) =>
          families.mountRows(
            registry,
            scope.environmentId,
            older.rowsKey(scope, pages),
            older.pageRowsAtom(scope, pages),
          ),
        );
    },
    { immediate: true },
  );
  const view = Atom.make((get) => {
    get(localeAtom);
    const opts = get(options);
    const nowMs = get(clock);
    const now = new Date(nowMs).toISOString();
    const envs = get(inbox);
    const questions = inboxByThread(envs);
    const caps = get(capabilities);
    const allThreads = get(threads.threadShellsAtom);
    const children = activeChildThreadsByParent(allThreads);
    const visible = get(threads.navigationThreadShellsAtom);
    const scopes = get(pageScopes);
    const shelf = get(older.shelfAtom(scopes));
    const frontier = settledShelfFrontier([...shelf.values()]);
    const projects = [];
    const projectNames = new Map();
    for (const [id, entry] of get(catalog.catalogValueAtom).entries) {
      if (!entry.enabled) continue;
      const snapshot = get(commands.snapshotAtom(id));
      for (const project of snapshot?.projects ?? []) {
        const key = JSON.stringify({ environmentId: id, projectId: project.id });
        projects.push({ key, label: `${project.title} · ${entry.target.label}` });
        projectNames.set(`${id}:${project.id}`, project);
      }
    }
    const layout = buildThreadListV2Items({
      ...opts,
      threads: visible,
      environmentId: null,
      projectRefs: opts.projectKey ? [JSON.parse(opts.projectKey)] : null,
      now,
      workingShelfEnabled: true,
      settlementEnvironmentIds: caps.settlementEnvironmentIds,
      snoozeEnvironmentIds: caps.snoozeEnvironmentIds,
      isListedSettled: (thread) => isListedSettledThread(thread.source, frontier),
      unloadedSettledCount: unloadedOlderSettledCount({
        olderSettled: (id) => shelf.get(id)?.older ?? null,
        scopes: scopes.map(({ scope }) => scope),
        threads: visible,
      }),
    });
    const wantedPages = wantedOlderSettledPages({
      requested: get(pages),
      environments: shelf,
      listedCount: layout.listedSettledThreads.length,
      visibleCount: opts.settledShelfExpanded ? opts.settledLimit : 0,
    });
    const items = buildThreadListV2ListItems({
      ...layout,
      ...opts,
      pendingTasks: [],
      snoozeLabelNow: now,
      snoozeEnvironmentIds: caps.snoozeEnvironmentIds,
    });
    const moveAvailability = get(moves);
    const rows = items.map((item) => {
      if (item.type !== "v2-thread") {
        const group = item.type.replace("v2-", "").replace("-shelf", "");
        return {
          key: item.key,
          kind: "group",
          group,
          title: item.expanded
            ? t(`mobile.shelf.${group}`)
            : `${t(`mobile.shelf.${group}`)} (${item.count})`,
          expanded: item.expanded,
        };
      }
      const { thread, variant, snoozed, pinned, wokeAt } = item.item;
      const key = keyOf(thread);
      const open = questions.get(key) ?? [];
      const status = resolveThreadListV2Status({ ...thread, hasOpenQuestions: open.length > 0 });
      const providers = caps.providersByEnvironmentId.get(thread.environmentId);
      const drivers = resolveThreadListV2ProviderDrivers(thread, providers);
      const wait = status === "waiting" ? waitingOn(thread, children.get(key) ?? []) : [];
      const started = resolveThreadWorkingStartedAt(thread);
      const duration = started ? formatWorkingDurationLabel(nowMs - Date.parse(started)) : "";
      const waitedSince = thread.latestRun?.completedAt;
      const waitingDuration = waitedSince
        ? formatWorkingDurationLabel(nowMs - Date.parse(waitedSince))
        : "";
      const swipe = resolveThreadListV2SwipeActions({
        variant,
        settlementSupported: caps.settlementEnvironmentIds.has(thread.environmentId),
        snoozeSupported: caps.snoozeEnvironmentIds.has(thread.environmentId),
        snoozable: canSnooze(thread, { now }),
        snoozed,
      });
      const writable = permitted(get, thread.environmentId, AuthOrchestrationOperateScope);
      const presets = resolveThreadListV2SnoozePresets({
        secondary: swipe.secondary,
        now,
        presets: caps.snoozePresetsByEnvironmentId.get(thread.environmentId),
      });
      const nativeMenu = buildThreadListV2Menu({
        t,
        nested: false,
        thread,
        color: thread.source.color ?? null,
        supportsColors: get(configs).get(thread.environmentId)?.threadColors === true,
        variant,
        snoozed,
        settlementSupported: caps.settlementEnvironmentIds.has(thread.environmentId),
        pinningSupported: caps.pinningEnvironmentIds.has(thread.environmentId),
        autoSettleOptOutSupported: caps.autoSettleOptOutEnvironmentIds.has(thread.environmentId),
        titleRegenerationSupported: caps.titleRegenerationEnvironmentIds.has(thread.environmentId),
        isRegeneratingTitle: get(regenerating).has(key),
        canTurnIntoProject:
          thread.worktreePath !== null &&
          get(configs).get(thread.environmentId)?.environment.capabilities
            .threadProjectFromScratch === true &&
          (() => {
            const project = get(commands.snapshotAtom(thread.environmentId))?.projects.find(
              (item) => item.id === thread.projectId,
            );
            return project
              ? isScratchProject(
                  project,
                  get(configs).get(thread.environmentId)?.scratchWorkspaceRoot,
                )
              : false;
          })(),
        canArchive: threadRuntimeCanArchive(thread.runtime),
        reorderSupported: pinned && caps.pinReorderEnvironmentIds.has(thread.environmentId),
        ...moveAvailability.get(key),
        snoozeSecondary: swipe.secondary,
        snoozePresets: presets,
      });
      const adaptMenu = (entries) =>
        entries

          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            subtitle: entry.subtitle ?? "",
            image: entry.image ?? "",
            imageColor: entry.imageColor ?? "",
            destructive: entry.attributes?.destructive === true,
            selected: entry.state === "on",
            disabled:
              entry.attributes?.disabled === true ||
              (!writable && entry.id !== "copy-thread" && entry.id !== "copy-thread-id") ||
              (entry.id === "archive" && !threadRuntimeCanArchive(thread.runtime)),
            children: entry.subactions ? adaptMenu(entry.subactions) : [],
          }));
      const menu = adaptMenu(nativeMenu);
      const project = projectNames.get(`${thread.environmentId}:${thread.projectId}`);
      // Mirrors ProjectFavicon; favicons need an authenticated fetch, so they fall back to the monogram.
      const symbol = resolveProjectIconSymbol(project?.projectIcon);
      const glyph = !project
        ? null
        : symbol
          ? { kind: "symbol", text: "", color: symbol.color }
          : (resolveProjectIconGlyph(project.projectIcon, project.title) ??
            projectAutoMonogram(project.title));
      // Mirrors the Android row badge: live statuses, then an unseen completion, then the time.
      const unread = status === "ready" && threadHasUnseenCompletion(thread);
      const badge =
        status === "ready" && wokeAt !== null
          ? "woke"
          : status === "ready"
            ? unread
              ? "done"
              : ""
            : status;
      const badgeLabel =
        badge === "working"
          ? [thread.goal?.status === "active" ? t("mobile.threads.goal") : "", duration]
              .filter(Boolean)
              .join(" ")
          : badge === "waiting"
            ? waitingDuration
            : badge === ""
              ? ""
              : t(
                  badge === "woke"
                    ? "sidebar.woke"
                    : badge === "request"
                      ? "mobile.threadActivityInspector.request"
                      : `mobile.threads.${badge}`,
                );
      return {
        key: item.key,
        threadKey: key,
        kind: "thread",
        id: thread.id,
        environmentId: thread.environmentId,
        title: thread.title,
        project: projectNames.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? "",
        projectIcon: glyph?.kind === "emoji" ? glyph.emoji : (glyph?.text ?? ""),
        projectIconKind: glyph?.kind ?? "",
        projectIconColor: glyph?.color ?? "",
        branch:
          (status === "failed" || status === "limited") && thread.runtime?.lastError
            ? thread.runtime.lastError
            : (thread.branch ?? t("sidebar.noBranch")),
        noBranch: !thread.branch,
        environment:
          get(catalog.catalogValueAtom).entries.get(thread.environmentId)?.target.label ?? "",
        provider: drivers.at(-1) ?? "codex",
        status,
        badge,
        statusLabel: badgeLabel,
        timeLabel:
          snoozed && item.snoozeWakeLabelText !== undefined
            ? item.snoozeWakeLabelText
            : item.timeLabel,
        variant,
        recede: shouldRecedeThreadRow({ status, selected: false }),
        color: thread.source.color ?? "",
        waiting: wait.slice(0, 3).map((entry) => ({
          key: entry.key,
          title: entry.title,
          provider: providers?.find((p) => p.instanceId === entry.providerInstanceId)?.driver ?? "",
          kind: entry.kind,
        })),
        waitingMore: Math.max(0, wait.length - 3),
        inboxCount: open.length,
        urgent: open.some((q) => q.urgent),
        pinned,
        writable,
        primary: action(swipe.primary, !writable),
        secondary: swipe.secondary ? action(swipe.secondary, !writable) : null,
        menu,
        presets,
      };
    });
    const inboxList = inboxRows(envs).map((row) =>
      row.kind === "question"
        ? {
            ...row,
            title: row.item.question,
            timeLabel: relativeTime(row.item.urgentAt ?? row.item.createdAt, nowMs),
            ...questionOrigin(row),
            writable: envs.find((env) => env.environmentId === row.environmentId).writable,
          }
        : {
            key: row.key,
            kind: row.kind,
            title:
              row.kind === "urgent-header"
                ? t("inbox.urgent")
                : row.kind === "environment"
                  ? row.environment.label
                  : row.title || t("inbox.other"),
          },
    );
    return {
      rows,
      projects,
      arrangeRows: get(order).ordered.map((thread) => ({
        id: thread.id,
        environmentId: thread.environmentId,
        title: thread.title,
        ...moveAvailability.get(keyOf(thread)),
        writable: permitted(get, thread.environmentId, AuthOrchestrationOperateScope),
      })),
      hiddenSettledCount: opts.settledShelfExpanded ? layout.hiddenSettledCount : 0,
      pageFailed: [...shelf.values()].some((env) => env.pages.status === "failed"),
      inboxRows: inboxList,
      inboxCount: envs.reduce((n, env) => n + (env.snapshot?.items.length ?? 0), 0),
      inboxStatus:
        envs.length === 0
          ? t("inbox.noEnvironments")
          : envs.some((e) => e.failed)
            ? t("inbox.failed")
            : envs.some((e) => e.pending && e.snapshot === null)
              ? t("inbox.loading")
              : envs.some((e) => e.snapshot?.askHumanAvailable === false)
                ? t("inbox.unavailable")
                : "",
      wantedPages,
      ticking: rows.some((row) => row.status === "working" || row.status === "waiting"),
      relativeTimes: rows.some((row) => row.timeLabel),
      nextSnoozeWakeAt: layout.nextSnoozeWakeAt,
      nextInboxChange: Math.min(
        ...envs.flatMap((env) =>
          (env.snapshot?.items ?? []).map(
            (item) => msUntilRelativeTimeChange(item.urgentAt ?? item.createdAt, nowMs) ?? Infinity,
          ),
        ),
      ),
    };
  });
  let timer;
  let active = true;
  let alive = true;
  const arm = (state) => {
    clearTimeout(timer);
    if (!active || !alive) return;
    const wake = state.nextSnoozeWakeAt
      ? Math.max(1, Date.parse(state.nextSnoozeWakeAt) - Date.now())
      : Infinity;
    // Row time labels read the wall clock, so recompute them on the next minute.
    const minute = state.relativeTimes ? 60_000 - (Date.now() % 60_000) : Infinity;
    const delay = Math.min(state.ticking ? 1000 : Infinity, wake, state.nextInboxChange, minute);
    if (Number.isFinite(delay)) timer = setTimeout(() => registry.set(clock, Date.now()), delay);
  };
  const release = registry.subscribe(
    view,
    (state) => {
      arm(state);
      if (state.wantedPages !== registry.get(pages))
        Promise.resolve().then(() => {
          if (alive) registry.set(pages, state.wantedPages);
        });
    },
    { immediate: true },
  );
  return {
    view,
    commands,
    threads,
    copyTarget: (environmentId, threadId) => {
      const thread = registry.get(threads.threadShellAtom({ environmentId, threadId }));
      return threadChipCopyTarget({ environmentId, threadId }, thread.title);
    },
    setRegenerating: (environmentId, threadId, active) => {
      const next = new Set(registry.get(regenerating));
      const key = scopedThreadKey({ environmentId, threadId });
      if (active) next.add(key);
      else next.delete(key);
      registry.set(regenerating, next);
    },
    move: (environmentId, threadId, direction) => {
      const input = registry.get(order);
      const assignments = createThreadMovePlanner(input)(
        scopedThreadKey({ environmentId, threadId }),
        direction,
      );
      if (!assignments) return [];
      const targets = new Map(input.allThreads.map((thread) => [keyOf(thread), thread]));
      return assignments.map(({ id, orderKey }) => {
        const target = targets.get(id);
        if (
          !permitted(
            (atom) => registry.get(atom),
            target.environmentId,
            AuthOrchestrationOperateScope,
          )
        )
          throw new Error(t("mobile.connectionTone.connectionFailed"));
        return [
          commands.reorderPin,
          { environmentId: target.environmentId, input: { threadId: target.id, orderKey } },
        ];
      });
    },
    update: (changes) => {
      registry.set(options, { ...registry.get(options), ...changes });
      registry.set(clock, Date.now());
    },
    toggle: async (group) => {
      const key = `${group}ShelfExpanded`;
      const next = { ...registry.get(options), [key]: !registry.get(options)[key] };
      await prefs.put(
        "shelves",
        JSON.stringify({
          workingShelfExpanded: next.workingShelfExpanded,
          snoozedShelfExpanded: next.snoozedShelfExpanded,
          settledShelfExpanded: next.settledShelfExpanded,
        }),
      );
      await prefs.flush();
      registry.set(options, next);
    },
    more: () =>
      registry.set(options, {
        ...registry.get(options),
        settledLimit: registry.get(options).settledLimit + THREAD_LIST_V2_SETTLED_PAGE_COUNT,
      }),
    retry: () => {
      for (const { scope, pages } of registry.get(pageScopes))
        older.retryPages(registry, scope, pages);
    },
    foreground: (value) => {
      active = value;
      if (active) registry.set(clock, Date.now());
      arm(registry.get(view));
    },
    command: (environmentId, threadId, event, value) => {
      const thread = registry.get(threads.threadShellAtom({ environmentId, threadId }));
      if (event === "regenerate-title")
        return [
          commands.updateMetadata,
          { environmentId, input: { threadId, regenerateTitle: true } },
        ];
      if (event.startsWith("auto-settle:"))
        return [
          commands.setAutoSettle,
          { environmentId, input: { threadId, enabled: event === "auto-settle:enabled" } },
        ];
      if (event === "snooze:custom") {
        const snoozedUntil = resolveCustomSnooze(JSON.parse(value), new Date());
        if (!snoozedUntil) throw new Error(t("mobile.customSnoozeSheet.chooseFutureDate"));
        return [commands.snooze, { environmentId, input: { threadId, snoozedUntil } }];
      }
      if (event === "rename") {
        const rename = resolveThreadTitleRename({ title: value, originalTitle: thread.title });
        if (rename.action === "noop") return null;
        if (rename.action === "reject-empty") throw new Error(t("mobile.threads.rename"));
        return [
          commands.updateMetadata,
          { environmentId, input: { threadId, title: rename.title } },
        ];
      }
      if (event.startsWith("color:"))
        return [
          commands.setColor,
          {
            environmentId,
            input: { threadId, color: event.slice(6) === "clear" ? null : event.slice(6) },
          },
        ];
      if (event.startsWith("snooze:")) {
        const row = registry
          .get(view)
          .rows.find((r) => r.id === threadId && r.environmentId === environmentId);
        const selected = resolveThreadListV2SnoozeMenuSelection({
          event,
          displayedPresets: row.presets,
          now: new Date(),
          presets: registry.get(capabilities).snoozePresetsByEnvironmentId.get(environmentId),
        });
        if (selected._tag !== "selected") throw new Error(t("mobile.threads.snooze"));
        return [
          commands.snooze,
          { environmentId, input: { threadId, snoozedUntil: selected.preset.snoozedUntil } },
        ];
      }
      if (event === "unsettle" || event === "unsnooze")
        return [commands[event], { environmentId, input: { threadId, reason: "user" } }];
      return [commands[event], { environmentId, input: { threadId } }];
    },
    dispose: () => {
      alive = false;
      clearTimeout(timer);
      release();
      unmountPages();
      for (const unmount of mounts) unmount();
    },
  };
}

// Mirrors the Android inbox list row and source row captions.
function questionOrigin(row) {
  const { item } = row;
  const project = item.thread === null ? null : item.thread.projectTitle || t("inbox.other");
  const title =
    item.thread === null
      ? item.workspace.split("/").findLast(Boolean) || item.agent || t("inbox.unknownThread")
      : item.thread.title || t("inbox.untitledThread");
  return {
    sourceTitle: title,
    sourceCrumbs: [row.environmentLabel, project].filter(Boolean).join(" · "),
    where: [
      row.environmentLabel,
      project === null ? item.agent || title : row.showThread ? `${project} › ${title}` : title,
    ]
      .filter(Boolean)
      .join(" · "),
    urgentReasonText: item.urgentReason
      ? t("inbox.urgentReason", { reason: item.urgentReason })
      : "",
  };
}

export function customSnoozeDefaults() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return { date: localSnoozeDate(date), time: localSnoozeTime(date) };
}
export function customSnoozeValid(value) {
  return resolveCustomSnooze(JSON.parse(value), new Date()) !== null;
}
