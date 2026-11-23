import {
  UsageReadError,
  type ProjectId,
  type ThreadId,
  type UsageThreadCost,
} from "@t3tools/contracts";
import { totalTokens, type UsageRecord } from "@t3tools/provider-core/server/usage";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";

const nativeDrivers = new Map<UsageRecord["provider"], string>([
  ["codex", "codex"],
  ["claude", "claudeAgent"],
  ["opencode", "opencode"],
  ["grok", "grok"],
  ["muse", "muse"],
]);
interface ThreadRow {
  id: ThreadId;
  title: string;
  projectId: ProjectId;
  projectTitle: string;
  deleted: number;
  parentId: ThreadId | null;
  driver: string | null;
  nativeId: string | null;
}

export const readUsageThreads = (sql: SqlClient.SqlClient) =>
  sql<ThreadRow>`
  SELECT t.thread_id AS id, t.title, t.project_id AS projectId, p.title AS projectTitle,
    t.deleted_at IS NOT NULL AS deleted,
    CASE WHEN json_extract(t.payload_json, '$.lineage.relationshipToParent') = 'subagent'
      THEN json_extract(t.payload_json, '$.lineage.parentThreadId') END AS parentId,
    n.driver, json_extract(n.payload_json, '$.nativeThreadRef.nativeId') AS nativeId
  FROM orchestration_v2_projection_threads t
  JOIN projection_projects p ON p.project_id = t.project_id
  LEFT JOIN orchestration_v2_projection_provider_threads n ON n.thread_id = t.thread_id
    AND json_extract(n.payload_json, '$.nativeThreadRef.strength') = 'strong'
`.pipe(
    Effect.mapError(
      (cause) =>
        new UsageReadError({
          reason: "scanFailed",
          detail: "Could not read thread ownership.",
          cause,
        }),
    ),
  );

export function threadAttribution(
  threads: readonly ThreadRow[],
  parents: ReadonlyMap<string, string>,
  requested?: ThreadId,
) {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const bySession = new Map<string, ThreadRow | null>();
  for (const thread of threads) {
    if (!thread.nativeId) continue;
    const key = `${thread.driver}\0${thread.nativeId}`;
    const previous = bySession.get(key);
    bySession.set(key, previous === undefined || previous?.id === thread.id ? thread : null);
  }
  const rows = new Map<
    string,
    UsageThreadCost & { costUsd: number; tokens: number; hasPrice: boolean }
  >();
  const sessions = new Map<
    string,
    Omit<UsageThreadCost, "costUsd" | "tokens" | "hasPrice"> | null
  >();
  function resolve(record: UsageRecord, sourcePath: string) {
    const driver = nativeDrivers.get(record.provider);
    let session = record.sessionId;
    let agent = record.agentId ?? null;
    const visited = new Set<string>();
    let owner = bySession.get(`${driver}\0${session}`);
    while (record.provider === "codex" && parents.has(session) && !visited.has(session)) {
      visited.add(session);
      agent ??= record.sessionId;
      if (owner !== undefined) break;
      session = parents.get(session)!;
      owner = bySession.get(`${driver}\0${session}`);
    }
    const lineage: Array<UsageThreadCost["lineage"][number]> = [];
    let thread = owner;
    while (thread && !lineage.some((node) => node.id === thread!.id)) {
      lineage.unshift({ id: thread.id, title: thread.title, deleted: !!thread.deleted });
      thread = thread.parentId ? byId.get(thread.parentId) : undefined;
    }
    if (requested && !lineage.some((t) => t.id === requested)) return null;
    return {
      provider: record.provider,
      sourcePath,
      projectId: owner?.projectId ?? null,
      projectTitle: owner?.projectTitle ?? "",
      lineage,
      agent,
      unmappable: driver === undefined || owner === null || !session,
    };
  }
  function groupFor(record: UsageRecord, source: string) {
    const key = `${source}\0${record.provider}\0${record.sessionId}\0${record.agentId ?? ""}`;
    let group = sessions.get(key);
    if (group === undefined) {
      group = resolve(record, source);
      sessions.set(key, group);
    }
    return group;
  }
  return {
    includes: (record: UsageRecord, source: string) => groupFor(record, source) !== null,
    add(record: UsageRecord, source: string, costUsd: number, hasPrice: boolean) {
      const group = groupFor(record, source);
      if (!group) return;
      const rowKey = `${source}\0${group.provider}\0${group.lineage.at(-1)?.id ?? group.unmappable}\0${group.agent ?? ""}`;
      let row = rows.get(rowKey);
      if (!row) {
        row = { ...group, costUsd: 0, tokens: 0, hasPrice: false };
        rows.set(rowKey, row);
      }
      row.hasPrice ||= hasPrice;
      row.costUsd += costUsd;
      row.tokens += totalTokens(record.totals);
    },
    rows: () => [...rows.values()],
  };
}
