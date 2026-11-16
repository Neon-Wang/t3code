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
for (const appearance of ["light", "dark"]) {
  const variables = getMobileThemeVariables("t3-chat", appearance);
  const colors = Object.entries(variables).map(([name, value]) => ({
    name: name.replace(/^--color-/, "").replaceAll("-", "_"),
    value: arkColor(value),
  }));
  for (const [name, values] of Object.entries(threadColors)) {
    colors.push({ name: `thread_color_${name}`, value: arkColor(values[appearance]) });
    colors.push({ name: `thread_swatch_${name}`, value: arkColor(values.swatch) });
  }
  colors.push({ name: "start_window_background", value: arkColor(variables["--color-screen"]) });
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
