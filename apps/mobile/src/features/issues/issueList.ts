import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import type { IssueListControls } from "../../persistence/mobile-preferences";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";

export const DEFAULT_ISSUE_LIST_CONTROLS: IssueListControls = {
  environmentId: null,
  projectId: null,
  state: "open",
  involvement: "all",
  labels: [],
  author: null,
  sort: "updated",
};
export function useIssueListControls() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom);
  const controls =
    (AsyncResult.isSuccess(preferences) ? preferences.value.issueListFilters : undefined) ??
    DEFAULT_ISSUE_LIST_CONTROLS;
  return [controls, (issueListFilters: IssueListControls) => save({ issueListFilters })] as const;
}
