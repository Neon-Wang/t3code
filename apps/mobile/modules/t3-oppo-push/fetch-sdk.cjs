const { execFileSync } = require("node:child_process");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const sdk = require("./sdk.cjs");

if (sdk.verified()) {
  console.log("OPPO SDK 3.1.0 is verified.");
} else {
  const temporary = mkdtempSync(join(tmpdir(), "t3-oppo-sdk-"));
  try {
    const archive = join(temporary, "sdk.zip");
    execFileSync("curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "60",
      sdk.archiveUrl,
      "--output",
      archive,
    ]);
    if (sdk.sha256(readFileSync(archive)) !== sdk.archiveSha256)
      throw new Error("OPPO SDK archive checksum mismatch.");
    const aar = execFileSync("unzip", ["-p", archive, sdk.aarName]);
    if (sdk.sha256(aar) !== sdk.aarSha256) throw new Error("OPPO SDK AAR checksum mismatch.");
    mkdirSync(dirname(sdk.aarPath), { recursive: true });
    writeFileSync(`${sdk.aarPath}.tmp`, aar);
    renameSync(`${sdk.aarPath}.tmp`, sdk.aarPath);
    console.log("OPPO SDK 3.1.0 downloaded and verified.");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
