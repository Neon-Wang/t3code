import type { ThreadColor } from "@t3tools/contracts";

export const threadColors = {
  red: { light: "#ef44441f", dark: "#f8717129", swatch: "#ef4444" },
  orange: { light: "#f973161f", dark: "#fb923c29", swatch: "#f97316" },
  yellow: { light: "#eab3081f", dark: "#facc1529", swatch: "#eab308" },
  green: { light: "#22c55e1f", dark: "#4ade8029", swatch: "#22c55e" },
  teal: { light: "#14b8a61f", dark: "#2dd4bf29", swatch: "#14b8a6" },
  blue: { light: "#3b82f61f", dark: "#60a5fa29", swatch: "#3b82f6" },
  purple: { light: "#a855f71f", dark: "#c084fc29", swatch: "#a855f7" },
  gray: { light: "#64748b1f", dark: "#94a3b829", swatch: "#64748b" },
} satisfies Record<ThreadColor, { light: string; dark: string; swatch: string }>;
