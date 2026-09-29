import { i18n } from "@t3tools/shared/i18n";
import { iconNames, type IconName } from "lucide-react/dynamic";
export {
  PROJECT_ICON_COLORS,
  projectIconColorClassName,
  getProjectIconColors,
} from "./projectIconColors";

const POPULAR_PROJECT_ICONS = [
  "folder-code",
  "code-2",
  "terminal",
  "globe-2",
  "server",
  "database",
  "bot",
  "sparkles",
  "smartphone",
  "monitor",
  "cloud-cog",
  "package",
  "book-open",
  "flask-conical",
  "shield-check",
  "rocket",
  "gamepad-2",
  "music",
  "image",
  "shopping-bag",
  "git-branch",
  "workflow",
  "wrench",
  "layers-3",
] as const satisfies ReadonlyArray<IconName>;

export const PROJECT_EMOJIS: ReadonlyArray<{ readonly emoji: string; readonly label: string }> = [
  { emoji: "💻", label: "Computer" },
  { emoji: "🛠️", label: "Tools" },
  { emoji: "🚀", label: "Rocket" },
  { emoji: "🤖", label: "Robot" },
  { emoji: "✨", label: "Sparkles" },
  { emoji: "⚡", label: "Lightning" },
  { emoji: "🌐", label: "Web" },
  { emoji: "📱", label: "Mobile" },
  { emoji: "🖥️", label: "Desktop" },
  { emoji: "⌨️", label: "Keyboard" },
  { emoji: "⚙️", label: "Gear" },
  { emoji: "🗄️", label: "Database" },
  { emoji: "☁️", label: "Cloud" },
  { emoji: "📦", label: "Package" },
  { emoji: "📚", label: "Books" },
  { emoji: "🧪", label: "Test tube" },
  { emoji: "🔒", label: "Lock" },
  { emoji: "🎮", label: "Game" },
  { emoji: "🎵", label: "Music" },
  { emoji: "🎬", label: "Movie" },
  { emoji: "🖼️", label: "Picture" },
  { emoji: "🛍️", label: "Shopping" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "💡", label: "Idea" },
  { emoji: "🧩", label: "Puzzle" },
  { emoji: "📊", label: "Chart" },
  { emoji: "🧠", label: "Brain" },
  { emoji: "🦄", label: "Unicorn" },
  { emoji: "🐙", label: "Octopus" },
  { emoji: "🌱", label: "Seedling" },
];

export function filterProjectIconNames(query: string): ReadonlyArray<IconName> {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-");
  if (!normalized) return POPULAR_PROJECT_ICONS;
  return iconNames.filter((name) => name.includes(normalized)).slice(0, 60);
}

export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
  const segment = segments[Symbol.iterator]().next().value?.segment;
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment ?? "");
  const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(segment ?? "");
  if (!segment || (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap)) {
    return null;
  }
  return segment;
}

const PROJECT_EMOJIS_LABEL_KEYS = {
  "💻": "helpers.projectEmoji.computer",
  "🛠️": "helpers.projectEmoji.tools",
  "🚀": "helpers.projectEmoji.rocket",
  "🤖": "helpers.projectEmoji.robot",
  "✨": "helpers.projectEmoji.sparkles",
  "⚡": "helpers.projectEmoji.lightning",
  "🌐": "helpers.projectEmoji.web",
  "📱": "helpers.projectEmoji.mobile",
  "🖥️": "helpers.projectEmoji.desktop",
  "⌨️": "helpers.projectEmoji.keyboard",
  "⚙️": "helpers.projectEmoji.gear",
  "🗄️": "helpers.projectEmoji.database",
  "☁️": "helpers.projectEmoji.cloud",
  "📦": "helpers.projectEmoji.package",
  "📚": "helpers.projectEmoji.books",
  "🧪": "helpers.projectEmoji.test_tube",
  "🔒": "helpers.projectEmoji.lock",
  "🎮": "helpers.projectEmoji.game",
  "🎵": "helpers.projectEmoji.music",
  "🎬": "helpers.projectEmoji.movie",
  "🖼️": "helpers.projectEmoji.picture",
  "🛍️": "helpers.projectEmoji.shopping",
  "🔥": "helpers.projectEmoji.fire",
  "💡": "helpers.projectEmoji.idea",
  "🧩": "helpers.projectEmoji.puzzle",
  "📊": "helpers.projectEmoji.chart",
  "🧠": "helpers.projectEmoji.brain",
  "🦄": "helpers.projectEmoji.unicorn",
  "🐙": "helpers.projectEmoji.octopus",
  "🌱": "helpers.projectEmoji.seedling",
} as const;

export function getProjectEmojis(t: typeof i18n.t = i18n.t) {
  return PROJECT_EMOJIS.map((option) => ({
    ...option,
    label: t(PROJECT_EMOJIS_LABEL_KEYS[option.emoji as keyof typeof PROJECT_EMOJIS_LABEL_KEYS]),
  }));
}
