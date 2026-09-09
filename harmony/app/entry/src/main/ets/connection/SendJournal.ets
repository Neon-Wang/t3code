import { DraftStore } from './DraftStore';
import { StartTurnCommand } from '../model/Models';

export class SendJournal {
  pending: StartTurnCommand | null = null;
  private store: DraftStore;
  private constructor(store: DraftStore) { this.store = store; }
  static async open(filesDir: string, environmentId: string, threadId: string): Promise<SendJournal> {
    const store = await DraftStore.open(filesDir, environmentId, `send:${threadId}`);
    const journal = new SendJournal(store);
    const raw = await store.load();
    if (raw) {
      const command = JSON.parse(raw) as StartTurnCommand;
      if (command.type !== 'thread.turn.start' || command.threadId !== threadId ||
        !command.commandId || !command.message?.messageId || command.message.role !== 'user' ||
        typeof command.message.text !== 'string' || !Array.isArray(command.message.attachments)) {
        throw new Error('待确认发送记录无效，请保留草稿');
      }
      journal.pending = command;
    }
    return journal;
  }
  async save(command: StartTurnCommand): Promise<void> {
    if (this.pending !== null) throw new Error('已有待确认发送，请先核对');
    await this.store.save(JSON.stringify(command));
    this.pending = command;
  }
  async clear(): Promise<void> {
    await this.store.save('');
    this.pending = null;
  }
}
