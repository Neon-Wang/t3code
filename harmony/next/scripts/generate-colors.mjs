import * as NodeFSP from "node:fs/promises";
import { getMobileThemeVariables } from "../../../apps/mobile/src/lib/mobileTheme.ts";
import { threadColors } from "../../../apps/mobile/src/features/threads/thread-colors.ts";

function arkColor(value) {
  if (/^#[a-f\d]{6}$/i.test(value)) return value;
  if (/^#[a-f\d]{8}$/i.test(value)) return `#${value.slice(7)}${value.slice(1, 7)}`;
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (!rgba) throw new Error(`Unsupported theme color: ${value}`);
  return `#${[Math.round(Number(rgba[4]) * 255), ...rgba.slice(1, 4).map(Number)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
// [light, dark] colors the Android client draws outside the theme variables: Tailwind's adaptive
// status classes in thread-list-v2-items.tsx, and the Material navigation bar and app bar
// backdrop as rendered on the Android emulator.
const androidColors = {
  status_input: ["#4f46e5", "#a5b4fc"],
  status_working: ["#0284c7", "#38bdf8"],
  status_done: ["#047857", "#6ee7b7"],
  status_request: ["#c026d3", "#f0abfc"],
  app_bar: ["#f6f6f7", "#191919"],
  tab_bar: ["#eeeeef", "#292929"],
  tab_indicator: ["#cbcbcb", "#4d4d4d"],
  // Material 3 error and onError, which the navigation bar badge uses.
  tab_badge: ["#b3261e", "#f2b8b5"],
  tab_badge_foreground: ["#ffffff", "#601410"],
};
// Tailwind 500 shades behind lib/projectIcon.ts; monograms draw on the same color at 15%.
const projectIconColors = {
  gray: "#6b7280",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};
for (const appearance of ["light", "dark"]) {
  const variables = getMobileThemeVariables("t3-code", appearance);
  const colors = Object.entries(variables).map(([name, value]) => ({
    name: name.replace(/^--color-/, "").replaceAll("-", "_"),
    value: arkColor(value),
  }));
  for (const [name, values] of Object.entries(threadColors)) {
    colors.push({ name: `thread_color_${name}`, value: arkColor(values[appearance]) });
    colors.push({ name: `thread_swatch_${name}`, value: arkColor(values.swatch) });
  }
  colors.push({ name: "start_window_background", value: arkColor(variables["--color-screen"]) });
  for (const [name, values] of Object.entries(androidColors))
    colors.push({ name, value: values[appearance === "light" ? 0 : 1] });
  for (const [name, value] of Object.entries(projectIconColors)) {
    colors.push({ name: `project_icon_${name}`, value });
    colors.push({ name: `project_icon_${name}_surface`, value: `#26${value.slice(1)}` });
  }
  const directory = new URL(
    `../entry/src/main/resources/${appearance === "light" ? "base" : "dark"}/element/`,
    import.meta.url,
  );
  await NodeFSP.mkdir(directory, { recursive: true });
  await NodeFSP.writeFile(
    new URL("color.json", directory),
    `${JSON.stringify({ color: colors }, null, 2)}\n`,
  );
}
