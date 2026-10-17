import { useI18n } from "../i18n/useI18n";
import type { ComponentProps } from "react";
import { MaterialFloatingActionButton } from "./MaterialFloatingActionButton.android";
import { MaterialScrollComposeButton } from "./MaterialScrollComposeButton.android";
import type { MaterialNewThreadButton as SharedMaterialNewThreadButton } from "./MaterialNewThreadButton.shared";

export function MaterialNewThreadButton(
  props: ComponentProps<typeof SharedMaterialNewThreadButton>,
) {
  const { t } = useI18n();
  if (props.extended && props.expanded !== undefined) {
    return <MaterialScrollComposeButton {...props} expanded={props.expanded} />;
  }
  return (
    <MaterialFloatingActionButton
      {...props}
      icon="square.and.pencil"
      label={t("mobile.components.newThread")}
      tone="primary"
      variant={props.extended ? "extended" : "large"}
    />
  );
}
