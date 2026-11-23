import {
  AuthDiagnosticsReadScope,
  UsageDay,
  type ThreadId,
  type EnvironmentId,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { groupThreadCosts } from "@t3tools/shared/usageMerge";
import { formatUsd, formatTokens, makeWindow } from "@t3tools/shared/usageFormat";
import { useGT, useLocale } from "gt-react";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { UsageCostGroups } from "../usage/UsageCostGroups";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

export function ThreadDetailsCost({
  threadId,
  environmentId,
}: {
  threadId: ThreadId;
  environmentId: EnvironmentId;
}) {
  const gt = useGT();
  const locale = useLocale();
  const modelFilter = useAtomValue(serverEnvironment.usageModelFilterAtom(environmentId));
  const allowed = useEnvironmentScope(environmentId, AuthDiagnosticsReadScope);
  const usage = useEnvironmentQuery(
    allowed
      ? serverEnvironment.usageSummary({
          environmentId,
          input: {
            ...makeWindow(1),
            sinceDay: UsageDay.make("1970-01-01"),
            threadBreakdown: { threadId },
            modelFilter,
          },
        })
      : null,
  );
  const rows = usage.data?.threadCosts;
  const root =
    rows &&
    [
      ...groupThreadCosts(
        rows.map((row) => ({ ...row, environmentId })),
        "threads",
        threadId,
      ).values(),
    ][0];
  const children = [...(root?.children.values() ?? [])].filter((child) => child.kind !== "main");
  const childCost = children.reduce((sum, child) => sum + child.costUsd, 0);
  const childTokens = children.reduce((sum, child) => sum + child.tokens, 0);
  if (!allowed) return null;
  return (
    <ThreadDetailsSection
      title={gt("Thread spending")}
      headingId="thread-details-spending"
      showHeading={false}
    >
      <details className="px-2 text-xs">
        <summary className="cursor-pointer">
          {gt("Thread spending")} ·{" "}
          {usage.error ??
            (!usage.data
              ? gt("Loading…")
              : !rows
                ? gt("Server version too old")
                : `${root && !root.hasPrice ? gt("Unpriced") : formatUsd(root?.costUsd ?? 0, locale)} · ${gt("{count} tokens", { count: formatTokens(root?.tokens ?? 0) })}`)}
          {children.length > 0 && (
            <span className="block ps-3 text-muted-foreground">
              {gt("Subagents and child tasks: {cost} · {tokens}", {
                cost: children.some((child) => child.hasPrice)
                  ? formatUsd(childCost, locale)
                  : gt("Unpriced"),
                tokens: gt("{count} tokens", { count: formatTokens(childTokens) }),
              })}
            </span>
          )}
        </summary>
        {root && <UsageCostGroups groups={root.children} />}
      </details>
    </ThreadDetailsSection>
  );
}
