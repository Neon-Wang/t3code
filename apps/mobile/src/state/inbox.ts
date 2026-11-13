import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type InboxSnapshot,
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
export function useInboxEnvironments() {
  return useAtomValue(inboxEnvironmentsAtom);
}
export function useInboxCount() {
  return useAtomValue(inboxCountAtom);
}
