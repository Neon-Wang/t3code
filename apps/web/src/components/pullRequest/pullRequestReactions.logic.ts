import { i18n } from "@t3tools/shared/i18n";
import type { PullRequestReaction, PullRequestReactionContent } from "@t3tools/contracts";

/** The picker's order, which is GitHub's: the two verdicts first, then the rest as it lists them. */
export const PULL_REQUEST_REACTION_ORDER: ReadonlyArray<PullRequestReactionContent> = [
  "thumbs-up",
  "thumbs-down",
  "laugh",
  "hooray",
  "confused",
  "heart",
  "rocket",
  "eyes",
];

const REACTION_EMOJI: Record<PullRequestReactionContent, string> = {
  "thumbs-up": "👍",
  "thumbs-down": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};

/** The spoken names GitHub uses in its own hover text, which is what a screen reader reads out. */
function getReactionName(t: typeof i18n.t = i18n.t): Record<PullRequestReactionContent, string> {
  return {
    "thumbs-up": t("pr.thumbsUp"),
    "thumbs-down": t("pr.thumbsDown"),
    laugh: t("pr.laugh"),
    hooray: t("pr.hooray"),
    confused: t("pr.confused"),
    heart: t("pr.heart"),
    rocket: t("pr.rocket"),
    eyes: t("pr.eyes"),
  };
}

export function pullRequestReactionEmoji(content: PullRequestReactionContent): string {
  return REACTION_EMOJI[content];
}

export function pullRequestReactionName(
  content: PullRequestReactionContent,
  t: typeof i18n.t = i18n.t,
): string {
  return getReactionName(t)[content];
}

/** Past three names the sentence stops being readable and starts being a list. */
const NAMED_ACTOR_LIMIT = 3;

function joinNames(parts: ReadonlyArray<string>, t: typeof i18n.t = i18n.t): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2)
    return t("pr.valueAndValue", { arg0: parts[0] ?? "", arg1: parts[1] ?? "" });
  return t("pr.valueAndValueText", {
    arg0: parts.slice(0, -1).join(", "),
    arg1: parts.at(-1) ?? "",
  });
}

/** "others" only alongside somebody named; on its own a count is people, not other people. */
function countRemainder(count: number, named: boolean, t: typeof i18n.t = i18n.t): string {
  if (named) return `${count} ${count === 1 ? t("pr.other") : t("pr.othersText")}`;
  return `${count} ${count === 1 ? t("pr.person") : t("pr.people")}`;
}

/**
 * Who reacted, in GitHub's sentence. The viewer reads as "You" and comes first, because that is
 * the name they are looking for; a compliant host already leaves the viewer's own login out of
 * `actors` when they have reacted, leaving room for "You" without ever exceeding `count`. This
 * function has no viewer login to match against `actors`, so it cannot tell a non-compliant host
 * apart by name — but such a host gives itself away by leaving no room: `actors` alone already
 * accounts for everyone `count` claims. Then the viewer is already in `actors` under their own
 * login, and naming them "You" too would either invent a person or hide a real one, so `actors`
 * is named as given instead. The cap still guards further: the sentence never names more people
 * than `count` claims, and the remainder is counted rather than named — a host reports fewer
 * logins than it counts, so `count` is the only trustworthy total.
 */
export function pullRequestReactionTooltip(
  reaction: PullRequestReaction,
  t: typeof i18n.t = i18n.t,
): string {
  const viewerHasRoom = reaction.actors.length < reaction.count;
  const names =
    reaction.viewerHasReacted && viewerHasRoom
      ? [t("pr.you"), ...reaction.actors]
      : [...reaction.actors];
  const shown = names.slice(0, Math.min(NAMED_ACTOR_LIMIT, reaction.count));
  const others = Math.max(0, reaction.count - shown.length);
  const parts = [...shown, ...(others > 0 ? [countRemainder(others, shown.length > 0, t)] : [])];
  return t("pr.valueReactedWithValueEmoji", {
    arg0: joinNames(parts, t),
    arg1: pullRequestReactionName(reaction.content, t),
  });
}

/**
 * The list as it should be drawn while a reaction is still in flight. Reading a change request
 * back from the host takes seconds, and a pill that does not move until then reads as a press
 * that did nothing.
 */
export function applyPendingPullRequestReactions(
  reactions: ReadonlyArray<PullRequestReaction>,
  pending: ReadonlyMap<PullRequestReactionContent, boolean>,
): ReadonlyArray<PullRequestReaction> {
  if (pending.size === 0) return reactions;
  const byContent = new Map(reactions.map((reaction) => [reaction.content, reaction] as const));
  for (const [content, reacted] of pending) {
    const current = byContent.get(content);
    if (current === undefined) {
      if (reacted) {
        byContent.set(content, { content, count: 1, actors: [], viewerHasReacted: true });
      }
      continue;
    }
    if (current.viewerHasReacted === reacted) continue;
    const count = current.count + (reacted ? 1 : -1);
    if (count <= 0) byContent.delete(content);
    else byContent.set(content, { ...current, count, viewerHasReacted: reacted });
  }
  return PULL_REQUEST_REACTION_ORDER.flatMap((content) => byContent.get(content) ?? []);
}
