import type { EnvironmentId } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { useHiddenItems, unhideItem } from "../../hiddenItems";
import { Button } from "../ui/button";

export function HiddenThreadNotice({
  thread,
}: {
  thread: { environmentId: EnvironmentId; projectId: string; id: string };
}) {
  const gt = useGT();
  const hidden = useHiddenItems();
  const project = hidden.hiddenProject(thread.environmentId, thread.projectId);
  const item = hidden.hiddenThread(thread.environmentId, thread.id);
  const hiddenItem = project ?? item;
  if (!hiddenItem) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 border-b bg-muted/40 px-3 text-xs text-muted-foreground">
      {project
        ? gt("This project is hidden on this device.")
        : gt("This thread is hidden on this device.")}{" "}
      ·
      <Button variant="link" size="xs" onClick={() => unhideItem(hiddenItem)}>
        {project ? gt("Unhide project") : gt("Unhide")}
      </Button>
    </div>
  );
}
