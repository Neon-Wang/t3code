import * as Dialog from "./ui/Dialog";
import { useI18n } from "../i18n/useI18n";
import { useOpenPullRequest } from "../native/useOpenPullRequest";
import { SourceFileSurface } from "../features/files/SourceFileSurface";
import { filePreviewKind } from "@t3tools/shared/filePreview";
import type {
  ComposerContextRecord,
  ElementContextSource,
  EnvironmentId,
  ProjectId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { videoMimeType } from "@t3tools/shared/video";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { REVIEW_MONO_FONT_FAMILY } from "../features/review/reviewDiffRendering";
import { ReviewCommentCard, useReviewCommentColors } from "../features/review/ReviewCommentCard";
import {
  composerAttachmentInlineUri,
  isFileBackedComposerAttachment,
  type DraftComposerAttachment,
} from "../lib/composerImages";
import { contextImageGallery } from "../lib/contextImageGallery";
import { FilePreviewModal } from "./FilePreviewModal";
import { VideoPreviewModal } from "./VideoPreviewModal";
import { ComposerContextAttachment } from "./ComposerContextAttachment";
import { AppText as Text } from "./ui/AppText";
import { Sheet } from "./ui/Sheet";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { getMobileTerminalTheme } from "../features/terminal/terminalTheme";

function ContextField(props: {
  label: string;
  value: string | null | undefined;
  code?: boolean | "html" | "css";
}) {
  if (!props.value) return null;
  return (
    <View className="gap-1">
      <Text className="text-xs text-foreground-muted">{props.label}</Text>
      {props.code === "html" || props.code === "css" ? (
        <View
          className="overflow-hidden rounded-xl border border-border"
          style={{ height: Math.min(260, Math.max(100, props.value.split("\n").length * 22 + 36)) }}
        >
          <SourceFileSurface
            embedded
            contents={props.value}
            path={props.code === "html" ? "element.html" : "styles.css"}
          />
        </View>
      ) : (
        <Text
          selectable
          className={props.code ? "text-sm text-foreground" : "text-base text-foreground"}
          style={props.code ? { fontFamily: REVIEW_MONO_FONT_FAMILY } : undefined}
        >
          {props.value}
        </Text>
      )}
    </View>
  );
}

function ContextSource(props: { source: ElementContextSource | null }) {
  const { t } = useI18n();
  const source = props.source;
  if (!source) return null;
  const location = source.fileName
    ? `${source.fileName}${source.lineNumber !== null ? `:${source.lineNumber}${source.columnNumber !== null ? `:${source.columnNumber}` : ""}` : ""}`
    : null;
  return (
    <ContextField
      label={t("mobile.components.source")}
      value={[source.functionName, location].filter(Boolean).join("\n")}
      code
    />
  );
}

export function ComposerContextSheet(props: {
  readonly label: string;
  readonly record: ComposerContextRecord | undefined;
  readonly onClose: () => void;
  readonly onRemove?: () => void;
  readonly onOpenAttachment?: () => void;
  readonly onOpenPullRequest?: () => void;
  readonly skillDescription?: string;
  readonly onOpenSkill?: () => void;
  readonly onOpenThread?: (thread: ScopedThreadRef) => void;
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
  readonly records?: ReadonlyArray<ComposerContextRecord>;
  readonly attachments?: ReadonlyArray<DraftComposerAttachment>;
}) {
  const { t } = useI18n();
  const openPullRequest = useOpenPullRequest({
    context:
      props.environmentId && props.projectId
        ? { environmentId: props.environmentId, projectId: props.projectId }
        : undefined,
  });
  const reviewColors = useReviewCommentColors();
  const insets = useSafeAreaInsets();
  const { themeId, themeAppearance } = useAppearancePreferences();
  const terminalTheme = getMobileTerminalTheme(themeId, themeAppearance);
  const record = props.record;
  const localAttachment =
    record && "attachmentId" in record
      ? props.attachments?.find((entry) => entry.id === record.attachmentId)
      : undefined;
  const localFile =
    localAttachment && isFileBackedComposerAttachment(localAttachment)
      ? localAttachment
      : undefined;
  if (record && !("payload" in record) && (record.kind === "image" || record.kind === "file")) {
    const mimeType = videoMimeType(record) ?? record.mimeType;
    const previewKind = filePreviewKind(record);
    const resource = {
      _tag: "attachment" as const,
      attachmentId: record.attachmentId,
      fileName: record.name,
      mimeType,
    };
    const remoteSource = props.environmentId
      ? { environmentId: props.environmentId, resource }
      : null;
    if (videoMimeType(record)) {
      if (localFile?.type === "file") {
        return (
          <VideoPreviewModal
            source={{ type: "local", attachment: localFile }}
            onRequestClose={props.onClose}
          />
        );
      }
      if (remoteSource && !localFile) {
        return (
          <VideoPreviewModal
            source={{
              type: "media",
              name: record.name,
              mimeType,
              ...remoteSource,
              actionsSource: { name: record.name, mimeType, ...remoteSource },
            }}
            onRequestClose={props.onClose}
          />
        );
      }
    } else if (record.kind === "image" || previewKind === "image" || previewKind === "pdf") {
      const inlineUri = composerAttachmentInlineUri(localAttachment);
      const source = localFile
        ? { attachment: localFile }
        : inlineUri
          ? { uri: inlineUri }
          : remoteSource;
      if (source) {
        return (
          <FilePreviewModal
            source={{
              kind: record.kind === "image" || previewKind === "image" ? "image" : "pdf",
              name: record.name,
              ...source,
              gallery: contextImageGallery(
                props.records ?? [],
                props.attachments ?? [],
                props.environmentId,
              ),
              actionsSource: { name: record.name, mimeType, ...source },
            }}
            onRequestClose={props.onClose}
          />
        );
      }
    }
  }
  const attachmentRecord =
    record && "attachmentId" in record
      ? record
      : record?.kind === "preview-annotation" && "screenshotContextId" in record
        ? props.records?.find(
            (entry) => entry.contextId === record.screenshotContextId && "attachmentId" in entry,
          )
        : undefined;
  const pullRequestUrl =
    record?.kind === "review-comment" && "pullRequest" in record
      ? record.pullRequest?.url
      : undefined;
  const terminal = record?.kind === "terminal" && !("payload" in record) ? record : null;
  return (
    <Sheet title={terminal?.terminalLabel ?? props.label} onClose={props.onClose}>
      <ScrollView
        nestedScrollEnabled
        className="flex-1"
        contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : "never"}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          gap: 16,
          paddingBottom: Math.max(20, insets.bottom),
        }}
      >
        {terminal ? (
          <Text className="text-sm text-foreground-muted">
            {t("mobile.components.lines")}
            {terminal.lineStart}–{terminal.lineEnd}
          </Text>
        ) : null}
        {!record ? (
          <Text className="text-foreground">
            {t(
              "mobile.components.contextUnavailableTheReferenceWasCopiedWithoutItsPayloadCopyItAgainFromTheOriginalMessageOrRemoveIt",
            )}
          </Text>
        ) : "payload" in record ? (
          <Text className="text-foreground">
            {t(
              "mobile.components.thisContextTypeIsNotSupportedByThisVersionOfTheAppItsPayloadWillBePreservedWhenSent",
            )}
          </Text>
        ) : (
          <>
            {record.kind === "terminal" ? (
              <View
                className="overflow-hidden rounded-xl"
                style={{ backgroundColor: terminalTheme.background }}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={{ padding: 12 }}
                >
                  <Text
                    selectable
                    className="text-sm text-foreground"
                    style={{
                      fontFamily: REVIEW_MONO_FONT_FAMILY,
                      fontSize: 13,
                      lineHeight: 20,
                      color: terminalTheme.foreground,
                    }}
                  >
                    {record.text}
                  </Text>
                </ScrollView>
              </View>
            ) : null}
            {record.kind === "review-comment" ? (
              <>
                {record.pullRequest ? (
                  <ContextField
                    label={`#${record.pullRequest.number} · ${record.pullRequest.isDraft ? "draft" : record.pullRequest.state}`}
                    value={`${record.pullRequest.title}\n${record.pullRequest.headBranch} → ${record.pullRequest.baseBranch}`}
                  />
                ) : null}
                {!record.sectionId.startsWith("pull-request:") ? (
                  <>
                    <ReviewCommentCard
                      comment={{ ...record, id: record.contextId }}
                      colors={reviewColors}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {record.kind === "preview-annotation" ? (
              <>
                <ContextField
                  label={t("mobile.components.page")}
                  value={record.pageTitle ?? record.pageUrl}
                />
                <ContextField label={t("mobile.composerContextSheet.url")} value={record.pageUrl} />
                <ContextField label={t("mobile.components.comment")} value={record.comment} />
                <ContextField
                  label={t("mobile.components.selection")}
                  value={record.targetSummary}
                />
                <ContextField
                  label={t("mobile.components.requestedChanges")}
                  value={record.styleChanges.join("\n")}
                />
                {record.elements?.map((element, index) => (
                  <View key={`${element.selector ?? element.tagName}:${index}`} className="gap-3">
                    <ContextField
                      label={t("mobile.components.element")}
                      value={element.componentName ?? element.tagName}
                    />
                    <ContextField
                      label={t("mobile.components.selector")}
                      value={element.selector}
                      code
                    />
                    <ContextSource source={element.source} />
                    <ContextField label="HTML" value={element.htmlPreview} code="html" />
                    <ContextField
                      label={t("mobile.components.styles")}
                      value={element.styles}
                      code="css"
                    />
                  </View>
                ))}
              </>
            ) : null}
            {record.kind === "element" ? (
              <>
                <ContextField label={t("mobile.components.page")} value={record.pageUrl} />
                <ContextField
                  label={t("mobile.components.element")}
                  value={record.componentName ?? record.tagName}
                />
                <ContextField
                  label={t("mobile.components.selector")}
                  value={record.selector}
                  code
                />
                <ContextSource source={record.source} />
                <ContextField label="HTML" value={record.htmlPreview} code="html" />
                <ContextField
                  label={t("mobile.components.styles")}
                  value={record.styles}
                  code="css"
                />
              </>
            ) : null}
            {record.kind === "image" ? (
              <ContextField
                label={t("mobile.components.file")}
                value={`${record.mimeType} · ${formatAttachmentSize(record.sizeBytes)}`}
              />
            ) : null}
            {record.kind === "mention" ? (
              <ContextField label={t("mobile.components.path")} value={record.path} code />
            ) : null}
            {record.kind === "thread" ? (
              <View className="gap-3">
                <ContextField label={t("mobile.components.thread")} value={record.title} />
                {props.onOpenThread ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      props.onOpenThread?.({
                        environmentId: record.environmentId,
                        threadId: record.threadId,
                      })
                    }
                    className="rounded-xl bg-subtle p-4"
                  >
                    <Text className="text-foreground">{t("mobile.components.openThread")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {record.kind === "skill" ? (
              <View className="gap-3">
                <ContextField label={t("mobile.components.skill")} value={record.name} />
                <ContextField
                  label={t("mobile.components.description")}
                  value={props.skillDescription ?? "No description is available for this skill."}
                />
                {props.onOpenSkill ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={props.onOpenSkill}
                    className="rounded-xl bg-subtle p-4"
                  >
                    <Text className="text-foreground">
                      {t("mobile.components.viewInstructions")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        {attachmentRecord && "attachmentId" in attachmentRecord ? (
          <ComposerContextAttachment
            key={JSON.stringify([
              props.environmentId,
              attachmentRecord.attachmentId,
              props.attachments?.find((entry) => entry.id === attachmentRecord.attachmentId)
                ?.fileUri,
            ])}
            record={attachmentRecord}
            environmentId={props.environmentId}
            attachment={props.attachments?.find(
              (entry) => entry.id === attachmentRecord.attachmentId,
            )}
          />
        ) : null}
        {pullRequestUrl && /^https?:\/\//i.test(pullRequestUrl) ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              props.onClose();
              void openPullRequest(pullRequestUrl).catch(() =>
                Dialog.alert(
                  t("mobile.components.couldNotOpenPullRequest"),
                  t("mobile.components.tryAgainWhenConnected"),
                ),
              );
            }}
            className="rounded-xl bg-subtle p-4"
          >
            <Text className="text-foreground">{t("mobile.components.openPullRequest")}</Text>
          </Pressable>
        ) : null}
        {props.onOpenAttachment ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onOpenAttachment}
            className="rounded-xl bg-subtle p-4"
          >
            <Text className="text-foreground">{t("mobile.components.openAttachment")}</Text>
          </Pressable>
        ) : null}
        {props.onOpenPullRequest && !pullRequestUrl ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onOpenPullRequest}
            className="rounded-xl bg-subtle p-4"
          >
            <Text className="text-foreground">{t("mobile.components.openPullRequest")}</Text>
          </Pressable>
        ) : null}
        {props.onRemove ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onRemove}
            className="rounded-xl bg-subtle p-4"
          >
            <Text className="text-foreground">{t("mobile.components.removeFromDraft")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
