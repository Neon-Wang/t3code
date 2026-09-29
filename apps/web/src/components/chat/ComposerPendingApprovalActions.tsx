import { type MessageKey } from "@t3tools/shared/i18n";
import { useI18n } from "../../hooks/useI18n";
import {
  type ApprovalRequestId,
  type ProviderApprovalDecision,
  type ProviderApprovalOption,
} from "@t3tools/contracts";
import { memo } from "react";
import { EllipsisIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  options?: ReadonlyArray<ProviderApprovalOption> | undefined;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const APPROVAL_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  Cancel: "confirm.cancel",
  Decline: "chat.ui.decline",
  "Always allow this session": "chat.ui.alwaysAllowThisSession",
  Approve: "chat.ui.approve",
};

const DEFAULT_APPROVAL_OPTIONS = [
  { decision: "cancel", labelKey: "confirm.cancel" },
  { decision: "decline", labelKey: "chat.ui.decline" },
  { decision: "acceptForSession", labelKey: "chat.ui.alwaysAllowThisSession" },
  { decision: "accept", labelKey: "chat.ui.approve" },
] satisfies ReadonlyArray<{ decision: ProviderApprovalDecision; labelKey: MessageKey }>;

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  options,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  const { t } = useI18n();
  const sourceOptions: ReadonlyArray<ProviderApprovalOption> =
    options ??
    DEFAULT_APPROVAL_OPTIONS.map(({ decision, labelKey }) => ({ decision, label: t(labelKey) }));
  const localizedOptions = sourceOptions.map((option) => {
    const key = APPROVAL_LABEL_KEYS[option.label];
    return { ...option, label: key ? t(key) : option.label };
  });
  const primaryOptions = localizedOptions.filter(
    (option) => option.decision === "decline" || option.decision === "accept",
  );
  const moreOptions = localizedOptions.filter(
    (option) => option.decision !== "decline" && option.decision !== "accept",
  );

  return (
    <>
      {primaryOptions.map((option) => {
        const button = (
          <Button
            key={option.decision}
            size="xs"
            variant={option.decision === "accept" ? "default" : "outline"}
            disabled={isResponding}
            aria-description={option.warning}
            onClick={() => void onRespondToApproval(requestId, option.decision)}
          >
            {option.warning ? <TriangleAlertIcon className="size-3 shrink-0" /> : null}
            <span className="max-w-40 truncate">{option.label}</span>
          </Button>
        );
        return option.warning ? (
          <Tooltip key={option.decision}>
            <TooltipTrigger render={button} />
            <TooltipPopup side="top">{option.warning}</TooltipPopup>
          </Tooltip>
        ) : (
          button
        );
      })}
      {moreOptions.length > 0 ? (
        <Menu>
          <MenuTrigger
            disabled={isResponding}
            render={
              <Button
                size="icon-xs"
                variant="outline"
                aria-label={t("chat.ui.moreApprovalOptions")}
              />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuPopup {...composerFloatingLayerProps} side="top" align="end">
            {moreOptions.map((option) => {
              const item = (
                <MenuItem
                  key={option.decision}
                  disabled={isResponding}
                  aria-description={option.warning}
                  onClick={() => void onRespondToApproval(requestId, option.decision)}
                  variant="ghost"
                  className="mb-1 last:mb-0"
                >
                  {option.warning ? <TriangleAlertIcon className="size-3 text-warning" /> : null}
                  <span className="min-w-0 whitespace-normal wrap-break-word">{option.label}</span>
                </MenuItem>
              );
              return option.warning ? (
                <Tooltip key={option.decision}>
                  <TooltipTrigger render={item} />
                  <TooltipPopup side="top">{option.warning}</TooltipPopup>
                </Tooltip>
              ) : (
                item
              );
            })}
          </MenuPopup>
        </Menu>
      ) : null}
    </>
  );
});
