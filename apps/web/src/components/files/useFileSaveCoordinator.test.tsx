import { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, StrictMode, useState } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { writeFile, confirmFile } = vi.hoisted(() => ({
  writeFile: vi.fn(),
  confirmFile: vi.fn(),
}));
vi.mock("~/state/projects", () => ({ projectEnvironment: { writeFile: {} } }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => writeFile }));
vi.mock("./projectFilesQueryState", () => ({ confirmProjectFileQueryData: confirmFile }));

import { setMarkdownTaskChecked } from "./filePreviewMode";
import { useFileSaveCoordinator } from "./useFileSaveCoordinator";

const environmentId = EnvironmentId.make("save-lifecycle-audit");
const onPendingChange = vi.fn();
const onConflict = vi.fn();
const defaultProps = {
  environmentId,
  cwd: "/workspace",
  relativePath: "file.txt",
  revisionToken: undefined as string | undefined,
  supportsRevisions: false,
  onPendingChange,
  onConflict,
};
let renderer: ReactTestRenderer | null;

function ChangeSource(_props: {
  onChange: (contents: string) => void;
  onOverwrite?: () => void;
  conflicted?: boolean;
}) {
  return null;
}

function FileSurface(props: Parameters<typeof useFileSaveCoordinator>[0]) {
  const coordinator = useFileSaveCoordinator(props);
  return (
    <ChangeSource
      onChange={(contents) => coordinator.change(contents)}
      onOverwrite={() => coordinator.overwrite()}
    />
  );
}

// The panel re-renders on the state change the conflict itself causes, and its
// callbacks are inline. This is the shape that has to keep working.
function ConflictSurface(props: Parameters<typeof useFileSaveCoordinator>[0]) {
  const [conflicted, setConflicted] = useState(false);
  const coordinator = useFileSaveCoordinator({
    ...props,
    onPendingChange: (path, pending) => onPendingChange(path, pending),
    onConflict: (path) => {
      onConflict(path);
      setConflicted(true);
    },
  });
  return (
    <ChangeSource
      conflicted={conflicted}
      onChange={(contents) => coordinator.change(contents)}
      onOverwrite={() => {
        // Dismissing the notice re-renders the surface, exactly as the panel does.
        setConflicted(false);
        coordinator.overwrite();
      }}
    />
  );
}

function mount(props = defaultProps) {
  act(() => {
    renderer = create(
      <StrictMode>
        <FileSurface {...props} />
      </StrictMode>,
    );
  });
}

function changeHandler(): (contents: string) => void {
  return renderer!.root.findByType(ChangeSource).props.onChange;
}

beforeEach(() => {
  renderer = null;
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  writeFile.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  confirmFile.mockReset();
  onPendingChange.mockReset();
  onConflict.mockReset();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("file-save React lifecycle", () => {
  it("persists editor model changes after StrictMode setup replay", async () => {
    mount();
    changeHandler()("AUDIT7907NATIVE\n");
    expect(onPendingChange).toHaveBeenCalledWith("file.txt", true);
    await vi.advanceTimersByTimeAsync(500);
    expect(writeFile).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { cwd: "/workspace", relativePath: "file.txt", contents: "AUDIT7907NATIVE\n" },
    });
    expect(confirmFile).toHaveBeenCalledExactlyOnceWith(
      environmentId,
      "/workspace",
      "file.txt",
      "AUDIT7907NATIVE\n",
    );
    expect(onPendingChange).toHaveBeenLastCalledWith("file.txt", false);
  });

  it("persists rendered Markdown task changes after StrictMode setup replay", async () => {
    mount({ ...defaultProps, relativePath: "README.md" });
    const nextContents = setMarkdownTaskChecked("- [ ] task\n", 2, true);
    changeHandler()(nextContents);
    await vi.advanceTimersByTimeAsync(500);
    expect(writeFile).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: { cwd: "/workspace", relativePath: "README.md", contents: "- [x] task\n" },
    });
  });

  it("keeps the debounce across rerenders of the same file", async () => {
    mount();
    changeHandler()("first");
    await vi.advanceTimersByTimeAsync(300);
    act(() =>
      renderer!.update(
        <StrictMode>
          <FileSurface {...defaultProps} />
        </StrictMode>,
      ),
    );
    changeHandler()("latest");
    await vi.advanceTimersByTimeAsync(499);
    expect(writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]![0].input.contents).toBe("latest");
  });

  it("flushes on unmount and ignores a retired editor callback", async () => {
    mount();
    const retiredChange = changeHandler();
    retiredChange("pending edit");
    await act(async () => renderer!.unmount());
    renderer = null;
    retiredChange("stale editor contents");
    await vi.runAllTimersAsync();
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]![0].input.contents).toBe("pending edit");
  });

  it.each([
    { relativePath: "other.txt" },
    { cwd: "/other-workspace" },
    { environmentId: EnvironmentId.make("other-environment") },
  ])("retires callbacks when the file identity changes: %j", async (change) => {
    mount();
    const retiredChange = changeHandler();
    retiredChange("old file edit");
    const nextProps = { ...defaultProps, ...change };
    act(() =>
      renderer!.update(
        <StrictMode>
          <FileSurface {...nextProps} />
        </StrictMode>,
      ),
    );
    retiredChange("stale editor contents");
    changeHandler()("new file edit");
    await vi.runAllTimersAsync();
    expect(writeFile.mock.calls.map(([request]) => request)).toEqual([
      {
        environmentId,
        input: { cwd: "/workspace", relativePath: "file.txt", contents: "old file edit" },
      },
      {
        environmentId: nextProps.environmentId,
        input: {
          cwd: nextProps.cwd,
          relativePath: nextProps.relativePath,
          contents: "new file edit",
        },
      },
    ]);
  });

  it("does not reactivate a retired callback when the same file mounts again", async () => {
    mount();
    const retiredChange = changeHandler();
    await act(async () => renderer!.unmount());
    renderer = null;
    mount();
    retiredChange("stale contents");
    changeHandler()("current contents");
    await vi.runAllTimersAsync();
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]![0].input.contents).toBe("current contents");
  });
});

/**
 * The write-conflict path: a save refused because the file changed underneath
 * it must not read as saved, and the user's override has to be able to win.
 */
describe("file-save conflicts", () => {
  it("keeps the file pending and reports a refused save", async () => {
    writeFile.mockResolvedValue(AsyncResult.success({ relativePath: "file.txt", conflict: true }));
    mount({ ...defaultProps, supportsRevisions: true, revisionToken: "1:1" });

    changeHandler()("user edit");
    await vi.runAllTimersAsync();

    expect(writeFile.mock.calls[0]![0].input.expectedRevision).toBe("1:1");
    expect(onConflict).toHaveBeenCalledWith("file.txt");
    expect(onPendingChange).not.toHaveBeenCalledWith("file.txt", false);
  });

  // The refused edit is still only in the editor, so the retry has to reuse the
  // coordinator that holds it rather than a replacement built by the re-render
  // the conflict caused.
  it("writes the refused edit when the user chooses to overwrite", async () => {
    writeFile.mockResolvedValue(AsyncResult.success({ relativePath: "file.txt", conflict: true }));
    act(() => {
      renderer = create(
        <StrictMode>
          <ConflictSurface {...defaultProps} supportsRevisions revisionToken="1:1" />
        </StrictMode>,
      );
    });

    changeHandler()("user edit");
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(renderer!.root.findByType(ChangeSource).props.conflicted).toBe(true);

    writeFile.mockResolvedValue(
      AsyncResult.success({ relativePath: "file.txt", revisionToken: "2:2" }),
    );
    act(() => renderer!.root.findByType(ChangeSource).props.onOverwrite());
    await vi.runAllTimersAsync();

    const lastCall = writeFile.mock.calls.at(-1)![0];
    expect(lastCall.input.contents).toBe("user edit");
    // Overwriting means writing regardless of what is on disk now.
    expect(lastCall.input.expectedRevision).toBeUndefined();
    expect(onPendingChange).toHaveBeenCalledWith("file.txt", false);
  });

  it("does not send a base version to a server without the check", async () => {
    writeFile.mockResolvedValue(
      AsyncResult.success({ relativePath: "file.txt", revisionToken: "2:2" }),
    );
    mount({ ...defaultProps, supportsRevisions: false, revisionToken: "1:1" });

    changeHandler()("user edit");
    await vi.runAllTimersAsync();

    expect(writeFile.mock.calls[0]![0].input.expectedRevision).toBeUndefined();
    expect(onConflict).not.toHaveBeenCalled();
  });
});
