import { rankedCostGroups, type UsageCostGroup } from "@t3tools/shared/usageMerge";
import { formatUsd, formatTokens } from "@t3tools/shared/usageFormat";
import { Link } from "@tanstack/react-router";
import { useGT, useLocale } from "gt-react";
import { useState } from "react";
import { InlineButton } from "../ui/button";

export function UsageCostGroups({ groups }: { groups: ReadonlyMap<string, UsageCostGroup> }) {
  const [limit, setLimit] = useState(30);
  const gt = useGT();
  return (
    <ul className="min-w-0 text-sm">
      {rankedCostGroups(groups)
        .slice(0, limit)
        .map((row) => (
          <CostRow key={row.key} row={row} />
        ))}
      {groups.size > limit && (
        <li>
          <InlineButton onClick={() => setLimit(limit + 30)}>{gt("Show more")}</InlineButton>
        </li>
      )}
    </ul>
  );
}
function CostRow({ row }: { row: UsageCostGroup }) {
  const gt = useGT();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const label =
    row.kind === "outside"
      ? gt("Outside T3")
      : row.kind === "unsupported"
        ? gt("Cannot match thread: {provider}", { provider: row.label })
        : row.kind === "deleted"
          ? gt("Deleted thread")
          : row.kind === "main"
            ? gt("Main agent")
            : row.label;
  return (
    <li className="border-b border-border/50 py-1">
      <div className="flex min-w-0 items-center gap-2">
        {row.children.size > 0 && (
          <button
            type="button"
            aria-label={label}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
        {row.threadId ? (
          <Link
            className="min-w-0 flex-1 truncate hover:underline"
            to="/$environmentId/$threadId"
            params={{ environmentId: row.environmentId, threadId: row.threadId }}
          >
            {label}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        )}
        <span className="whitespace-nowrap tabular-nums">
          {row.hasPrice ? formatUsd(row.costUsd, locale) : gt("Unpriced")} ·{" "}
          {gt("{count} tokens", { count: formatTokens(row.tokens) })}
        </span>
      </div>
      {expanded && (
        <div className="ms-3">
          <UsageCostGroups groups={row.children} />
        </div>
      )}
    </li>
  );
}
