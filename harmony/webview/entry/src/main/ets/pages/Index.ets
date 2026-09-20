import { webview } from '@kit.ArkWeb';
import { connection } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

/**
 * The bundled web client is served from a synthetic https origin rather than
 * `resource://rawfile/`. Vite emits absolute asset paths, TanStack Router uses
 * browser history, and localStorage needs a stable origin — all three want a
 * real http(s) origin, and none of them work off a custom scheme. Intercepting
 * one keeps `apps/web` unmodified: the same bundle the desktop app ships runs
 * here untouched.
 */
// Registered in EntryAbility as a standard + secure scheme: secure enough for
// WebCrypto, not https enough to trigger mixed-content blocking on ws://.
const APP_ORIGIN = 't3code://app';
const RAWFILE_ROOT = 'web';

const MIME_TYPES: Record<string, string> = {
  'html': 'text/html',
  'js': 'application/javascript',
  'mjs': 'application/javascript',
  'css': 'text/css',
  'json': 'application/json',
  'webmanifest': 'application/manifest+json',
  'svg': 'image/svg+xml',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'webp': 'image/webp',
  'ico': 'image/x-icon',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'map': 'application/json',
  'wasm': 'application/wasm'
};

function mimeTypeOf(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) {
    return 'application/octet-stream';
  }
  const ext = path.substring(dot + 1).toLowerCase();
  const mime = MIME_TYPES[ext];
  return mime !== undefined ? mime : 'application/octet-stream';
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private netConnection: connection.NetConnection | null = null;
  private controllerReady: boolean = false;

  /**
   * Mirrors the system's connectivity onto the page. `hasDefaultNetSync` covers
   * every transport, unlike the engine's wlan-only `navigator.onLine`.
   */
  private pushOnlineState(): void {
    if (!this.controllerReady) {
      return;
    }
    let online = true;
    try {
      online = connection.hasDefaultNetSync();
    } catch (error) {
      // Treat an unavailable answer as online: the client's own connection
      // attempt is a better probe than refusing to make one.
      hilog.warn(0x0000, 'T3CodeWeb', 'hasDefaultNetSync failed, assuming online');
    }
    try {
      this.controller.runJavaScript(
        `window.__t3SetOnline && window.__t3SetOnline(${online ? 'true' : 'false'})`
      );
    } catch (error) {
      hilog.warn(0x0000, 'T3CodeWeb', 'could not push online state');
    }
  }

  aboutToAppear(): void {
    try {
      const netConnection = connection.createNetConnection();
      netConnection.on('netAvailable', () => this.pushOnlineState());
      netConnection.on('netLost', () => this.pushOnlineState());
      netConnection.on('netUnavailable', () => this.pushOnlineState());
      netConnection.register((error) => {
        if (error) {
          hilog.warn(0x0000, 'T3CodeWeb', 'net connection register failed');
        }
      });
      this.netConnection = netConnection;
    } catch (error) {
      hilog.warn(0x0000, 'T3CodeWeb', 'network subscription unavailable');
    }
  }

  aboutToDisappear(): void {
    const netConnection = this.netConnection;
    if (netConnection) {
      netConnection.unregister(() => {});
      this.netConnection = null;
    }
  }

  // Installed before the bundle's first module runs; wrapping fetch from
  // onPageEnd is too late to see the connection handshake.
  /**
   * Platform shim, injected before the bundle's first module runs.
   *
   * ArkWeb reports `navigator.onLine === false` whenever the device has no
   * wlan/cellular route, which is the normal state of an emulator on NAT and of
   * any tablet on ethernet alone. The client maps that straight to a network
   * status of "offline" (apps/web/src/connection/platform.ts) and its
   * connection supervisor then refuses to dial at all — so a reachable server
   * sits at "Offline" forever while HTTP and WebSocket both work fine.
   *
   * Reporting online unconditionally gives the supervisor back its own
   * judgement: a real outage now surfaces as a failed connection and the
   * existing retry/backoff handles it, which is what the native mobile clients
   * do anyway. Belongs here rather than in apps/web — it is an engine quirk,
   * not a client bug.
   */
  /**
   * Platform shim, injected before the bundle's first module runs.
   *
   * ArkWeb answers `navigator.onLine` from the wlan/cellular route alone, so a
   * device on ethernet -- or an emulator behind NAT -- reports offline while
   * the network works fine. The client maps that straight to a network status
   * of "offline" (apps/web/src/connection/platform.ts) and its connection
   * supervisor then refuses to dial at all, leaving a reachable server stuck at
   * "Offline" with no request ever attempted.
   *
   * So the getter reads the system's own answer instead, pushed in from ArkTS
   * and kept current by a NetConnection subscription. A real outage still
   * reaches the client and its existing retry/backoff. Optimistic until the
   * first push, so a read during boot cannot lose the first attempt.
   */
  private platformShim: string = "(function(){" +
    "if(window.__t3Online===undefined){window.__t3Online=true;}" +
    "var define=function(target){try{Object.defineProperty(target,'onLine'," +
    "{get:function(){return window.__t3Online!==false;},configurable:true});return true;}catch(e){return false;}};" +
    "if(!define(Navigator.prototype)){define(navigator);}" +
    "window.__t3SetOnline=function(value){var next=(value===true);" +
    "if(window.__t3Online===next)return;window.__t3Online=next;" +
    "window.dispatchEvent(new Event(next?'online':'offline'));};" +
    // color-mix() miscomputes an oklch() argument that carries a `none`
    // component: color-mix(in srgb, oklch(14.5% 0 none) 97%, #fff) comes out
    // pure blue rather than near-black. Tailwind writes its achromatic palette
    // with an omitted hue, dark mode derives --card and --surface-raised from
    // it, and the composer's glass layer rendered as a solid blue slab; light
    // mode uses a plain colour and was unaffected. Chroma is 0 on these, so an
    // explicit hue of 0 is the same colour on a correct engine. Set inline on
    // :root so it outranks the stylesheet without racing it.
    "var achromatic={'--color-neutral-100':'oklch(97% 0 0)'," +
    "'--color-neutral-500':'oklch(55.6% 0 0)'," +
    "'--color-neutral-950':'oklch(14.5% 0 0)'," +
    "'--color-zinc-50':'oklch(98.5% 0 0)'};" +
    "var pinHues=function(){var root=document.documentElement;if(!root)return false;" +
    "for(var name in achromatic){root.style.setProperty(name,achromatic[name]);}return true;};" +
    "if(!pinHues()){document.addEventListener('DOMContentLoaded',pinHues);}" +
    "})()";


  build() {
    Column() {
      Web({ src: APP_ORIGIN + '/', controller: this.controller })
        .javaScriptOnDocumentStart([{ script: this.platformShim, scriptRules: ['*'] }])
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .javaScriptAccess(true)
        .imageAccess(true)
        .mixedMode(MixedMode.All)
        .geolocationAccess(false)
        .width('100%')
        .height('100%')
        .onControllerAttached(() => {
          this.controllerReady = true;
          this.pushOnlineState();
          try {
            this.controller.setCustomUserAgent(
              this.controller.getUserAgent() + ' T3CodeHarmony/0.1.0'
            );
          } catch (error) {
            hilog.warn(0x0000, 'T3CodeWeb', 'user agent not set');
          }
        })
        .onInterceptRequest((event) => {
          if (event === undefined) {
            return null;
          }
          const url = event.request.getRequestUrl();
          if (!url.startsWith(APP_ORIGIN)) {
            // Everything aimed at a real T3 server goes out over the network
            // untouched; only our own origin is served from the bundle.
            return null;
          }

          let path = url.substring(APP_ORIGIN.length);
          const queryAt = path.indexOf('?');
          if (queryAt >= 0) {
            path = path.substring(0, queryAt);
          }
          const hashAt = path.indexOf('#');
          if (hashAt >= 0) {
            path = path.substring(0, hashAt);
          }
          if (path.startsWith('/')) {
            path = path.substring(1);
          }
          if (path.length === 0) {
            path = 'index.html';
          }

          const response = new WebResourceResponse();
          const resourceManager = getContext(this).resourceManager;

          let data: Uint8Array | null = null;
          let servedPath = path;
          try {
            data = resourceManager.getRawFileContentSync(RAWFILE_ROOT + '/' + path);
          } catch (error) {
            // A SPA deep link is not a file, so fall back to the shell and let
            // the router resolve it. An asset request is not a route, though:
            // answering a missing .js or an /api call with HTML turns a 404
            // into a parse error somewhere far from the cause.
            if (path.indexOf('.') >= 0 || path.startsWith('api/') || path.startsWith('ws')) {
              hilog.error(0x0000, 'T3CodeWeb', 'rawfile miss: %{public}s', path);
              return null;
            }
            try {
              servedPath = 'index.html';
              data = resourceManager.getRawFileContentSync(RAWFILE_ROOT + '/index.html');
            } catch (innerError) {
              hilog.error(0x0000, 'T3CodeWeb', 'rawfile miss: %{public}s', path);
              return null;
            }
          }

          response.setResponseData(data.buffer as ArrayBuffer);
          response.setResponseEncoding('utf-8');
          response.setResponseMimeType(mimeTypeOf(servedPath));
          response.setResponseCode(200);
          response.setReasonMessage('OK');
          response.setResponseHeader([
            { headerKey: 'Access-Control-Allow-Origin', headerValue: '*' },
            { headerKey: 'Cache-Control', headerValue: 'no-cache' }
          ]);
          response.setResponseIsReady(true);
          return response;
        })
        .onConsole((event) => {
          if (event) {
            hilog.info(0x0000, 'T3CodeWeb', 'console: %{public}s', event.message.getMessage());
          }
          return false;
        })
        .onPageEnd((event) => {
          hilog.info(0x0000, 'T3CodeWeb', 'page loaded: %{public}s', event ? event.url : '');
          this.pushOnlineState();

        })
        .onErrorReceive((event) => {
          if (event) {
            hilog.error(0x0000, 'T3CodeWeb', 'web error %{public}s for %{public}s',
              event.error.getErrorInfo(), event.request.getRequestUrl());
          }
        })
    }
    .width('100%')
    .height('100%')
  }
}
