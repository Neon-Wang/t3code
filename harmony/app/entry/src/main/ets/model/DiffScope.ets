export interface DiffCheckpoint { checkpointTurnCount: number; status: string; }
export interface DiffScope { id: string; value: string; turnCount: number; }
interface DiffPayload { threadId: string; toTurnCount: number; fromTurnCount?: number; ignoreWhitespace: boolean; }
interface DiffQuery { method: string; payload: DiffPayload; }

export function diffScopes(checkpoints: DiffCheckpoint[]): DiffScope[] {
  const ready = checkpoints.filter((item: DiffCheckpoint) => item.status === 'ready')
    .sort((a: DiffCheckpoint, b: DiffCheckpoint) => b.checkpointTurnCount - a.checkpointTurnCount);
  const scopes: DiffScope[] = [];
  if (ready.length > 0) {
    scopes.push({ id: 'all', value: '任务全部变更', turnCount: ready[0].checkpointTurnCount });
    for (const item of ready) {
      scopes.push({ id: `turn:${item.checkpointTurnCount}`, value: `第 ${item.checkpointTurnCount} 轮变更`, turnCount: item.checkpointTurnCount });
    }
  }
  scopes.push({ id: 'workspace', value: '工作区变更', turnCount: 0 });
  return scopes;
}

export function checkpointRequest(threadId: string, turnCount: number, cumulative: boolean): DiffQuery {
  const payload: DiffPayload = { threadId: threadId, toTurnCount: turnCount, ignoreWhitespace: false };
  if (!cumulative && turnCount > 1) {
    payload.fromTurnCount = turnCount - 1;
    return { method: 'orchestration.getTurnDiff', payload: payload };
  }
  return { method: 'orchestration.getFullThreadDiff', payload: payload };
}
