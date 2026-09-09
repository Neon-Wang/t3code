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

After a successful direct or SSH connection, the app saves its access credential in
HarmonyOS's secure asset store, available while the phone is unlocked and excluded
from synchronization. Relaunching restores the most recently used connection.
Disconnecting keeps it in the saved connections list; use Forget to remove the
local credential and require pairing again. SSH connections additionally save the
password in the secure asset store and reconnect to the saved remote service port,
checking the host fingerprint and environment identity. Direct and SSH access to
the same environment remain separate saved connections.

Pending question answers remain available when navigating away from a task and
back during the same app session. They are cleared when the request is resolved.

In a new or existing task, type `@` followed by part of a project path to find
files and directories. Select a result to insert a Markdown file link in the
draft. Changing the new task’s project clears the previous search results.
The file browser also accepts separate search words and ordered abbreviations,
for example `cht hdr` for `ChatHeader.tsx`.
When reading a file, copy its relative path or displayed text directly from the
file page. Truncated previews label the copy action accordingly.
Source text includes line numbers; wrapped continuations keep the original line
number. Selecting and copying across lines excludes the gutter.
File links with `#L120`, `#L120C3`, or `:120:3` open and mark that source line.
Positions past the end open the final line; Markdown line links open source view.

The composer shows its machine, branch, model, reasoning effort (when supported),
permissions, and execution/plan mode. Open a selector to search models or choose
from the provider's supported options. Existing-task choices save immediately
without sending the draft. Selecting the current model preserves its options;
switching models uses the new model's defaults. Restore default clears only that
option's explicit value. Runtime choices include supervised, auto-accept edits,
auto, and full access; actual approval behavior depends on the provider.

New tasks open in a bottom sheet. Choose a project, then use the execution-location
selector to run locally or create a new worktree from the selected base branch.
The worktree is created when sending the first message; its identity is saved so
retrying after a lost acknowledgment can recover the existing directory.
In local mode, choosing a branch with an existing worktree uses that directory;
choosing another local branch switches the project checkout before creating the task. Switching branches in an existing idle task updates its working
directory. A checkout conflict is shown without creating or sending a new task.
Machine selection saves the current draft first. New-task drafts are restored
separately for each machine; an existing conversation returns to the selected
machine's task list. Files, Diff, and Terminal are in the conversation's tool menu.

Completed responses keep their final answer visible and fold the preceding process
under the elapsed-time row. Expand it to review grouped tool calls, then expand
individual calls for their output. Long-press a message to copy its text.

The task composer expands while editing and collapses when focus leaves it without
discarding the draft. Compact permission and execution icons open the same controls.
The task composer supports multiple lines. Return inserts a newline. Use Send
or Ctrl+Enter on a hardware keyboard to submit; Ctrl+Enter also creates and
sends a new task from its message field.

Existing-task drafts are saved privately on the device, separately for each
environment and task. Save failures appear beside the draft; keep the page open
and retry if saving fails.
Selected images keep the filename supplied by the system picker when their
drafts are restored and uploaded; older drafts without a name use a MIME-based
default filename. HEIC/HEIF images are converted to JPEG before being stored in
the draft; the resulting image must fit within the 10 MB upload limit. Supported
JPEG, PNG, GIF, and WebP originals are copied without transcoding.
The task list and message feed reconnect after a lost socket; sending and task
changes remain disabled until a fresh snapshot arrives. Pending commands are
not automatically replayed.

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

## Rebuilding the Swift bridge (experimental arm64 path)

`napi/build-swift-bridge.py` builds the Swift/NAPI bridge separately from SSH and
Ghostty. Use the matching official Swift 6.3.3 toolchain and static Linux SDK,
plus DevEco's OpenHarmony native SDK. On macOS, finish Xcode's license and first
launch setup first: SwiftPM also uses the host SDK when compiling its manifest.
Extract the Swift toolchain and SDK locally; no global toolchain switch is needed.

```sh
python3 harmony/napi/build-swift-bridge.py \
  --toolchain /path/to/swift-toolchain \
  --sdks /path/to/directory-containing-artifactbundle \
  --ohos-native /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native \
  --output /tmp/t3-swift-bridge
```

The toolchain directory contains `usr/bin`; the SDK directory contains
`swift-6.3.3-RELEASE_static-linux-0.1.0.artifactbundle`. Obtain both from
[Swift's official installation instructions](https://www.swift.org/install/macos/).
The official SDK archive SHA-256 is
`87c3eaf908e67c0e13a84367119e12273cec1d2cd3d81f7d74bb36722d6b607b`.

This is an experimental adaptation of the static Linux runtime to OHOS libc,
not an official Swift OHOS SDK. The script has built from an empty output directory, and that library has
registered native modules and rendered a Diff frame on nova 12 Pro.
Complete-client and terminal/SSH validation are still outstanding. The narrow libc compatibility
source returns `ENOSYS` for Foundation's unsupported process-directory action.
Native T3 modules currently do not invoke Foundation Process.

Output stays in the supplied build directory. The script never replaces bundled
app libraries or signing configuration. Keep debug symbols in the intermediate
Swift build; the output shared library has debug sections stripped.

The terminal adapter uses the same Ghostty VT C headers as Android. Build it
before packaging the HAP; keep `libghostty-vt.so` beside the generated adapter:

```sh
python3 harmony/napi/build-terminal.py \
  --ohos-native /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native \
  --output harmony/app/entry/libs/arm64-v8a
```

This builds the NAPI adapter only. To rebuild Ghostty itself, use Python 3.12+
and a locally available Linux ARM64 Docker image pinned by its immutable digest:

```sh
python3 harmony/napi/build-ghostty-vt.py /private/tmp/t3-ghostty-build \
  --archives /private/tmp/t3-ghostty-archives \
  --image '<local-linux-arm64-image>@sha256:<digest>' --download
```

The output directory must be new. The archive cache is reusable; omit
`--download` when it already contains the locked archives. Downloads honor the
command's proxy environment. The source revision follows
`native/libghostty-vt/VERSION`, and `ghostty-sources.json` pins every archive by
SHA-256. Containers run without networking, install no packages, and never
start the image's default entrypoint. The build writes shared/static libraries
and headers below `output/`, plus a `build-receipt.json` recording the toolchain,
image and shared-library hash. It does not replace app libraries or signing files.

The script has built from a fresh directory, and that Ghostty library has passed
device theme, paste, size-query and selection checks. Separate clean builds
produced different binary hashes; byte-for-byte reproducibility is not established.

The Markdown parser reuses the hash-pinned Nitro Markdown archive already used
by the iOS client. Its standalone C/C++ parser is built without React Native or
Nitro runtime bindings; extraction retains the upstream license.

```sh
python3 harmony/napi/build-markdown.py \
  --ohos-native /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native \
  --output /tmp/t3-markdown-native
cp /tmp/t3-markdown-native/libt3markdown.so harmony/app/entry/libs/arm64-v8a/
python3 harmony/napi/build-markdown.py --host-test \
  --node-headers /path/to/node/include/node --output /tmp/t3-markdown-host
```

The second command tests the grammar and the NAPI AST adapter on macOS. Omit
`--node-headers` to run only the C++ parser tests. Build and copy this library before packaging the HAP. The ArkUI chat renderer
uses its AST for text styles, lists, code blocks and tables. Native code and table
horizontal scrolling have been exercised on nova 12 Pro; syntax highlighting,
file links and full selection/copy parity remain outstanding.

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
also passes. Message round trips and socket reconnection have device evidence;
long outages and interrupted-command recovery still need verification.

A nova 12 Pro journey created a file through the validation thread, then displayed
its real checkpoint additions and line numbers. Binary and empty-file headers
retain their names, and the Swift C ABI accepts scalar props so dark appearance
applies correctly. Long file titles still clip, and turn/workspace selection and
full review interactions need further work.

The terminal now uses Ghostty and an ArkUI Canvas; PTY input/output, colors,
Chinese text and alternate-screen restoration have device evidence. Drag the terminal to browse scrollback, or use History and Latest to move
between earlier output and the active screen. Closing a terminal requires confirmation and ends that shell and its child
processes. Use Reopen after closing or exiting the shell. Explicit close intent
is retained across pages for the current app session. Use the per-key input
button to connect the system keyboard directly to the PTY; Line mode keeps the
command composer. Physical-device tests cover committed English and Chinese input, Enter,
Backspace, and straight quotes from the English symbol layout. Hardware
keyboard layout coverage and bulk-clipboard edge cases still need verification.
In per-key mode, **Ctrl+V** pastes clipboard text using the terminal's current
bracketed-paste mode. Multiline text pasted through the phone keyboard uses
the same mode; the keyboard's Enter key still sends Enter. Long input is sent
in order; a failed send stops the
remaining input without replaying what may already have reached the shell.
Long-press terminal output to select a word, or tap **Select** and drag across
text. Use **Copy**, **Select all**, or **Cancel** in the selection toolbar.
Copying joins soft-wrapped lines and preserves explicit line breaks. A terminal
resize or history reload clears the selection; drag outside selection mode to
browse history.
The SSH bridge loads on the device. Select **已有服务**, then enter the SSH
host/port, username/password, trusted OpenSSH `SHA256:…` fingerprint, T3 service
port and pairing token. This mode only forwards to the existing service; it
never runs remote launch or pairing commands. **自动启动** retains the separate
remote-script path, whose current T3 CLI compatibility is still unverified.

Control operations and nonblocking forwarding share one native worker. A nova
12 Pro test logged into an isolated SSH server on Studio, forwarded to mint's
existing T3 service, loaded projects/threads and read a fixture file, then
closed all forwarded connections. Repeating login with a fresh pairing token
also succeeded. The fixture was stopped and the saved direct connection
restored. The phone also rejected a deliberately incorrect fingerprint from
mint's actual SSH server before authentication. A further device run restored
the saved SSH connection after force-stopping the app, without re-entering
credentials or pairing. Disconnect closed all four forwarded channels; forgetting
SSH retained the direct connection, which restored on the next cold start.
An additional device run recovered the running session after a 75-second SSH
transport outage without pairing again. Network failures rebuild one shared
tunnel and verify environment identity before requesting tickets; explicitly
disconnecting cancels pending recovery. Direct SSH login to mint and automatic
remote-service launch remain unverified.
`napi/build-ssh-deps.py` now cross-compiles hash-pinned OpenSSL 3.5.8 and
libssh2 1.11.1 static dependencies on macOS using the DevEco native SDK:

```sh
python3 harmony/napi/build-ssh-deps.py \
  --ohos-native /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native \
  --output /private/tmp/t3-ssh-deps
```

Use a fresh output directory. `--archives <directory>` reuses downloaded source
archives with the same hash checks. This builds dependencies only; the SSH NAPI
bridge and successful SSH journeys still need broader real-device validation. Disconnecting
an SSH environment releases the local connection without stopping the remote
server. Invalid launch results fail instead of selecting a fallback port.

The separate bridge build is available for development (do not treat a successful
link as SSH runtime validation):

```sh
python3 harmony/napi/build-ssh.py \
  --ohos-native /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native \
  --ssh-deps /private/tmp/t3-ssh-deps \
  --output /private/tmp/t3-ssh-bridge
cp /private/tmp/t3-ssh-bridge/libt3_ssh.so harmony/app/entry/libs/arm64-v8a/
clang++ -std=c++17 -I harmony/napi/ssh \
  -I /private/tmp/t3-ssh-deps/libssh2-1.11.1/include \
  harmony/tests/native/ssh_host_key_test.cpp -o /private/tmp/t3-ssh-hostkey-test
/private/tmp/t3-ssh-hostkey-test
```



Open **Settings → Environment connections** to view saved endpoints, switch
environments, or pair another direct or SSH connection. The current connection
is marked in the list. Switching closes the previous client transport; saved
credentials remain available after a failed connection attempt. Forget asks for
confirmation and disconnects the selected connection if it is current.

Open **Settings → Archived threads** to view the current environment’s archived
tasks. This clears the home search and project filter. Choose newest or oldest
archive order, and use a task’s menu to restore it from the archive. Search
accepts task titles, branches, project names, workspace paths, and the environment
name. Opening an archived task asks you to restore it first, then opens its
messages and original workspace after the server confirms restoration.

In **Settings**, choose **Project grouping** to combine matching repositories,
combine only matching repository-relative paths, or keep workspaces separate.
The home project filter includes tasks from every member of the selected group;
opening a task still uses its original workspace. The default is grouping by
repository, and the choice is saved on this device. Projects without repository
identity remain separate by workspace path.

Open **Settings** from the home screen or terminal to adjust the base text size
from 11 to 22. Code and diff text (8–18) and terminal text (6–14, in half-point
steps) follow the base size automatically until you set a custom size. Choosing
**Auto** resumes that behavior. At the default base size of 16, automatic code
and terminal sizes are 12 and 10.5. Preferences are saved on this device for all
environments; terminal font changes also resize the terminal grid.
Enable **Code word break** to wrap file source text to the screen width. With
it disabled, swipe horizontally to read long lines. This preference is also
saved on this device.
Appearance controls also save separate light and dark theme choices, with an
option to follow the system. Themes apply to native pages, review diffs, and
terminal output, including existing terminal history. Programs can still set
their own terminal colors.

The UI remains a prototype. Rich messages, attachments, settings, project and
worktree creation, and reliable command retry still need work. Approval choices,
long network outages, and system background recovery need broader device
verification. Terminal interaction and the SSH native backend remain incomplete.

Before updating the Swift vendor, adapt the compatibility APIs for the newer
Ghostty clipboard callback and `UTType.svg`. The current shims do not compile
against those upstream changes. The original all-in-one `napi/build-ohos.sh` remains unfinished. The separate
Swift bridge recipe above does not supply the missing terminal or SSH backends.

Use the upstream iOS client in an iOS Simulator as the behavior reference, and
verify the corresponding Harmony flows on a physical device. Do not substitute
mock results, host-only tests, or an empty screen for this acceptance work.
