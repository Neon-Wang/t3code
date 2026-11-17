import { useI18n } from "../../hooks/useI18n";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { DetailTitleRow } from "./DetailLayout";
import { EditButton } from "./EditButton";

/** An editable source control title; the caller reports host failures. */
export function TitleEditor({
  label,
  onUpdate,
  editable,
  pullRequestKey,
  detail,
  canWriteSourceControl,
  onSaved,
}: {
  label: string;
  onUpdate: (title: string) => Promise<boolean>;
  editable: boolean;
  pullRequestKey: string;
  detail: { title: string };
  canWriteSourceControl: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [titleScope, setTitleScope] = useState<{
    readonly pullRequestKey: string;
    readonly text: string;
  } | null>(null);
  const titleDraft = titleScope?.pullRequestKey === pullRequestKey ? titleScope.text : null;
  const [titleSaving, setTitleSaving] = useState(false);

  const saveTitle = async (next: string) => {
    const title = next.trim();
    if (!canWriteSourceControl || titleSaving) return;
    if (title.length === 0 || title === detail.title) {
      setTitleScope(null);
      return;
    }
    setTitleSaving(true);
    const saved = await onUpdate(title);
    setTitleSaving(false);
    if (!saved) {
      return;
    }
    setTitleScope(null);
    onSaved();
  };

  if (titleDraft === null) {
    return (
      <DetailTitleRow className="group gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold leading-snug">
                {detail.title}
              </h1>
            }
          />
          <TooltipPopup side="top">{detail.title}</TooltipPopup>
        </Tooltip>
        {editable ? (
          <EditButton
            aria-label={t("pr.editTitle")}
            onClick={() => setTitleScope({ pullRequestKey, text: detail.title })}
          />
        ) : null}
      </DetailTitleRow>
    );
  }
  return (
    <div className="space-y-2">
      <Input
        autoFocus
        size="sm"
        disabled={titleSaving}
        value={titleDraft}
        aria-label={label}
        onChange={(event) => setTitleScope({ pullRequestKey, text: event.target.value })}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void saveTitle(titleDraft);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setTitleScope(null);
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="xs"
          variant="ghost"
          disabled={titleSaving}
          onClick={() => setTitleScope(null)}
        >
          {t("action.cancel")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={!canWriteSourceControl || titleSaving || titleDraft.trim().length === 0}
          onClick={() => void saveTitle(titleDraft)}
        >
          {titleSaving ? t("chat.ui.saving") : t("action.save")}
        </Button>
      </div>
    </div>
  );
}
