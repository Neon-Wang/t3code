import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import * as Linking from "expo-linking";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { environmentCatalog } from "../../connection/catalog";
import { environmentShell } from "../../state/shell";
import { tailnetNative } from "./native";
import { changedTaskNotification } from "./taskNotification";

const tasksAtom = Atom.make((get) => {
  return [...enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))].flatMap(
    (environmentId) => {
      const state = get(environmentShell.stateValueAtom(environmentId));
      if (state.status !== "live" || Option.isNone(state.snapshot)) return [];
      return state.snapshot.value.threads.map((thread) => ({ environmentId, thread }));
    },
  );
});
function subscribe(listener: () => void) {
  const subscription = tailnetNative?.addListener("onBackgroundChanged", listener);
  return () => subscription?.remove();
}

const enabled = () => tailnetNative?.backgroundEnabled() ?? false;

export function TailnetTaskNotifications() {
  return useSyncExternalStore(subscribe, enabled) ? <TaskObserver /> : null;
}

function TaskObserver() {
  const tasks = useAtomValue(tasksAtom);
  const previous = useRef(new Map<string, (typeof tasks)[number]["thread"]>());
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- sends task transitions to the native background notifier
  useEffect(() => {
    const next = new Map<string, (typeof tasks)[number]["thread"]>();
    for (const { environmentId, thread } of tasks) {
      const key = JSON.stringify([environmentId, thread.id]);
      const notification = changedTaskNotification(previous.current.get(key), thread);
      next.set(key, thread);
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
          .catch((error: unknown) => console.warn("Could not show task notification", error));
      }
    }
    previous.current = next;
  }, [tasks]);
  return null;
}
