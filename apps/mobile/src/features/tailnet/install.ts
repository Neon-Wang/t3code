import { AppRegistry } from "react-native";
import { createTailnetFetch } from "./transport";
import { routeTailnetUrl, tailnetNative } from "./native";

// runtime.ts captures fetch at module initialization. Install before importing
// App so authorization continues to sign original URLs, then transport routes
// only the resulting request. Public internet and LAN URLs pass through.
if (tailnetNative) {
  // Native service owns termination; no polling or duplicate connection runtime.
  AppRegistry.registerHeadlessTask(
    "T3BackgroundConnection",
    () => () => new Promise<void>(() => {}),
  );
  globalThis.fetch = createTailnetFetch(globalThis.fetch, routeTailnetUrl);
  const OriginalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends OriginalWebSocket {
    constructor(...args: ConstructorParameters<typeof OriginalWebSocket>) {
      args[0] = routeTailnetUrl(String(args[0]));
      super(...args);
    }
  };
}
