import * as NodeFSP from "node:fs/promises";
import { providerClients } from "../../../packages/client-runtime/src/providerClients.ts";

// The mobile component owns the Claude and Codex glyphs; other glyphs come from its registry.
const source = await NodeFSP.readFile(
  new URL("../../../apps/mobile/src/components/ProviderIcon.tsx", import.meta.url),
  "utf8",
);
const claude = source.match(/viewBox="0 0 256 257"[\s\S]*?<Path\s+fill="([^"]+)"\s+d="([^"]+)"/);
const codex = source.match(/viewBox="100 100 411 411"[\s\S]*?d="([^"]+)"/);
const icons = {
  claudeAgent: {
    viewBox: "0 0 256 257",
    fill: { light: claude[1], dark: claude[1] },
    paths: [{ d: claude[2] }],
  },
  codex: {
    viewBox: "100 100 411 411",
    fill: { light: "#171717", dark: "#e5e5e5" },
    paths: [{ d: codex[1], fillRule: "evenodd" }],
  },
};
for (const client of providerClients.definitions)
  if (client.icon) icons[client.driverKind] = client.icon;
for (const mode of ["light", "dark"]) {
  const dir = new URL(
    `../entry/src/main/resources/${mode === "light" ? "base" : "dark"}/media/`,
    import.meta.url,
  );
  await NodeFSP.mkdir(dir, { recursive: true });
  for (const [name, icon] of Object.entries(icons)) {
    const gradients = icon.paths
      .map((path, i) =>
        path.gradient
          ? `<linearGradient id="g${i}" x1="${path.gradient.x1}" y1="${path.gradient.y1}" x2="${path.gradient.x2}" y2="${path.gradient.y2}" gradientUnits="userSpaceOnUse">${path.gradient.stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join("")}</linearGradient>`
          : "",
      )
      .join("");
    const paths = icon.paths
      .map(
        (path, i) =>
          `<path d="${path.d}" fill="${path.gradient ? `url(#g${i})` : (path.fill ?? icon.fill)[mode]}" fill-rule="${path.fillRule ?? "nonzero"}"/>`,
      )
      .join("");
    await NodeFSP.writeFile(
      new URL(`provider_${name.toLowerCase()}.svg`, dir),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="none"><defs>${gradients}</defs>${paths}</svg>\n`,
    );
  }
}
await NodeFSP.copyFile(
  new URL("../../../apps/mobile/assets/antigravity.png", import.meta.url),
  new URL("../entry/src/main/resources/base/media/provider_antigravity.png", import.meta.url),
);
