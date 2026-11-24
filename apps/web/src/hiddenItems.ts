import { EnvironmentId, KeybindingShortcut } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  readLocalStorageValue,
  useLocalStorage,
  writeLocalStorageValue,
} from "./hooks/useLocalStorage";

const HiddenItem = Schema.Struct({
  kind: Schema.Literals(["project", "thread"]),
  ref: Schema.Tuple([EnvironmentId, Schema.String]),
  title: Schema.String,
  hiddenAt: Schema.String,
});
type HiddenItem = typeof HiddenItem.Type;
const Items = Schema.Array(HiddenItem);
const EMPTY: typeof Items.Type = [];
const KEY = "t3.hiddenItems";
const keyOf = (environmentId: EnvironmentId, id: string) => JSON.stringify([environmentId, id]);

export function hideItems(
  kind: HiddenItem["kind"],
  rows: readonly { environmentId: EnvironmentId; id: string; title: string }[],
) {
  const hiddenAt = new Date().toISOString();
  writeLocalStorageValue(
    KEY,
    (items) => {
      const existing = new Set(
        items.filter((item) => item.kind === kind).map((item) => keyOf(...item.ref)),
      );
      return [
        ...items,
        ...rows
          .filter((row) => !existing.has(keyOf(row.environmentId, row.id)))
          .map((row): HiddenItem => ({
            kind,
            ref: [row.environmentId, row.id],
            title: row.title,
            hiddenAt,
          })),
      ];
    },
    EMPTY,
    Items,
  );
}

export function unhideItem(row: HiddenItem) {
  writeLocalStorageValue(
    KEY,
    (items) =>
      items.filter(
        (item) =>
          item.kind !== row.kind || item.ref[0] !== row.ref[0] || item.ref[1] !== row.ref[1],
      ),
    EMPTY,
    Items,
  );
}

export function useHiddenItems() {
  const [items, setItems] = useLocalStorage(KEY, EMPTY, Items);
  const projects = new Map(
    items.filter((item) => item.kind === "project").map((item) => [keyOf(...item.ref), item]),
  );
  const threads = new Map(
    items.filter((item) => item.kind === "thread").map((item) => [keyOf(...item.ref), item]),
  );
  const visibleThread = (thread: { environmentId: EnvironmentId; id: string; projectId: string }) =>
    (threads.size === 0 || !threads.has(keyOf(thread.environmentId, thread.id))) &&
    (projects.size === 0 || !projects.has(keyOf(thread.environmentId, thread.projectId)));
  return {
    items,
    hasHiddenProjects: projects.size > 0,
    visibleThread,
    clear: () => setItems(EMPTY),
    hiddenProject: (environmentId: EnvironmentId, id: string) =>
      projects.get(keyOf(environmentId, id)),
    hiddenThread: (environmentId: EnvironmentId, id: string) =>
      threads.get(keyOf(environmentId, id)),
  };
}

const SHORTCUT_KEY = "t3.hiddenItems.shortcut";
const Shortcut = Schema.NullOr(KeybindingShortcut);
export const useHideShortcut = () => useLocalStorage(SHORTCUT_KEY, null, Shortcut);
export const readHideShortcut = () => readLocalStorageValue(SHORTCUT_KEY, null, Shortcut);
