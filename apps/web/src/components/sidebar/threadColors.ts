import type { ThreadColor } from "@t3tools/contracts";
import type { CSSProperties } from "react";

const threadColors = {
  red: { light: "#ef44441f", dark: "#f8717129" },
  orange: { light: "#f973161f", dark: "#fb923c29" },
  yellow: { light: "#eab3081f", dark: "#facc1529" },
  green: { light: "#22c55e1f", dark: "#4ade8029" },
  teal: { light: "#14b8a61f", dark: "#2dd4bf29" },
  blue: { light: "#3b82f61f", dark: "#60a5fa29" },
  purple: { light: "#a855f71f", dark: "#c084fc29" },
  gray: { light: "#64748b1f", dark: "#94a3b829" },
} satisfies Record<ThreadColor, { light: string; dark: string }>;

export function threadColorStyle(color: ThreadColor | null | undefined): CSSProperties | undefined {
  if (color == null) return undefined;
  return {
    "--thread-color-light": threadColors[color].light,
    "--thread-color-dark": threadColors[color].dark,
    backgroundImage: "linear-gradient(var(--thread-color-tint), var(--thread-color-tint))",
  } as CSSProperties;
}
