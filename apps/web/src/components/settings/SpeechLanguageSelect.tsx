import type { EnvironmentSpeechStatus } from "@t3tools/contracts";
import { effectiveSpeechLanguage } from "@t3tools/shared/speech";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

import { useI18n } from "../../hooks/useI18n";
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
export const languageLabel = (code: string) => languageNames.of(code) ?? code;

type ModelLanguages = Pick<
  Extract<EnvironmentSpeechStatus, { supported: true }>,
  "languages" | "supportsLanguageDetection"
>;

export function SpeechLanguageSelect({ model }: { readonly model: ModelLanguages | null }) {
  const { t } = useI18n();
  const preference = useClientSettings((settings) => settings.speechLanguage);
  const languages = model?.languages ?? [];
  const resolved = model
    ? effectiveSpeechLanguage(
        { languages, supportsLanguageDetection: model.supportsLanguageDetection ?? false },
        preference,
      )
    : preference;
  const effectiveLabel =
    resolved === "auto" ? t("settings.voice.autoDetect") : languageLabel(resolved);
  const unavailable =
    preference !== "auto" && preference !== resolved
      ? t("settings.voice.languageUnavailable", { language: languageLabel(preference) })
      : null;
  const label = unavailable
    ? `${effectiveLabel} (${unavailable})`
    : preference === "auto" && resolved !== "auto"
      ? t("settings.voice.autoWithLanguage", { language: effectiveLabel })
      : effectiveLabel;
  return (
    <Select
      value={preference}
      disabled={!model}
      onValueChange={(value) => {
        if (value) void updateClientSettings({ speechLanguage: value });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("settings.voice.transcriptionLanguage")}
        className="max-w-64"
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem value="auto">{t("settings.voice.auto")}</SelectItem>
        {unavailable ? (
          <SelectItem value={preference} disabled>
            {unavailable}
          </SelectItem>
        ) : null}
        {languages
          .toSorted((left, right) => languageLabel(left).localeCompare(languageLabel(right)))
          .map((code) => (
            <SelectItem key={code} value={code}>
              {languageLabel(code)}
            </SelectItem>
          ))}
      </SelectPopup>
    </Select>
  );
}
