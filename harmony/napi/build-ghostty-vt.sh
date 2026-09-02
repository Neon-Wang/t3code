#!/usr/bin/env bash
# libghostty-vt 的 OHOS(aarch64 musl) 构建 —— Docker Linux 宿主路线。
#
# 为什么在容器里：zig 的 HTTP/git 客户端被 deps.files.ghostty.org 与 GitHub
# 拒（curl 正常、zig 400/HttpConnectionClosing），且 zig 0.15.2（Ghostty 锁定
# 版本）与 macOS 27 SDK 的 libSystem 桩不兼容。Linux 宿主 zig 一切正常；
# 依赖由宿主 curl 预下载后 zig fetch 本地文件入缓存，全程无 zig 网络访问。
#
# 产物：lib/libghostty-vt.so.0.1.0 + lib/libghostty-vt.a + include/ghostty/
# 与上游 Android 构建同源（native/libghostty-vt 是唯一 pin）。
set -euo pipefail

HARMONY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$HARMONY_ROOT/.." && pwd)"
REV="${GHOSTTY_REVISION:-9f62873bf195e4d8a762d768a1405a5f2f7b1697}"
ZIG_VERSION="0.15.2"
CACHE="$HOME/.cache/t3code"
SRC="$CACHE/ghostty-${REV:0:8}"
DEPS="$CACHE/ghostty-zig-deps"
GITDEPS="$CACHE/ghostty-zig-gitdeps"
OUT="${1:-$HARMONY_ROOT/napi/build/ohos-arm64/ghostty}"

command -v docker >/dev/null || { echo "需要 docker" >&2; exit 2; }
export https_proxy="${https_proxy:-http://127.0.0.1:7897}"
export http_proxy="${http_proxy:-http://127.0.0.1:7897}"

# 1) 源码（pin）
if [ ! -d "$SRC/.git" ]; then
  git clone --filter=blob:none --no-checkout https://github.com/ghostty-org/ghostty.git "$SRC"
  git -C "$SRC" fetch --depth=1 origin "$REV"
  git -C "$SRC" checkout --detach "$REV"
fi

# 2) 依赖闭包（宿主 curl 下载；扫描源码树全部 *.zon 的 .url）
mkdir -p "$DEPS" "$GITDEPS"
python3 - "$SRC" "$DEPS" <<'PYEOF'
import re, subprocess, sys, tarfile
from pathlib import Path

src, deps = Path(sys.argv[1]), Path(sys.argv[2])
pattern = re.compile(r'\.url\s*=\s*"([^"]+)"')
urls = set()
for zon in src.rglob("*.zon"):
    urls.update(pattern.findall(zon.read_text()))
for archive in deps.glob("*.tar.*"):
    try:
        with tarfile.open(archive) as bundle:
            for member in bundle.getmembers():
                if member.name.endswith(".zon"):
                    content = bundle.extractfile(member)
                    if content:
                        urls.update(pattern.findall(content.read().decode("utf-8", "replace")))
    except Exception:
        pass
for url in sorted(u for u in urls if u.startswith("https://")):
    name = url.rsplit("/", 1)[-1]
    if name == "COMMIT.tar.gz":  # zon 里的模板占位
        continue
    destination = deps / name
    if destination.exists():
        continue
    print(f"[deps] {name}")
    subprocess.run(["curl", "-fsSL", "--retry", "3", url, "-o", str(destination)], check=True)
PYEOF

# 3) git 依赖（本地 clone 固定 ref）
clone_at() {
  local url="$1" name="$2" ref="${3:-}"
  if [ ! -d "$GITDEPS/$name/.git" ]; then
    git clone "$url" "$GITDEPS/$name"
  fi
  if [ -n "$ref" ]; then
    git -C "$GITDEPS/$name" fetch --depth=1 origin "$ref"
    git -C "$GITDEPS/$name" checkout --detach "$ref"
  fi
}
clone_at https://github.com/jacobsandlund/uucode.git uucode 5f05f8f83a75caea201f12cc8ea32a2d82ea9732
clone_at https://github.com/hendriknielaender/zBench.git zBench 7069bb9c3e2e4773ff93995a85238b8e08039ba0
clone_at https://github.com/zigimg/zigimg.git zigimg ""

# 4) 容器内构建（zig 常驻在依赖卷，重复构建秒级）
mkdir -p "$OUT"
docker run --rm --platform linux/arm64 \
  -v "$SRC":/src -v "$DEPS":/deps -v "$GITDEPS":/gitdeps -v "$OUT":/out \
  alpine:latest sh -c '
set -e
apk add --no-cache curl xz git tar >/dev/null
mkdir -p /deps/zig-linux
[ -x /deps/zig-linux/zig ] || curl -fsSL '"https://ziglang.org/download/$ZIG_VERSION/zig-aarch64-linux-$ZIG_VERSION.tar.xz"' | tar -xJ --strip-components=1 -C /deps/zig-linux
for f in /deps/*.tar.gz /deps/*.tar.xz /deps/*.tar.zst /deps/*.tgz; do
  [ -f "$f" ] || continue
  /deps/zig-linux/zig fetch --global-cache-dir /root/.cache/zig "$f" >/dev/null 2>&1 || true
done
for repo in uucode zBench zigimg; do
  /deps/zig-linux/zig fetch --global-cache-dir /root/.cache/zig /gitdeps/$repo >/dev/null 2>&1 || true
done
cd /src
/deps/zig-linux/zig build -Demit-lib-vt -Dtarget=aarch64-linux-musl -Doptimize=ReleaseFast -Dstrip=true -Dsimd=false -p /out
'
echo "完成：$OUT/lib/libghostty-vt.so.0.1.0（+ .a + include/ghostty）"
