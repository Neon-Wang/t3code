import type { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { createRef, useEffect, useMemo, useRef } from "react";

import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

import { FileSaveCoordinator } from "./fileSaveCoordinator";
import { confirmProjectFileQueryData } from "./projectFilesQueryState";

const FILE_SAVE_DEBOUNCE_MS = 500;

interface FileSaveOptions {
  environmentId: EnvironmentId;
  cwd: string;
  relativePath: string;
  /**
   * The version the editor is based on. Sent with each save so a write that
   * would replace somebody else's — an agent editing the same file — is refused
   * instead of applied.
   */
  revisionToken: string | undefined;
  /** Absent on servers that predate revisions; saves then behave as before. */
  supportsRevisions: boolean;
  onPendingChange: (relativePath: string, pending: boolean) => void;
  onConflict: (relativePath: string) => void;
}

export function useFileSaveCoordinator({
  environmentId,
  cwd,
  relativePath,
  revisionToken,
  supportsRevisions,
  onPendingChange,
  onConflict,
}: FileSaveOptions): Pick<FileSaveCoordinator, "change"> & { overwrite: () => void } {
  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  // Each successful write produces a new version, so the base has to advance or
  // the next save would compare against the version read before this one and
  // refuse itself.
  const revisionRef = useRef<string | undefined>(revisionToken);
  if (revisionRef.current === undefined) {
    revisionRef.current = revisionToken;
  }
  // Overwriting is a one-shot decision, kept separately from the base version
  // rather than by clearing it: clearing would be undone by the very re-render
  // the user's click causes, and the retry would be refused again.
  const overwriteRef = useRef(false);
  // The coordinator owns the edit that has not been written yet, so it has to
  // survive an ordinary re-render. Callbacks reach it through a ref instead of
  // the memo dependencies below: a caller passing an inline arrow would
  // otherwise rebuild the coordinator on every render and drop that edit —
  // including the one the user is deciding whether to overwrite.
  const callbacksRef = useRef({ onPendingChange, onConflict });
  useEffect(() => {
    callbacksRef.current = { onPendingChange, onConflict };
  }, [onConflict, onPendingChange]);
  const session = useMemo(() => {
    const coordinatorRef = createRef<FileSaveCoordinator>();
    return {
      change: (contents: string) => coordinatorRef.current?.change(contents),
      overwrite: () => {
        overwriteRef.current = true;
        coordinatorRef.current?.retry();
      },
      setup: () => {
        const coordinator = new FileSaveCoordinator({
          debounceMs: FILE_SAVE_DEBOUNCE_MS,
          onPendingChange: (pending) => callbacksRef.current.onPendingChange(relativePath, pending),
          persist: async (nextContents) => {
            const overwriting = overwriteRef.current;
            overwriteRef.current = false;
            const expectedRevision =
              supportsRevisions && !overwriting ? revisionRef.current : undefined;
            const result = await writeFile({
              environmentId,
              input: {
                cwd,
                relativePath,
                contents: nextContents,
                ...(expectedRevision === undefined ? {} : { expectedRevision }),
              },
            });
            if (result._tag === "Success") {
              if (result.value?.conflict === true) {
                callbacksRef.current.onConflict(relativePath);
                // Reported as a failure so the save stays pending and the file
                // keeps reading as unsaved until the user decides.
                return AsyncResult.failure(
                  Cause.die(new Error(`${relativePath} changed on disk before this save.`)),
                );
              }
              revisionRef.current = result.value?.revisionToken;
            }
            return result;
          },
          onConfirmed: (confirmedContents) => {
            confirmProjectFileQueryData(environmentId, cwd, relativePath, confirmedContents);
          },
        });
        coordinatorRef.current = coordinator;
        return () => {
          coordinatorRef.current = null;
          coordinator.dispose();
        };
      },
    };
  }, [cwd, environmentId, relativePath, supportsRevisions, writeFile]);

  // StrictMode replays effect setup. Retired file sessions stay inert, while the
  // replay gets a fresh coordinator instead of reusing a disposed one.
  useEffect(session.setup, [session]);
  return session;
}
