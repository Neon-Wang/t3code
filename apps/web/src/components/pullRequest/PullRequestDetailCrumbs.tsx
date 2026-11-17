import type { ComponentProps } from "react";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { useI18n } from "../../hooks/useI18n";
import { DetailCrumbs } from "../sourceControl/DetailCrumbs";

export function PullRequestDetailCrumbs(
  props: Omit<ComponentProps<typeof DetailCrumbs>, "term" | "backLabel" | "backTooltip">,
) {
  const { t } = useI18n();
  return (
    <DetailCrumbs
      {...props}
      term={sourceControlClients.get(props.detail?.provider ?? "github").changeRequest.singular}
      backLabel={t("pr.backToThisThreadSPullRequests")}
      backTooltip={t("pr.backToPullRequests")}
    />
  );
}
