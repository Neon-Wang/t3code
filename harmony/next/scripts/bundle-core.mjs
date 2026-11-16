import * as NodeModule from "node:module";
import * as NodeURL from "node:url";
import * as NodeFSP from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
const require = NodeModule.createRequire(new URL("scripts/package.json", root));
const { build } = require("esbuild");
const output = new URL("../entry/src/main/ets/generated/", import.meta.url);
await NodeFSP.mkdir(output, { recursive: true });
const result = await build({
  absWorkingDir: NodeURL.fileURLToPath(root),
  entryPoints: [NodeURL.fileURLToPath(new URL("../runtime/core.js", import.meta.url))],
  outfile: NodeURL.fileURLToPath(new URL("core.js", output)),
  bundle: true,
  metafile: true,
  format: "esm",
  platform: "browser",
  target: "es2021",
  external: ["@ohos.*"],
  nodePaths: [
    NodeURL.fileURLToPath(new URL("packages/client-runtime/node_modules", root)),
    NodeURL.fileURLToPath(new URL("apps/mobile/node_modules", root)),
  ],
  logLevel: "info",
});
console.info(`JS bundle: ${(await NodeFSP.stat(new URL("core.js", output))).size} bytes`);

await NodeFSP.copyFile(
  new URL("../runtime/core.d.ts", import.meta.url),
  new URL("core.d.ts", output),
);

const inputs = Object.keys(result.metafile.inputs);
const nativeInputs = inputs.filter((path) =>
  /node_modules\/(?:react|react-native|expo)(?:\/|-)/.test(path),
);
if (nativeInputs.length > 0)
  throw new Error(`Native framework dependencies in Harmony bundle: ${nativeInputs.join(", ")}`);
await NodeFSP.writeFile(new URL("inputs.json", output), JSON.stringify(inputs, null, 2));
