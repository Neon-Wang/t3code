import { useI18n } from "../../hooks/useI18n";
import { useId, useRef, useState, type ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { SourceControlMarkdown } from "./SourceControlMarkdown";
import { observeResize } from "~/lib/observeResize";

export function CommentBody({ className, ...props }: ComponentProps<typeof SourceControlMarkdown>) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const clip = useRef<HTMLDivElement>(null);
  const id = useId();

  return (
    <div className={cn("min-w-0", className)}>
      <div
        ref={clip}
        id={id}
        className={cn("relative", !expanded && "max-h-[240px] overflow-hidden")}
        onFocusCapture={() => setExpanded(true)}
      >
        <div
          ref={(element) => {
            if (element === null) return;
            return observeResize(element, ([entry]) => {
              if (entry) setOverflowing(entry.contentRect.height > 240);
            });
          }}
        >
          <SourceControlMarkdown {...props} />
        </div>
        {overflowing && !expanded ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent"
          />
        ) : null}
      </div>
      {overflowing ? (
        <Button
          size="xs"
          variant="ghost-muted"
          className="mt-2"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => {
            if (expanded) clip.current?.scrollIntoView({ block: "nearest" });
            setExpanded(!expanded);
          }}
        >
          {expanded ? t("pr.showLess") : t("pr.showFullComment")}
        </Button>
      ) : null}
    </div>
  );
}
