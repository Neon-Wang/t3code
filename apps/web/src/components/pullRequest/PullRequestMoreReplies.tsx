import type { PullRequestReplyAvailability } from "./pullRequestDetail.logic";
import { useI18n } from "../../hooks/useI18n";

export function PullRequestMoreReplies({
  moreReplies,
  hasMoreReplies,
  url,
}: PullRequestReplyAvailability) {
  const { t } = useI18n();
  if (!hasMoreReplies) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1 text-xs text-muted-foreground">
      <span>
        {moreReplies > 0
          ? t(moreReplies === 1 ? "pr.moreReplies.one" : "pr.moreReplies.other", {
              count: moreReplies.toLocaleString(),
            })
          : t("pr.moreReplies")}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          {t("pr.viewOnHost")}
        </a>
      ) : null}
    </div>
  );
}
