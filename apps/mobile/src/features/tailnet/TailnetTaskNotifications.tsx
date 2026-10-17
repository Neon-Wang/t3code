import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import * as Linking from "expo-linking";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useEffect, useRef } from "react";
import { environmentCatalog } from "../../connection/catalog";
import { environmentShell } from "../../state/shell";
import { tailnetNative } from "./native";
import { changedTaskNotification } from "./taskNotification";

const tasksAtom = Atom.make((get) => {
  if (!tailnetNative) return [];
  return [...enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))].flatMap(
    (environmentId) => {
      const state = get(environmentShell.stateValueAtom(environmentId));
      if (state.status !== "live" || Option.isNone(state.snapshot)) return [];
      return state.snapshot.value.threads.map((thread) => ({ environmentId, thread }));
    },
  );
});
export function TailnetTaskNotifications() {
  const tasks = useAtomValue(tasksAtom);
  const previous = useRef(new Map<string, (typeof tasks)[number]["thread"]>());
  useEffect(() => {
    for (const { environmentId, thread } of tasks) {
      const key = JSON.stringify([environmentId, thread.id]);
      const notification = changedTaskNotification(previous.current.get(key), thread);
      previous.current.set(key, thread);
      if (notification) {
        void tailnetNative
          ?.notifyCritical(
            `${key}:${notification.id}`,
            thread.title,
            notification.message,
            Linking.createURL(
              `/threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(thread.id)}`,
            ),
          )
          .catch(() => undefined);
      }
    }
    // A bounded in-process baseline is enough; the native notifier persists deduplication.
    if (previous.current.size > 5000) {
      const current = new Set(
        tasks.map(({ environmentId, thread }) => JSON.stringify([environmentId, thread.id])),
      );
      for (const key of previous.current.keys())
        if (!current.has(key)) previous.current.delete(key);
    }
  }, [tasks]);
  return null;
}
