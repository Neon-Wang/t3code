import { webview } from '@kit.ArkWeb';
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
  private platformShim: string = "(function(){" +
    "try{Object.defineProperty(Navigator.prototype,'onLine',{get:function(){return true},configurable:true});}" +
    "catch(e){try{Object.defineProperty(navigator,'onLine',{get:function(){return true},configurable:true});}catch(e2){}}" +
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
