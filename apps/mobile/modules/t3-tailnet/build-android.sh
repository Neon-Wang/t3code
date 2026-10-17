#!/usr/bin/env bash
set -euo pipefail
module_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
sdk_dir="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ndk_dir="${ANDROID_NDK_HOME:-$sdk_dir/ndk/27.2.12479018}"
case "$(uname -s)" in Darwin) host_tag=darwin-x86_64 ;; Linux) host_tag=linux-x86_64 ;; *) echo 'Unsupported build host' >&2; exit 1 ;; esac
arch="${1:-arm64-v8a}"
case "$arch" in
  arm64-v8a) go_arch=arm64; compiler=aarch64-linux-android28-clang ;;
  x86_64) go_arch=amd64; compiler=x86_64-linux-android28-clang ;;
  *) echo 'Build arm64-v8a or x86_64' >&2; exit 1 ;;
esac
output="$module_dir/android/src/main/jniLibs/$arch"
mkdir -p "$output"
cd "$module_dir/native"
GOOS=android GOARCH="$go_arch" CGO_ENABLED=1 CC="$ndk_dir/toolchains/llvm/prebuilt/$host_tag/bin/$compiler"
export GOOS GOARCH CGO_ENABLED CC
go build -mod=readonly -trimpath -buildmode=c-shared -ldflags='-s -w -extldflags=-Wl,-z,max-page-size=16384,-soname,libtailnet_go.so' -o "$output/libtailnet_go.so" .
