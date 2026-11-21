const { withSettingsGradle } = require("expo/config-plugins");
const { execFileSync } = require("node:child_process");
const { aarSha256, verified } = require("../modules/t3-oppo-push/sdk.cjs");

module.exports = function withOppoPush(config) {
  return withSettingsGradle(config, (next) => {
    if (
      process.env.T3CODE_ANDROID_OPPO_APP_KEY?.trim() &&
      process.env.T3CODE_ANDROID_OPPO_APP_SECRET?.trim() &&
      !verified()
    ) {
      execFileSync(process.execPath, [require.resolve("../modules/t3-oppo-push/fetch-sdk.cjs")], {
        stdio: "inherit",
      });
    }
    const marker = "// T3 OPPO push autolinking";
    if (next.modResults.contents.includes(marker)) return next;
    const anchor = "expoAutolinking.useExpoModules()";
    if (!next.modResults.contents.includes(anchor))
      throw new Error("Expo autolinking entry not found.");
    next.modResults.contents = next.modResults.contents.replace(
      anchor,
      `${marker}
def t3OppoAar = new File(settingsDir, '../modules/t3-oppo-push/libs/com.heytap.msp_3.1.0.aar')
def t3OppoEnabled = System.getenv('T3CODE_ANDROID_OPPO_APP_KEY')?.trim() &&
    System.getenv('T3CODE_ANDROID_OPPO_APP_SECRET')?.trim() && t3OppoAar.isFile() &&
    java.security.MessageDigest.getInstance('SHA-256').digest(t3OppoAar.bytes).encodeHex().toString() == '${aarSha256}'
if (!t3OppoEnabled) {
  expoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ['t3-oppo-push']
}
${anchor}`,
    );
    return next;
  });
};
