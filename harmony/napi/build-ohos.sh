#!/usr/bin/env bash
# OpenHarmony 设备侧构建：把 Swift 核心与 NAPI 层编译进应用可加载的 .so。
#
# 前置（见 harmony/README.md「工具链现状」）：
#   - OHOS SDK：默认 ~/ohos-sdk（OpenHarmony 5.0.3 mac-public，darwin-x64
#     组件经 Rosetta 2 在 Apple Silicon 上运行，已在本仓验证）
#   - 支持 aarch64-unknown-linux-ohos 的 Swift 工具链（社区交叉 SDK 或自建）
#   - node 头文件（NAPI 模块编译）
#
# 用法：bash harmony/napi/build-ohos.sh [arm64|x64]
set -euo pipefail

HARMONY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH="${1:-arm64}"
OUT_DIR="$HARMONY_ROOT/napi/build/ohos-$ARCH"
mkdir -p "$OUT_DIR"

OHOS_SDK="${OHOS_SDK:-$HOME/ohos-sdk}"
if [ ! -d "$OHOS_SDK/native/sysroot" ]; then
  echo "OHOS SDK 不完整：$OHOS_SDK/native/sysroot 缺失（安装见 harmony/README.md）" >&2
  exit 2
fi
# Swift OHOS 交叉工具链（swift.org 6.3.3 静态 musl SDK 改造版，
# 见 ~/ohos-swift-toolchain；SwiftPM 经 --swift-sdk aarch64-swift-linux-ohos 构建）
OHOS_SWIFT_TOOLCHAIN="${OHOS_SWIFT_TOOLCHAIN:-$HOME/ohos-swift-toolchain/toolchain}"
if [ ! -d "$OHOS_SWIFT_TOOLCHAIN/usr/bin" ]; then
  echo "Swift OHOS 工具链缺失：$OHOS_SWIFT_TOOLCHAIN（搭建记录见 harmony/README.md）" >&2
  exit 2
fi

case "$ARCH" in
  arm64) OHOS_TRIPLE="aarch64-linux-ohos"; SWIFT_TRIPLE="aarch64-unknown-linux-ohos" ;;
  x64) OHOS_TRIPLE="x86_64-linux-ohos"; SWIFT_TRIPLE="x86_64-unknown-linux-ohos" ;;
  *) echo "未知架构 $ARCH" >&2; exit 2 ;;
esac
CLANG_WRAPPER="$OHOS_SDK/native/llvm/bin/${OHOS_TRIPLE}-clang++"
[ -x "$CLANG_WRAPPER" ] || CLANG_WRAPPER="$CLANG"

NATIVE_SYSROOT="$OHOS_SDK/native/sysroot"
# SDK 的三元组包装器已内嵌 --sysroot、OHOS 链接器配置与 lld，优先使用。
CLANG_WRAPPER="$OHOS_SDK/native/llvm/bin/${OHOS_TRIPLE//-/-}-clang++"
CLANG="$OHOS_SDK/native/llvm/bin/clang++"
SWIFTC="$OHOS_SWIFT_TOOLCHAIN/usr/bin/swiftc"

echo "==> 1/5 Swift 核心（SwiftPM --swift-sdk，静态库 + C-ABI 对象）"
SWIFT_BUILD_SCRATCH="${SWIFT_BUILD_SCRATCH:-$OUT_DIR/swift-build}"
(cd "$HARMONY_ROOT" && "$OHOS_SWIFT_TOOLCHAIN/usr/bin/swift" build \
  --swift-sdk "$SWIFT_TRIPLE" \
  --scratch-path "$SWIFT_BUILD_SCRATCH" \
  --product T3SwiftCore)
cp "$SWIFT_BUILD_SCRATCH/$SWIFT_TRIPLE/debug/libT3SwiftCore.a" "$OUT_DIR/"
# C-ABI 目标单独出对象（NAPI 层的 C 符号实体）。
(cd "$HARMONY_ROOT" && "$OHOS_SWIFT_TOOLCHAIN/usr/bin/swift" build \
  --swift-sdk "$SWIFT_TRIPLE" \
  --scratch-path "$SWIFT_BUILD_SCRATCH" \
  --target T3CABI)
find "$SWIFT_BUILD_SCRATCH/$SWIFT_TRIPLE/debug/T3CABI.build" -name "*.o" -exec cp {} "$OUT_DIR/t3cabi.o" \;

echo "==> 2/5 libssh2（源码 vendoring）"
if [ ! -f "$OUT_DIR/libssh2.a" ]; then
  LIBSSH2_SRC="$OUT_DIR/libssh2-src"
  if [ ! -d "$LIBSSH2_SRC" ]; then
    git clone --depth 1 --branch libssh2-1.11.1 https://github.com/libssh2/libssh2.git "$LIBSSH2_SRC"
  fi
  cmake -S "$LIBSSH2_SRC" -B "$LIBSSH2_SRC/build" \
    -DCMAKE_SYSTEM_NAME=OHOS \
    -DCMAKE_SYSTEM_PROCESSOR="$OHOS_TRIPLE" \
    -DCMAKE_SYSROOT="$NATIVE_SYSROOT" \
    -DCMAKE_C_COMPILER="$OHOS_SDK/native/llvm/bin/clang" \
    -DBUILD_SHARED_LIBS=OFF \
    -DBUILD_TESTING=OFF \
    -DBUILD_EXAMPLES=OFF \
    -DOPENSSL_ROOT_DIR="$OUT_DIR/openssl" \
    -DCRYPTO_BACKEND=OpenSSL \
    -DCMAKE_INSTALL_PREFIX="$OUT_DIR/libssh2-install"
  cmake --build "$LIBSSH2_SRC/build" --target install -- -j"$(nproc)"
fi

echo "==> 3/5 libghostty-vt（终端后端，pin 于 native/libghostty-vt）"
GHOSTTY_OUT="$HARMONY_ROOT/napi/build/ohos-$ARCH/ghostty"
if [ ! -f "$GHOSTTY_OUT/lib/libghostty-vt.a" ]; then
  echo "    （构建 libghostty-vt：Docker Linux 宿主路线）"
  bash "$HARMONY_ROOT/napi/build-ghostty-vt.sh" "$GHOSTTY_OUT"
fi

echo "==> 4/5 NAPI 模块（t3bridge + t3_ssh）"
for module in t3_bridge "ssh/t3_ssh_tunnel"; do
  name="$(basename "$module" .cpp)"
  "$CLANG_WRAPPER" -std=c++17 -shared -fPIC -O2 \
    -I"$OHOS_SDK/native/sysroot/usr/include" \
    -I"$OUT_DIR/libssh2-install/include" \
    -o "$OUT_DIR/lib${name}.so" \
    "$HARMONY_ROOT/napi/$module.cpp" \
    "$OUT_DIR/t3cabi.o" \
    "$OUT_DIR/libT3SwiftCore.a" \
    $( [ "$name" = "t3_bridge" ] && echo "$GHOSTTY_OUT/lib/libghostty-vt.a" ) \
    $( [ "$name" = "t3_ssh" ] && echo "$OUT_DIR/libssh2-install/lib/libssh2.a" ) \
    -lstdc++ -lc++ -lm
done

echo "==> 5/5 产物"
ls -la "$OUT_DIR"/*.so || true
echo "完成：把 .so 拷入 harmony/app/entry/libs/$ARCH/ 后用 DevEco/hvigor 构建应用。"
