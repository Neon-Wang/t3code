const { withMainApplication } = require("expo/config-plugins");

module.exports = function withAndroidTailnetDirectProxy(config) {
  return withMainApplication(config, (nextConfig) => {
    const call = "expo.modules.t3tailnet.TailnetLoopbackProxy.install()";
    const contents = nextConfig.modResults.contents;
    if (contents.includes(call)) return nextConfig;
    if (nextConfig.modResults.language !== "kt" || !contents.includes("super.onCreate()")) {
      throw new Error("Tailnet proxy policy requires the Kotlin Application startup hook.");
    }
    // OkHttp clients capture their ProxySelector at construction. Install before
    // React Native and Expo create clients, not just when the module is requested.
    nextConfig.modResults.contents = contents.replace(
      "super.onCreate()",
      `super.onCreate()\n    ${call}`,
    );
    return nextConfig;
  });
};
