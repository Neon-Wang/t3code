import { Atom, AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import * as Cause from "effect/Cause";
import {
  createEnvironmentThreadStateAtoms,
  createEnvironmentThreadDetailAtoms,
} from "@t3tools/client-runtime/state/threads";
import { createThreadVisitTracker } from "@t3tools/client-runtime/state/thread-visits";
import { AuthOrchestrationOperateScope, sessionGrantsScope } from "@t3tools/contracts";
import { localeAtom, translate } from "./locale.js";

export function createThreadDetails({ runtime, registry, lists, catalog, session }) {
  const states = createEnvironmentThreadStateAtoms(runtime);
  const details = createEnvironmentThreadDetailAtoms(states.stateAtom);
  const visits = createThreadVisitTracker({
    threadShellAtom: lists.threads.threadShellAtom,
    visit: lists.commands.visit,
  });
  const subscriptions = new Set();
  return {
    subscribe(ref, listener) {
      const view = Atom.make((get) => {
        get(localeAtom);
        const result = get(states.stateAtom(ref.environmentId, ref.threadId));
        if (AsyncResult.isFailure(result)) {
          console.error(
            `Harmony thread subscription: ${Cause.pretty(result.cause)
              .replace(/(?:https?|wss?):\/\/\S+/g, "[URL]")
              .replace(/eyJ[\w.-]+/g, "[REDACTED]")}`,
          );
        }
        const state = get(details.stateAtom(ref));
        const projection = Option.getOrNull(state.data);
        const environment = get(catalog.catalogValueAtom).entries.get(ref.environmentId);
        const snapshot = get(lists.commands.snapshotAtom(ref.environmentId));
        const project = snapshot?.projects.find((row) => row.id === projection?.thread.projectId);
        const auth = get(session.sessionStateAtom(ref.environmentId));
        const grant = AsyncResult.getOrElse(auth, () => null);
        const writable =
          auth._tag !== "Failure" &&
          grant !== null &&
          sessionGrantsScope(grant, AuthOrchestrationOperateScope);
        if (writable) get.mount(visits(ref));
        return {
          title: projection?.thread.title ?? translate("inbox.untitledThread"),
          project: project?.title ?? "",
          environment: environment?.target.label ?? "",
          status: state.status,
          error: AsyncResult.isFailure(result)
            ? translate("mobile.connectionTone.connectionFailed")
            : (Option.getOrNull(state.error) ?? ""),
        };
      });
      const release = registry.subscribe(view, (value) => listener(JSON.stringify(value)), {
        immediate: true,
      });
      const unsubscribe = () => {
        release();
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
    dispose() {
      for (const unsubscribe of subscriptions) unsubscribe();
    },
  };
}
