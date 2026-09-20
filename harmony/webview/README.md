# T3 Code on HarmonyOS via ArkWeb

The desktop web client, bundled into a HAP and hosted in an ArkWeb `Web`
component. No native reimplementation: this ships the exact `apps/web` build the
desktop app ships, and connects to a remote T3 server the same way
`app.t3.codes` does. Distinct from `harmony/app`, which is a native ArkUI port.

## Why it works at all

Three engine constraints shape the whole design, and two of them cancel out:

- The client needs **WebCrypto** for the DPoP proof on the websocket-ticket
  exchange, and WebCrypto only exists in a secure context.
- A secure (`https`) page may **not** open a plain `ws://` socket. The engine
  blocks it outright; `mixedMode` does not cover WebSocket.
- Every T3 server on a LAN or a tailnet speaks plain `http`/`ws`.

An `https://` origin satisfies the first and fails the second; an `http://`
origin does the reverse. The way out is the one the desktop app already uses: a
**custom scheme registered as standard + secure** (`t3code://app`). It is a
secure context, so WebCrypto is present, and it is not on the engine's
mixed-content-restricted list, so `ws://` is still allowed. Registered in
`EntryAbility.onCreate` via `webview.WebviewController.customizeSchemes`, which
has to run before the first `Web` component is built.

`onInterceptRequest` then serves the bundle from that origin out of `rawfile`,
so Vite's absolute asset paths and TanStack Router's browser history both work
unmodified. Requests to a real server fall through to the network.

## Build

```sh
bash harmony/webview/scripts/build-hap.sh
```

The bundle under `entry/src/main/resources/rawfile/web` must be built with
`VITE_HOSTED_APP_CHANNEL=latest`, which puts the client in the same
hosted-static mode `app.t3.codes` runs in — it then asks for a pairing link
instead of assuming a same-origin server. Refresh it with:

```sh
(cd apps/web && VITE_HOSTED_APP_CHANNEL=latest vp build)
rsync -a --delete apps/web/dist/ harmony/webview/entry/src/main/resources/rawfile/web/
find harmony/webview/entry/src/main/resources/rawfile/web -name '*.map' -delete
```

Dropping the source maps takes the payload from 89 MB to 33 MB.

Install the unsigned HAP with `hdc install -r`, then launch bundle
`codes.t3.webview`, ability `EntryAbility`. Emulators accept unsigned HAPs; a
physical device needs a signing profile.

## Engine workarounds

Both live in `Index.ets` with the reasoning next to them:

- **`navigator.onLine`** answers from the wlan/cellular route alone, so ethernet
  or an emulator behind NAT reads as offline and the connection supervisor never
  dials. The getter reads `connection.hasDefaultNetSync()` instead, pushed in
  from ArkTS and kept current by a NetConnection subscription, so a genuine
  outage still reaches the client.
- **`color-mix()` miscomputes an `oklch()` argument carrying a `none`
  component** — `color-mix(in srgb, oklch(14.5% 0 none) 97%, #fff)` returns pure
  blue rather than near-black. Tailwind writes its achromatic palette with an
  omitted hue, dark mode derives `--card` and `--surface-raised` from it, and the
  composer's glass layer rendered as a solid blue slab. Chroma is 0 there, so
  the four affected tokens are pinned to an explicit hue of 0.

## Known limits

- Nothing provides `window.desktopBridge`, so the client takes its browser path:
  client settings live in the webview's localStorage, and desktop-only surfaces
  (native menus, context menus, window controls) are absent.
- **The Browser surface stays disabled.** It is gated on
  `window.desktopBridge?.preview` and is built on Electron's `<webview>` tag —
  `getWebContentsId`, `executeJavaScript`, partitions, preload — behind roughly
  10k lines of desktop-side code. Supplying the bridge is also not free: the
  client derives `isElectron` from `window.desktopBridge` existing at all, so a
  partial bridge would flip the whole app into desktop mode. Lighting it up
  needs a capability-based check in `apps/web` plus a nested ArkWeb `Web` the
  client can position.
- Untested on a physical device.
