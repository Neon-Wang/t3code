import { inboxByThread } from "@t3tools/client-runtime/state/inbox-rows";
import { arrayElementsEqual } from "@t3tools/client-runtime/state/entities";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type InboxSnapshot,
  type InboxItem,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { environmentPresentations } from "./presentation";
import { serverEnvironment } from "./server";
import { environmentSession, sessionHasScope } from "./session";

export interface EnvironmentInbox {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly snapshot: InboxSnapshot | null;
  readonly pending: boolean;
  readonly failed: boolean;
}

const inboxEnvironmentsAtom = Atom.make((get): readonly EnvironmentInbox[] => {
  const environments: EnvironmentInbox[] = [];
  for (const [environmentId, presentation] of get(environmentPresentations.presentationsAtom)) {
    if (presentation.connection.phase !== "connected") continue;
    if (
      !sessionHasScope(
        get(environmentSession.sessionStateAtom(environmentId)),
        AuthOrchestrationReadScope,
      )
    )
      continue;
    const result = get(serverEnvironment.inboxLive({ environmentId, input: {} }));
    environments.push({
      environmentId,
      label: presentation.entry.target.label,
      snapshot: AsyncResult.getOrElse(result, () => null),
      pending: result.waiting,
      failed: result._tag === "Failure",
    });
  }
  return environments;
}).pipe(Atom.withLabel("inbox:environments"));
const inboxCountAtom = Atom.make((get) =>
  get(inboxEnvironmentsAtom).reduce((sum, env) => sum + (env.snapshot?.items.length ?? 0), 0),
);
// Questions grouped by the thread that asked them, for the sidebar rows and the thread details card.
const inboxByThreadAtom = Atom.make((get) => inboxByThread(get(inboxEnvironmentsAtom))).pipe(
  Atom.withLabel("inbox:by-thread"),
);
const NO_ITEMS: ReadonlyArray<InboxItem> = [];
// Threads without questions share one empty list, so an inbox refresh leaves their rows alone.
const threadInboxAtom = Atom.family((key: string) => {
  let previous = NO_ITEMS;
  return Atom.make((get) => {
    const next = get(inboxByThreadAtom).get(key) ?? NO_ITEMS;
    if (arrayElementsEqual(previous, next)) return previous;
    previous = next;
    return next;
  });
});
export function useThreadInbox(threadRef: ScopedThreadRef): ReadonlyArray<InboxItem> {
  return useAtomValue(threadInboxAtom(scopedThreadKey(threadRef)));
}
export function useInboxEnvironments() {
  return useAtomValue(inboxEnvironmentsAtom);
}
export function useInboxCount() {
  return useAtomValue(inboxCountAtom);
}
