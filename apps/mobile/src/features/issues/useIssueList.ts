import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { mergeIssueLists } from "@t3tools/client-runtime/issues";
import { executeAtomQuery, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, IssueListInput, IssueListResult } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { use, useRef, useState } from "react";
import { issueEnvironment } from "../../state/issues";

type Target = { environmentId: EnvironmentId; input: IssueListInput };
const sources = Atom.family((key: string) => {
  const targets: Target[] = JSON.parse(key);
  return Atom.make((get) =>
    targets.map((target) => ({ target, result: get(issueEnvironment.list(target)) })),
  );
});
export function useIssueList(targets: Target[]) {
  const registry = use(RegistryContext);
  const key = JSON.stringify(targets);
  const heads = useAtomValue(sources(key));
  const [pages, setPages] = useState<{
    heads: typeof heads;
    values: [EnvironmentId, IssueListResult][];
  }>({ heads, values: [] });
  if (pages.heads !== heads) setPages({ heads, values: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const values: [EnvironmentId, IssueListResult][] = heads.flatMap(({ target, result }) => {
    const value = AsyncResult.getOrElse(result, () => null);
    return value ? [[target.environmentId, value] as [EnvironmentId, IssueListResult]] : [];
  });
  const all = [...values, ...(pages.heads === heads ? pages.values : [])];
  const next = targets.flatMap((target) => {
    const value = all.findLast(([id]) => id === target.environmentId)?.[1];
    return value && Object.keys(value.nextCursors).length
      ? [
          {
            ...target,
            input: {
              ...target.input,
              cursors: value.nextCursors,
              projectIds: [
                ...new Set(
                  all.flatMap(([id, page]) =>
                    id === target.environmentId
                      ? page.entries
                          .filter(
                            (entry) =>
                              value.nextCursors[`${entry.host}/${entry.repository.toLowerCase()}`],
                          )
                          .map((entry) => entry.projectId)
                      : [],
                  ),
                ),
              ],
            },
          },
        ]
      : [];
  });
  const loadMore = async () => {
    if (inFlight.current || !next.length) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const results = await Promise.allSettled(
      next.map(async (target) => {
        const result = await executeAtomQuery(registry, issueEnvironment.list(target), {
          reportFailure: false,
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        return [target.environmentId, result.value] as [EnvironmentId, IssueListResult];
      }),
    );
    setPages((current) =>
      current.heads === heads
        ? {
            ...current,
            values: [
              ...current.values,
              ...results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
            ],
          }
        : current,
    );
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") setError(String(failed.reason));
    inFlight.current = false;
    setBusy(false);
  };
  return {
    entries: mergeIssueLists(all),
    busy,
    loadMore,
    hasMore: next.length > 0,
    pending: heads.some(({ result }) => result.waiting),
    errors: [
      ...heads.flatMap(({ result }) =>
        AsyncResult.isFailure(result) ? [String(squashAtomCommandFailure(result))] : [],
      ),
      ...all.flatMap(([, v]) => v.errors.map((e) => `${e.projectTitle}: ${e.message}`)),
      ...(error ? [error] : []),
    ],
    refresh: () => {
      setError(null);
      targets.forEach((target) => registry.refresh(issueEnvironment.list(target)));
    },
  };
}
