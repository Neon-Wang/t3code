# T3 Code for HarmonyOS

An experimental ArkUI client for T3 Code. This is an unfinished native port,
not a feature-complete equivalent of the iOS client or a production release.
The app, Swift compatibility layer, native bridge and focused tests live here.

## Build and run

The app requires DevEco Studio and its bundled HarmonyOS SDK. The current
project configuration targets HarmonyOS 6.1 (API 23), with a compatible version
of HarmonyOS 5.0 (API 12). It has been installed on a nova 12 Pro running API 24.

```sh
cp harmony/app/build-profile.example.json5 harmony/app/build-profile.json5
```

Open `harmony/app` in DevEco Studio. For a physical device, sign into your Huawei
developer account and generate a signing profile containing that device. Assign
that signing configuration to the `default` product. The local build profile is
ignored by Git; never commit signing passwords, certificates or private keys.

On macOS:

```sh
bash harmony/app/scripts/build-hap.sh
```

Set `DEVECO_STUDIO_HOME` to the installation's `Contents` directory if DevEco is
not at `/Applications/DevEco-Studio.app`. The script installs the local NAPI type
dependency and runs `assembleHap`. Without a signing configuration it produces
an unsigned HAP. Signed output is normally
`harmony/app/entry/build/default/outputs/default/entry-default-signed.hap`.

Install with the SDK's `hdc install <hap>` and launch bundle `codes.t3.harmony`,
ability `EntryAbility`. Use a fresh pairing token for this client. Enter the
existing environment's full HTTP(S) origin and its pairing token on the login
page. A Tailscale peer address is a valid origin when the phone's VPN is active.
Tailscale Serve is optional; it is distinct from basic tailnet connectivity.

## Verification

```sh
node --test harmony/tests/*.test.mjs
swift run --package-path harmony T3TestRunner
node harmony/tools/sync-upstream.mjs --check
```

The Node tests run the actual non-UI ArkTS sources with test replacements for
platform networking/native loading. They cover RPC framing, stream ACKs,
disconnect failures, OAuth form fields, fresh tickets, snapshots/deltas, turn
commands, checkpoint counts and diff rows. They do not replace ArkTS compilation
or device testing.

The Swift runner exercises module registration, attributed text storage,
composer creation, diff display-list rendering and interactions, and terminal
size estimation without an engine. macOS class-cluster initialization is handled
separately from corelibs Foundation. A green host run does not validate the
cross-compiled binaries bundled with the app.

## Implementation boundaries

- `app/entry/src/main/ets/connection`: Effect JSON RPC transport, OAuth bootstrap,
  direct connections and the unfinished SSH path.
- `app/entry/src/main/ets/model`: shell/thread projections and unified diff rows.
- `app/entry/src/main/ets/pages`: the current connection, task, diff and terminal UI.
- `swift/`: Apple framework compatibility models, generic bridge and C ABI.
- `vendor/swift/`: 11 transformed upstream Swift source files across four modules.
- `napi/`: native bridge and experimental cross-build scripts.
- `app/entry/libs` and `app/entry/src/main/cpp/prebuilt`: inherited arm64 binary
  artifacts used for device packaging. Their presence is not proof that the
  native source build is currently reproducible.

The vendor manifest pins upstream commit
`85b656ff300f71060ad6305c7e1e29a72b442ce9`. The sync script reads the current checkout;
`--check` checks those local sources, not the latest remote branch. Updating
vendor does not port React Native features or shared client-runtime changes.

## Known limitations

Direct authentication, task-list loading and existing message history have been
observed on a physical device. Protocol smoke testing against a real T3 server
also passes. Full send/stream/reconnect behavior is not yet device-validated.

The diff page now requests real checkpoint diffs and translates them to the Swift
row contract, but this path still needs device validation. The terminal page is
not operational: real PTY output/input and the Ghostty engine must be integrated.
The SSH path is also unfinished: the SSH library is not packaged, the build
script's library names do not match the app, and host-key verification is missing.

The UI is a prototype. It lacks much of the iOS client's task management,
approvals/questions, rich messages/tool logs, attachments, file browsing, settings,
persistent drafts and connection recovery. It also needs a substantial ArkUI
native navigation/component pass; changing colors alone is not sufficient.

Before updating the Swift vendor, adapt the compatibility APIs for the newer
Ghostty clipboard callback and `UTType.svg`. The current shims do not compile
against those upstream changes. The OHOS Swift toolchain is not supplied here;
`napi/build-ohos.sh` is experimental and is not the supported HAP packaging path.

Use the upstream iOS client in an iOS Simulator as the behavior reference, and
verify the corresponding Harmony flows on a physical device. Do not substitute
mock results, host-only tests, or an empty screen for this acceptance work.
