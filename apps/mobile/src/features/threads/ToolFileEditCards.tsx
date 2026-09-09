import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ToolFileEdit } from "@t3tools/shared/toolFileEdit";

import { resolveNativeReviewDiffView } from "../diffs/nativeReviewDiffSurface";
import {
  buildNativeReviewDiffData,
  createNativeReviewDiffTheme,
  NATIVE_REVIEW_DIFF_CONTENT_WIDTH,
} from "../review/nativeReviewDiffAdapter";
import { buildReviewParsedDiff } from "../review/reviewModel";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { useAppearanceCodeSurface } from "../settings/appearance/useAppearanceCodeSurface";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { toolFileEditPatch } from "./toolFileEditPatch";

/** Mirrors the review-comment card's bounds, so a row's height stays predictable. */
const MIN_DIFF_HEIGHT = 112;
const MAX_DIFF_HEIGHT = 360;

/**
 * The per-edit diffs a file-changing tool call carries, rendered through the
 * same native surface the review-comment card uses.
 *
 * Height is clamped rather than content-driven: the feed's follow-append
 * heuristic assumes rows only grow, so an unbounded card inside one would fight
 * it. Rendering happens only while the row is expanded.
 */
export const ToolFileEditCards = memo(function ToolFileEditCards(props: {
  readonly edits: ReadonlyArray<ToolFileEdit>;
  readonly rowId: string;
}) {
  return (
    <View className="gap-1.5 pb-1.5">
      {props.edits.map((edit) => {
        const key = toolFileEditKey(edit);
        return <ToolFileEditCard key={key} edit={edit} cacheKey={`${props.rowId}:${key}`} />;
      })}
    </View>
  );
});

/**
 * A multi-edit tool call produces several edits for one path, so the key has to
 * describe what changed rather than where it sat in the list.
 */
function toolFileEditKey(edit: ToolFileEdit): string {
  const body =
    edit.kind === "patch"
      ? edit.unifiedDiff
      : edit.kind === "rewrite"
        ? edit.newText
        : `${edit.oldText}\u0000${edit.newText}`;
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < body.length; index += 1) {
    hash ^= body.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return `${edit.kind}:${edit.path}:${(hash >>> 0).toString(36)}`;
}

const ToolFileEditCard = memo(function ToolFileEditCard(props: {
  readonly edit: ToolFileEdit;
  readonly cacheKey: string;
}) {
  const { nativeReviewDiffStyle } = useAppearanceCodeSurface();
  const { themeAppearance: appearanceScheme, themeId } = useAppearancePreferences();
  const appTheme = useUniwindTheme();
  const NativeReviewDiffView = resolveNativeReviewDiffView();

  const patch = useMemo(() => toolFileEditPatch(props.edit), [props.edit]);
  const parsedDiff = useMemo(
    () => buildReviewParsedDiff(patch, `tool-file-edit:${props.cacheKey}`),
    [patch, props.cacheKey],
  );
  const rows = useMemo(
    () => buildNativeReviewDiffData(parsedDiff).rows.filter((row) => row.kind !== "file"),
    [parsedDiff],
  );
  const theme = useMemo(
    () => createNativeReviewDiffTheme(appearanceScheme, themeId, appTheme),
    [appearanceScheme, appTheme, themeId],
  );
  const rowsJson = useMemo(() => JSON.stringify(rows), [rows]);
  const themeJson = useMemo(() => JSON.stringify(theme), [theme]);
  const styleJson = useMemo(() => JSON.stringify(nativeReviewDiffStyle), [nativeReviewDiffStyle]);
  const height = useMemo(
    () =>
      Math.min(
        MAX_DIFF_HEIGHT,
        Math.max(
          MIN_DIFF_HEIGHT,
          rows.length * nativeReviewDiffStyle.rowHeight +
            nativeReviewDiffStyle.fileHeaderVerticalMargin,
        ),
      ),
    [rows.length, nativeReviewDiffStyle],
  );

  if (NativeReviewDiffView == null || rows.length === 0) {
    return null;
  }

  return (
    <View className="overflow-hidden rounded-xl border border-adaptive-neutral-200-a80-white-a8">
      <View className="border-b border-adaptive-neutral-200-a80-white-a8 bg-subtle px-2.5 py-1.5">
        <Text className="font-mono text-2xs text-foreground-muted" numberOfLines={1}>
          {props.edit.kind === "rewrite" ? "Wrote " : ""}
          {props.edit.path}
        </Text>
      </View>
      <View collapsable={false} style={{ backgroundColor: theme.background, height }}>
        <NativeReviewDiffView
          collapsable={false}
          style={StyleSheet.absoluteFill}
          appearanceScheme={appearanceScheme}
          contentWidth={NATIVE_REVIEW_DIFF_CONTENT_WIDTH}
          rowHeight={nativeReviewDiffStyle.rowHeight}
          rowsJson={rowsJson}
          styleJson={styleJson}
          themeJson={themeJson}
        />
      </View>
    </View>
  );
});
