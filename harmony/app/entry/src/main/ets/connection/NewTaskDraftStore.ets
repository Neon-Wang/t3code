import { DraftStore } from './DraftStore';
import { ModelSelection, StartTurnCommand } from '../model/Models';

export interface CreateTaskCommand {
  type: string;
  commandId: string;
  threadId: string;
  projectId: string;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: string;
  interactionMode: string;
  branch: string | null;
  worktreePath: string | null;
  createdAt: string;
}

export interface NewTaskDraft {
  newWorktree?: boolean;
  worktreeRef?: string;
  branch?: string | null;
  worktreePath?: string | null;
  projectId: string;
  title: string;
  text: string;
  modelSelection: ModelSelection;
  runtimeMode: string;
  interactionMode: string;
  createdThreadId: string;
  turnCommand: StartTurnCommand | null;
  createCommand?: CreateTaskCommand | null;
}

export class NewTaskDraftStore {
  private store: DraftStore;
  private constructor(store: DraftStore) { this.store = store; }
  static async open(filesDir: string, environmentId: string): Promise<NewTaskDraftStore> {
    return new NewTaskDraftStore(await DraftStore.open(filesDir, environmentId, 'new-task'));
  }
  async load(): Promise<NewTaskDraft | null> {
    const raw = await this.store.load();
    if (!raw) return null;
    const draft = JSON.parse(raw) as NewTaskDraft;
    if (draft === null || typeof draft.projectId !== 'string' || typeof draft.title !== 'string' ||
      typeof draft.text !== 'string' || typeof draft.createdThreadId !== 'string' ||
      typeof draft.modelSelection?.instanceId !== 'string' || typeof draft.modelSelection?.model !== 'string' ||
      (draft.runtimeMode !== 'full-access' && draft.runtimeMode !== 'approval-required' &&
        draft.runtimeMode !== 'auto-accept-edits' && draft.runtimeMode !== 'auto') ||
      (draft.interactionMode !== 'default' && draft.interactionMode !== 'plan')) {
      throw new Error('新任务草稿无效，已保留原记录');
    }
    if (draft.turnCommand !== null && (draft.turnCommand === undefined ||
      draft.turnCommand.type !== 'thread.turn.start' || draft.turnCommand.threadId !== draft.createdThreadId ||
      !draft.turnCommand.commandId || !draft.turnCommand.message?.messageId)) {
      throw new Error('新任务发送记录无效，已保留原草稿');
    }
    if (draft.createCommand !== undefined && draft.createCommand !== null) {
      const command = draft.createCommand;
      if (command.type !== 'thread.create' || !command.commandId || !command.threadId ||
        command.projectId !== draft.projectId ||
        (draft.createdThreadId !== '' && command.threadId !== draft.createdThreadId)) {
        throw new Error('新任务创建记录无效，已保留原草稿');
      }
    }
    return draft;
  }
  save(draft: NewTaskDraft): Promise<void> { return this.store.save(JSON.stringify(draft)); }
  clear(): Promise<void> { return this.store.save(''); }
}
