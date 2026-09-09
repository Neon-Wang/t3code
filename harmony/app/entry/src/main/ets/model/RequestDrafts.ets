import { AnswerDraft } from './Models';

/** Keep pending answers across page navigation for the current app session. */
export class RequestDrafts {
  private static threads: Map<string, Map<string, AnswerDraft[]>> = new Map();

  static read(environmentId: string, threadId: string, requestId: string): AnswerDraft[] {
    return RequestDrafts.threads.get(JSON.stringify([environmentId, threadId]))?.get(requestId) ?? [];
  }

  static save(environmentId: string, threadId: string, requestId: string, drafts: AnswerDraft[]): void {
    const key = JSON.stringify([environmentId, threadId]);
    const requests = RequestDrafts.threads.get(key) ?? new Map<string, AnswerDraft[]>();
    requests.set(requestId, drafts);
    RequestDrafts.threads.set(key, requests);
  }

  static retain(environmentId: string, threadId: string, requestIds: string[]): void {
    const key = JSON.stringify([environmentId, threadId]);
    const requests = RequestDrafts.threads.get(key);
    if (requests === undefined) return;
    requests.forEach((_drafts: AnswerDraft[], requestId: string) => {
      if (!requestIds.includes(requestId)) requests.delete(requestId);
    });
    if (requests.size === 0) RequestDrafts.threads.delete(key);
  }
}
