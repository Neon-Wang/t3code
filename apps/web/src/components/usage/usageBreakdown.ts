import { i18n } from "@t3tools/shared/i18n";
import type { UsageTokenTotals } from "@t3tools/contracts";
import {
  isModelCostUnknown,
  type CategoryCost,
  type ModelTotals,
  type SpeedCost,
} from "@t3tools/shared/usageMerge";

import type { ShareSegment } from "./UsageShareBar";

export function sortModelsByTokens(models: readonly ModelTotals[]) {
  return models.toSorted(
    (left, right) => right.totalTokens - left.totalTokens || right.costUsd - left.costUsd,
  );
}

/**
 * A model's share of the selected metric, or `null` for a cost share of an
 * unknown cost. An unpriced model still has a real token share.
 */
export function modelShare(model: ModelTotals, metric: "cost" | "tokens"): number | null {
  if (metric === "tokens") return model.tokenShare;
  return isModelCostUnknown(model) ? null : model.costShare;
}

/**
 * Share of a model's input read from cache, or `null` without input. Cache
 * writes count as misses: that input was processed in full.
 */
export function cacheHitRate({ tokens }: ModelTotals): number | null {
  const input = tokens.uncachedInputTokens + tokens.cachedInputTokens + tokens.cacheCreationTokens;
  return input === 0 ? null : tokens.cachedInputTokens / input;
}

/** Effective USD per million priced tokens, or `null` when none were priced. */
export function costPerMillionTokens(model: ModelTotals): number | null {
  const pricedTokens = model.totalTokens - model.unpricedTokens;
  return pricedTokens <= 0 || isModelCostUnknown(model)
    ? null
    : (model.costUsd / pricedTokens) * 1_000_000;
}

const ink = (percent: number) =>
  `color-mix(in oklab, var(--foreground) ${percent}%, var(--background))`;

const TYPE_COLORS = {
  input: ink(60),
  cacheRead: ink(30),
  cacheWrite: ink(72),
  output: ink(100),
  other: ink(44),
};

export function costTypeSegments(cost: CategoryCost): readonly ShareSegment[] {
  return [
    { label: i18n.t("usage.input"), value: cost.input, color: TYPE_COLORS.input },
    { label: i18n.t("usage.cacheRead"), value: cost.cacheRead, color: TYPE_COLORS.cacheRead },
    { label: i18n.t("usage.cacheWrite"), value: cost.cacheWrite, color: TYPE_COLORS.cacheWrite },
    { label: i18n.t("usage.output"), value: cost.output, color: TYPE_COLORS.output },
    { label: "Other", value: cost.unsplit >= 0.005 ? cost.unsplit : 0, color: TYPE_COLORS.other },
  ];
}

export function tokenTypeSegments(
  tokens: Omit<UsageTokenTotals, "reasoningTokens">,
): readonly ShareSegment[] {
  return [
    {
      label: i18n.t("usage.input"),
      value: tokens.uncachedInputTokens,
      color: TYPE_COLORS.input,
    },
    {
      label: i18n.t("usage.cacheRead"),
      value: tokens.cachedInputTokens,
      color: TYPE_COLORS.cacheRead,
    },
    {
      label: i18n.t("usage.cacheWrite"),
      value: tokens.cacheCreationTokens,
      color: TYPE_COLORS.cacheWrite,
    },
    { label: i18n.t("usage.output"), value: tokens.outputTokens, color: TYPE_COLORS.output },
  ];
}

export function speedCostSegments(cost: SpeedCost): readonly ShareSegment[] {
  return [
    { label: i18n.t("browser.standard"), value: cost.standard, color: ink(34) },
    { label: i18n.t("chat.ui.trait.Fast"), value: cost.fast, color: ink(66) },
    { label: "Ultrafast", value: cost.ultrafast, color: ink(100) },
  ];
}
