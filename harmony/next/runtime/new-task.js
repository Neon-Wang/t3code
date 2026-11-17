import { AuthOrchestrationOperateScope, sessionGrantsScope } from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/reactivity";
import {
  DEFAULT_SERVER_SETTINGS,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  T3_PROJECT_FILE_NAME,
} from "@t3tools/contracts";
import {
  resolveProjectSettings,
  resolveNewThreadEnvMode,
  resolveSendEnvMode,
} from "@t3tools/shared/projectSettings";
import { parseT3ProjectFile } from "@t3tools/shared/t3ProjectFile";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import {
  buildModelOptions,
  resolveDefaultableModelSelection,
  resolveNewTaskModelSelection,
} from "../../../apps/mobile/src/lib/modelOptions.ts";
import { buildProjectThreadStartTurnInput } from "../../../apps/mobile/src/lib/projectThreadStartTurn.ts";
import {
  resolveNewThreadRuntimeMode,
  runtimeModeChoicesForSupportedModes,
  withManagedRuntimeModeLimits,
} from "../../../apps/mobile/src/features/threads/thread-settings-options.ts";
import { resolveNewTaskBranchWorktreePath } from "../../../apps/mobile/src/features/threads/new-task-context-presentation.ts";
import { createVcsEnvironmentAtoms } from "@t3tools/client-runtime/state/vcs";
import { executeAtomQuery, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { newId } from "./composer.js";

export function createNewTask({
  runtime,
  registry,
  lists,
  server,
  catalog,
  projectCommands,
  session,
}) {
  const active = Atom.make("").pipe(Atom.keepAlive);
  const drafts = Atom.family(() =>
    Atom.make({
      text: "",
      selection: null,
      mode: null,
      branch: null,
      worktreePath: null,
      runtimeMode: undefined,
      refs: [],
      isRepo: false,
      loaded: false,
      busy: false,
      error: "",
      settings: null,
      start: null,
    }).pipe(Atom.keepAlive),
  );
  const vcs = createVcsEnvironmentAtoms(runtime);
  const projects = Atom.make((get) => {
    const rows = [];
    for (const [environmentId, environment] of get(catalog.catalogValueAtom).entries) {
      if (!environment.enabled) continue;
      const writable = AsyncResult.getOrElse(
        get(session.sessionStateAtom(environmentId)),
        () => null,
      );
      for (const project of get(lists.commands.snapshotAtom(environmentId))?.projects ?? []) {
        if (project.archivedAt != null) continue;
        rows.push({
          ...project,
          environmentId,
          key: JSON.stringify([environmentId, project.id]),
          label: `${environment.target.label} · ${project.title}`,
          environmentLabel: environment.target.label,
          writable:
            writable !== null && sessionGrantsScope(writable, AuthOrchestrationOperateScope),
        });
      }
    }
    return rows;
  });
  const view = Atom.make((get) => {
    const rows = get(projects);
    const selected = rows.find((item) => item.key === get(active));
    const state = get(drafts(get(active)));
    const config = selected ? get(server.configValueAtom(selected.environmentId)) : null;
    const defaults = resolveDefaultableModelSelection(
      config,
      state.settings?.settings.defaultModelSelection ?? null,
      selected?.id ?? null,
    );
    const models = buildModelOptions(
      config,
      state.selection ?? defaults,
      undefined,
      selected?.id ?? null,
    );
    const selection = resolveNewTaskModelSelection({
      draftSelection: state.selection,
      projectDefaultSelection: defaults,
      stickySelection: null,
      modelOptions: models,
    });
    const selectedModel = models.find(
      (item) => item.key === `${selection?.instanceId}:${selection?.model}`,
    );
    const mode = resolveSendEnvMode({
      isGitRepo: state.isRepo,
      requestedEnvMode:
        state.mode ??
        (state.settings
          ? resolveNewThreadEnvMode({
              projectSettings: state.settings,
              workspaceRoot: selected?.workspaceRoot ?? null,
              newProjectsRoot: config?.newProjectsRoot,
              projectHasThreads: selected
                ? (get(lists.commands.snapshotAtom(selected.environmentId))?.threads ?? []).some(
                    (thread) => thread.projectId === selected.id,
                  )
                : false,
            })
          : "local"),
    });
    const runtimeMode = resolveNewThreadRuntimeMode(
      state.runtimeMode,
      state.settings?.settings.defaultRuntimeMode ?? DEFAULT_SERVER_SETTINGS.defaultRuntimeMode,
      config?.managedPolicy,
    );
    return {
      ...state,
      selection,
      mode,
      runtimeMode,
      projects: rows.map(({ key, label, title, environmentLabel, writable }) => ({
        key,
        label,
        title,
        environment: environmentLabel,
        disabled: !writable,
      })),
      projectKey: selected?.key ?? "",
      modelKey: selectedModel?.key ?? "",
      models: models.map((item) => ({
        key: item.key,
        label: `${item.providerLabel} · ${item.label}`,
        provider: item.providerDriver,
        disabled: item.isUnavailable === true,
      })),
      provider: selectedModel?.providerDriver ?? "",
      modes: withManagedRuntimeModeLimits(
        runtimeModeChoicesForSupportedModes(selectedModel?.supportedRuntimeModes),
        [config?.managedPolicy],
      ).map((item) => ({ key: item.mode, label: item.label, disabled: !!item.disabledReason })),
      canSend:
        !!selected?.writable &&
        state.loaded &&
        !state.busy &&
        state.text.trim().length > 0 &&
        !!selection &&
        !selectedModel?.isUnavailable &&
        (mode !== "worktree" || !!state.branch),
    };
  });
  const update = (key, patch) =>
    registry.set(drafts(key), { ...registry.get(drafts(key)), ...patch });
  const checked = (result) => {
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      throw new Error(error instanceof Error ? error.message : "操作失败");
    }
    return result.value;
  };
  const select = async (key) => {
    registry.set(active, key);
    const project = registry.get(projects).find((row) => row.key === key);
    if (!project) return;
    update(key, { busy: true, loaded: false, error: "" });
    try {
      const config = registry.get(server.configValueAtom(project.environmentId));
      const result = await executeAtomQuery(
        registry,
        projectCommands.readFile({
          environmentId: project.environmentId,
          input: {
            cwd: project.workspaceRoot,
            relativePath: T3_PROJECT_FILE_NAME,
            allowMissing: true,
          },
        }),
      );
      const file = checked(result);
      const settings = resolveProjectSettings(
        config?.settings ?? DEFAULT_SERVER_SETTINGS,
        project.id,
        project,
        file.exists && !file.truncated ? parseT3ProjectFile(file.contents) : null,
      );
      const refs = [];
      let cursor;
      let page;
      do {
        page = checked(
          await vcs.readRefs.run(registry, {
            environmentId: project.environmentId,
            input: {
              cwd: project.workspaceRoot,
              ...(cursor === undefined ? {} : { cursor }),
              limit: 100,
            },
          }),
        );
        refs.push(...page.refs);
        cursor = page.nextCursor;
      } while (cursor !== null);
      const previous = registry.get(drafts(key));
      update(key, {
        settings,
        refs,
        isRepo: page.isRepo,
        branch:
          previous.branch ??
          refs.find((ref) => ref.current)?.name ??
          refs.find((ref) => ref.isDefault)?.name ??
          null,
        loaded: true,
      });
      if (config?.environment.capabilities.modelCatalogRefresh === true)
        checked(
          await server.refreshProviders.run(registry, {
            environmentId: project.environmentId,
            input: { modelCatalogOnly: true },
          }),
        );
    } catch (error) {
      update(key, { error: error.message });
    } finally {
      update(key, { busy: false });
    }
  };
  return {
    subscribe(listener) {
      return registry.subscribe(view, (value) => listener(JSON.stringify(value)), {
        immediate: true,
      });
    },
    async begin(environmentId, threadId) {
      const source = threadId
        ? registry.get(lists.threads.threadShellAtom({ environmentId, threadId }))
        : null;
      const key = source
        ? JSON.stringify([environmentId, source.projectId])
        : registry.get(active) || registry.get(projects).find((row) => row.writable)?.key;
      if (!key) return;
      if (source)
        update(key, {
          mode: "local",
          branch: source.branch,
          worktreePath: source.worktreePath,
          selection: source.modelSelection,
        });
      await select(key);
    },
    async action(action, value) {
      const key = registry.get(active);
      const state = registry.get(drafts(key));
      if (action === "text") {
        update(key, { text: value, start: null });
        return "";
      }
      if (state.busy) return "";
      if (action === "project") {
        await select(value);
        return "";
      }
      if (action === "reload") {
        await select(key);
        return "";
      }
      if (action === "model") {
        const project = registry.get(projects).find((row) => row.key === key);
        const model = buildModelOptions(
          registry.get(server.configValueAtom(project.environmentId)),
          state.selection,
          undefined,
          project.id,
        ).find((model) => model.key === value && !model.isUnavailable);
        if (model) update(key, { selection: model.selection, start: null });
        return "";
      }
      if (action === "branch") {
        const branch = state.refs.find((ref) => ref.name === value);
        update(key, {
          branch: value,
          worktreePath: resolveNewTaskBranchWorktreePath({
            workspaceMode: registry.get(view).mode,
            branchWorktreePath: branch?.worktreePath ?? null,
            projectCwd: registry.get(projects).find((row) => row.key === key)?.workspaceRoot,
          }),
          start: null,
        });
        return "";
      }
      if (action === "mode" || action === "runtimeMode") {
        update(key, { [action]: value, start: null });
        return "";
      }
      if (action !== "send") throw new Error("未知新建任务操作");
      const current = registry.get(view);
      if (!current.canSend) throw new Error("请完成任务设置后发送");
      const project = registry.get(projects).find((row) => row.key === key);
      const start =
        state.start ??
        buildProjectThreadStartTurnInput({
          projectId: project.id,
          projectCwd: project.workspaceRoot,
          threadId: newId(),
          commandId: newId(),
          messageId: newId(),
          createdAt: new Date().toISOString(),
          text: state.text.trim(),
          uploadedAttachments: [],
          modelSelection: current.selection,
          runtimeMode: current.runtimeMode,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          workspaceMode: current.mode,
          branch: state.branch,
          worktreePath: state.worktreePath,
          startFromOrigin: state.settings.settings.newWorktreesStartFromOrigin,
          worktreeBranchName: buildTemporaryWorktreeBranchName(newId),
        });
      update(key, { busy: true, error: "", start });
      try {
        checked(
          await lists.commands.startTurn.run(registry, {
            environmentId: project.environmentId,
            input: start,
          }),
        );
        update(key, { text: "", start: null });
        return JSON.stringify({ environmentId: project.environmentId, threadId: start.threadId });
      } catch (error) {
        update(key, { error: error.message });
        return "";
      } finally {
        update(key, { busy: false });
      }
    },
  };
}
