import { useAtomValue } from "@effect/atom-react";
import { latestThreadTodo } from "@t3tools/client-runtime/state/thread-todo";
import { summarizeTodoSteps, type ScopedThreadRef } from "@t3tools/contracts";
import { CheckIcon, CircleDashedIcon, CircleIcon } from "lucide-react";
import { useGT } from "gt-react";
import { cn } from "../../lib/utils";
import { environmentThreadDetails } from "../../state/threads";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

export function ThreadTodoSection({ threadRef }: { threadRef: ScopedThreadRef }) {
  const gt = useGT();
  const detail = useAtomValue(environmentThreadDetails.quietThreadAtom(threadRef));
  const todo = detail === null ? null : latestThreadTodo(detail.projection);
  if (todo === null || todo.steps.length === 0) return null;
  const progress = summarizeTodoSteps(todo.steps);
  return (
    <ThreadDetailsSection
      headingId="thread-details-tasks-heading"
      title={`${gt("Tasks")} · ${progress.done}/${progress.total}`}
    >
      <ul className="m-0 flex max-h-64 list-none flex-col gap-2 overflow-y-auto px-2.5 py-1">
        {todo.steps.map((step) => {
          const Icon =
            step.status === "completed"
              ? CheckIcon
              : step.status === "running"
                ? CircleDashedIcon
                : CircleIcon;
          return (
            <li
              key={step.id}
              aria-current={step.status === "running" ? "step" : undefined}
              className={cn(
                "flex items-start gap-2 text-xs",
                step.status === "completed" && "text-muted-foreground line-through",
                step.status === "running" && "font-semibold text-foreground",
              )}
            >
              <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 wrap-break-word">{step.text}</span>
            </li>
          );
        })}
      </ul>
    </ThreadDetailsSection>
  );
}
