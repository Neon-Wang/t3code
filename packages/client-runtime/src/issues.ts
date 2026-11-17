import type {
  EnvironmentId,
  IssueActivity,
  IssueListEntry,
  IssueListResult,
  RemoteIssueRef,
} from "@t3tools/contracts";

export type EnvironmentIssueEntry = IssueListEntry & { readonly environmentId: EnvironmentId };

export const issueKey = (reference: RemoteIssueRef) =>
  JSON.stringify([
    reference.host.toLowerCase(),
    reference.repository.toLowerCase(),
    reference.number,
  ]);

export const environmentIssueKey = (entry: EnvironmentIssueEntry) =>
  JSON.stringify([entry.environmentId, entry.projectId, issueKey(entry)]);

export function mergeIssueLists(pages: ReadonlyArray<readonly [EnvironmentId, IssueListResult]>) {
  const entries = new Map<string, EnvironmentIssueEntry>();
  for (const [environmentId, page] of pages) {
    for (const entry of page.entries) {
      const scoped = { ...entry, environmentId };
      const key = environmentIssueKey(scoped);
      const previous = entries.get(key);
      if (!previous || entry.updatedAt >= previous.updatedAt) entries.set(key, scoped);
    }
  }
  return [...entries.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function groupIssues(
  entries: readonly EnvironmentIssueEntry[],
  grouping: "repository" | "state" | "none",
) {
  const groups = new Map<string, EnvironmentIssueEntry[]>();
  for (const entry of entries) {
    const key =
      grouping === "none"
        ? ""
        : grouping === "state"
          ? entry.state
          : `${entry.host}/${entry.repository}`;
    const values = groups.get(key) ?? [];
    values.push(entry);
    groups.set(key, values);
  }
  return [...groups].map(([key, entries]) => ({ key, entries }));
}

export function issueTimeline(pages: readonly IssueActivity[]) {
  const items = new Map<
    string,
    | { kind: "comment"; id: string; at: string; comment: IssueActivity["comments"][number] }
    | { kind: "event"; id: string; at: string; event: IssueActivity["events"][number] }
  >();
  for (const page of pages) {
    for (const comment of page.comments)
      items.set(comment.id, { kind: "comment", id: comment.id, at: comment.createdAt, comment });
    for (const event of page.events)
      items.set(event.id, { kind: "event", id: event.id, at: event.createdAt, event });
  }
  return [...items.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** GitHub issue URLs and short references resolve against the thread's own repository. */
export function parseIssueLink(
  value: string,
  own?: { host: string; repository: string } | null,
): (RemoteIssueRef & { url: string }) | null {
  const short = /^#?([1-9]\d*)$/.exec(value.trim());
  if (short && own) {
    const number = Number(short[1]);
    if (!Number.isSafeInteger(number)) return null;
    return { ...own, number, url: `https://${own.host}/${own.repository}/issues/${number}` };
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const match = /^\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)\/?$/.exec(url.pathname);
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number)) return null;
  return {
    host: url.host.toLowerCase(),
    repository: match[1]!,
    number,
    url: `${url.origin}/${match[1]}/issues/${number}`,
  };
}
