import { useRef } from "react";

import { APP_VERSION } from "../../branding";
import { useI18n } from "../../hooks/useI18n";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { InlineButton } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function AboutVersionTitle() {
  const { t } = useI18n();
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const { copyToClipboard } = useCopyToClipboard<void>({
    target: "version",
    onCopy: () => showAnchoredCopySuccessToast(copyButtonRef),
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t("settings.aboutVersion.copyFailed"),
          description: error.message,
        }),
      );
    },
  });

  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{t("settings.label.version")}</span>
      <code className="text-2xs font-medium">
        <Tooltip>
          <TooltipTrigger
            render={
              <InlineButton
                ref={copyButtonRef}
                tone="muted"
                aria-label={t("settings.aboutVersion.copyAria", { version: APP_VERSION })}
                onClick={() => copyToClipboard(APP_VERSION, undefined)}
              >
                {APP_VERSION}
              </InlineButton>
            }
          />
          <TooltipPopup>{t("settings.aboutVersion.copy")}</TooltipPopup>
        </Tooltip>
      </code>
    </span>
  );
}
