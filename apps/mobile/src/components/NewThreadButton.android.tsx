import { useI18n } from "../i18n/useI18n";
import type { ComponentProps } from "react";
import { FloatingActionButton } from "./ui/FloatingActionButton.android";
import { ScrollComposeButton } from "./ScrollComposeButton.android";
import type { NewThreadButton as SharedNewThreadButton } from "./NewThreadButton.shared";

export function NewThreadButton(props: ComponentProps<typeof SharedNewThreadButton>) {
  const { t } = useI18n();
  if (props.extended && props.expanded !== undefined) {
    return <ScrollComposeButton {...props} expanded={props.expanded} />;
  }
  return (
    <FloatingActionButton
      {...props}
      icon="square.and.pencil"
      label={t("mobile.components.newThread")}
      tone="primary"
      variant={props.extended ? "extended" : "large"}
    />
  );
}
