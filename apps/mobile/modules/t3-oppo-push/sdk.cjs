const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const archiveUrl =
  "https://openfs.oppomobile.com/open/oop/202208/04/7ae060f5ac26e907d6e28a03ce095316.zip";
const archiveSha256 = "83723ea7e580e1d103a0b0c72ac7eeeece3bbb41b86a9d0cf5e11880c2e186c3";
const aarSha256 = "bfd102f664ea825059a2aa618eb9aec75f6ce6bd54baa723b1ed9015a6564180";
const aarName = "com.heytap.msp_3.1.0.aar";
const aarPath = join(__dirname, "libs", aarName);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const verified = () => existsSync(aarPath) && sha256(readFileSync(aarPath)) === aarSha256;
module.exports = { archiveUrl, archiveSha256, aarSha256, aarName, aarPath, sha256, verified };
