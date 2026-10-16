import { useI18n } from "../../hooks/useI18n";
import type { ComponentProps } from "react";
import { OpenAI } from "../Icons";
import { Button } from "../ui/button";

export function ChatGptConnectionButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { t } = useI18n();
  return (
    <Button {...props}>
      <OpenAI className="size-4 shrink-0" aria-hidden="true" />
      {children ?? t("settings.codexSetup.continueWithChatgpt")}
    </Button>
  );
}
