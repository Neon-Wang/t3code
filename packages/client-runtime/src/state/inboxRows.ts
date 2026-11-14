import { scopeThreadRef, scopedThreadKey } from "../environment/index.ts";
import {
  ThreadId,
  type EnvironmentId,
  type InboxItem,
  type InboxSnapshot,
} from "@t3tools/contracts";

export interface InboxRowsEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly snapshot: InboxSnapshot | null;
}

export type InboxRow<E extends InboxRowsEnvironment> =
  | { readonly kind: "urgent-header"; readonly key: string }
  | { readonly kind: "environment"; readonly key: string; readonly environment: E }
  | { readonly kind: "project"; readonly key: string; readonly title: string }
  | { readonly kind: "thread"; readonly key: string; readonly title: string }
  | {
      readonly kind: "question";
      readonly key: string;
      readonly environmentId: EnvironmentId;
      /** Set on urgent cards when several environments are connected. */
      readonly environmentLabel: string | null;
      readonly item: InboxItem;
      /** Urgent cards sit outside their project group, so they name their thread. */
      readonly showThread: boolean;
    };

const sortTime = (item: InboxItem) => Date.parse(item.urgentAt ?? "") || Date.parse(item.createdAt);

/**
 * Lays the inbox out as one flat list: urgent questions from every environment first, latest
 * escalation first, then each environment's other questions under project and thread headings.
 * A question keeps its key wherever it appears, so escalating it mid-answer keeps the draft.
 */
export function inboxRows<E extends InboxRowsEnvironment>(
  environments: ReadonlyArray<E>,
): Array<InboxRow<E>> {
  const showEnvironment = environments.length > 1;
  const question = (environment: E, item: InboxItem, showThread: boolean): InboxRow<E> => ({
    kind: "question",
    key: `question:${environment.environmentId}:${item.id}`,
    environmentId: environment.environmentId,
    environmentLabel: showThread && showEnvironment ? environment.label : null,
    item,
    showThread,
  });
  const urgent = environments
    .flatMap((environment) =>
      (environment.snapshot?.items ?? [])
        .filter((item) => item.urgent)
        .map((item) => ({ environment, item })),
    )
    .sort((a, b) => sortTime(b.item) - sortTime(a.item));
  const rows: Array<InboxRow<E>> = [];
  if (urgent.length > 0) rows.push({ kind: "urgent-header", key: "urgent" });
  for (const { environment, item } of urgent) rows.push(question(environment, item, true));
  for (const environment of environments) {
    const id = environment.environmentId;
    rows.push({ kind: "environment", key: `environment:${id}`, environment });
    const projects = new Map<string, InboxItem[]>();
    for (const item of environment.snapshot?.items ?? []) {
      if (item.urgent) continue;
      const key = item.thread?.projectId ?? "";
      projects.set(key, [...(projects.get(key) ?? []), item]);
    }
    for (const [projectId, items] of projects) {
      rows.push({
        kind: "project",
        key: `project:${id}:${projectId}`,
        title: items[0]?.thread?.projectTitle ?? "",
      });
      const threads = new Map<string, InboxItem[]>();
      for (const item of items) {
        const key = item.thread?.id ?? "";
        threads.set(key, [...(threads.get(key) ?? []), item]);
      }
      for (const [threadId, questions] of threads) {
        if (threadId) {
          rows.push({
            kind: "thread",
            key: `thread:${id}:${threadId}`,
            title: questions[0]?.thread?.title ?? "",
          });
        }
        for (const item of questions) rows.push(question(environment, item, false));
      }
    }
  }
  return rows;
}

/** Groups pending questions by their environment-scoped thread. */
export function inboxByThread(environments: ReadonlyArray<InboxRowsEnvironment>) {
  const byThread = new Map<string, InboxItem[]>();
  for (const env of environments) {
    for (const item of env.snapshot?.items ?? []) {
      if (item.threadId === null) continue;
      const key = scopedThreadKey(scopeThreadRef(env.environmentId, ThreadId.make(item.threadId)));
      const items = byThread.get(key);
      if (items) items.push(item);
      else byThread.set(key, [item]);
    }
  }
  return byThread;
}
